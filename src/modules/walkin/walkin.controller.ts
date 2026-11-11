import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../../middleware/auth';
import { resolveBranchScope, isGlobalUser } from '../../middleware/rbacScope';
import { salesCommandService } from '../sales-command/sales.service';

export const createWalkIn = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const {
      branch_id,
      customer_phone,
      customer_name,
      primary_category_id,
      primary_category_name,
      assigned_employee_id,
      assigned_employee_name
    } = req.body;

    const { targetBranchId } = await resolveBranchScope(req, branch_id);
    if (!targetBranchId) {
      return res.status(400).json({ success: false, message: 'branch_id is required' });
    }

    await connection.beginTransaction();

    // 1. Generate human-readable session number
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [countRows]: any = await connection.query(
      'SELECT COUNT(*) as c FROM retail_walkin_sessions WHERE DATE(entered_at) = CURDATE() AND branch_id = ?',
      [targetBranchId]
    );
    const seq = String((countRows[0]?.c || 0) + 1).padStart(3, '0');
    const sessionNumber = `WIN-${todayStr}-${seq}`;

    // 2. Determine customer type
    let customerType = 'ANONYMOUS';
    if (customer_phone && customer_phone.trim().length >= 10) {
      const [history]: any = await connection.query(
        'SELECT COUNT(*) as visits FROM retail_walkin_sessions WHERE customer_phone = ?',
        [customer_phone.trim()]
      );
      customerType = (history[0]?.visits > 0) ? 'RETURNING' : 'NEW';
    }

    const sessionId = uuidv4();
    const isAssigned = Boolean(assigned_employee_id);
    const initialStatus = isAssigned ? 'ENGAGED' : 'ENTERED';

    await connection.query(
      `INSERT INTO retail_walkin_sessions (
        id, branch_id, session_number, customer_phone, customer_name, customer_type,
        primary_category_id, primary_category_name, assigned_employee_id, assigned_employee_name,
        greeter_employee_id, status, entered_at, engaged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        sessionId,
        targetBranchId,
        sessionNumber,
        customer_phone?.trim() || null,
        customer_name?.trim() || null,
        customerType,
        primary_category_id || null,
        primary_category_name || null,
        assigned_employee_id || null,
        assigned_employee_name || null,
        req.user?.id || null,
        initialStatus,
        isAssigned ? new Date() : null
      ]
    );

    // 3. Record state transition in audit timeline
    await connection.query(
      `INSERT INTO retail_session_timeline (id, session_id, from_status, to_status, triggered_by_user_id, notes)
       VALUES (UUID(), ?, NULL, ?, ?, ?)`,
      [
        sessionId,
        initialStatus,
        req.user?.id || null,
        isAssigned ? `Assigned to ${assigned_employee_name} on entry` : 'Customer entered showroom'
      ]
    );

    await connection.commit();

    const [created]: any = await connection.query('SELECT * FROM retail_walkin_sessions WHERE id = ?', [sessionId]);
    res.status(201).json({ success: true, message: 'Walk-in session registered', data: created[0] });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to create walk-in session', error: error.message });
  } finally {
    connection.release();
  }
};

export const getActiveWalkIns = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id } = req.query;
    const { targetBranchId, branchCode } = await resolveBranchScope(req, branch_id as string);

    let query = `
      SELECT s.*,
             TIMESTAMPDIFF(MINUTE, s.entered_at, NOW()) as dwell_minutes,
             TIMESTAMPDIFF(SECOND, s.entered_at, NOW()) as dwell_seconds,
             CASE 
               WHEN s.status = 'ENTERED' AND TIMESTAMPDIFF(MINUTE, s.entered_at, NOW()) >= 5 THEN TRUE 
               ELSE FALSE 
             END as is_unassisted_alert,
             t.ticket_number as ho_ticket_number,
             t.requested_discount as ho_requested_discount,
             t.approved_discount as ho_approved_discount,
             t.authorization_code as ho_authorization_code,
             t.status as ho_ticket_status,
             t.product_name as ho_product_name,
             t.product_sku as ho_product_sku,
             t.mrp as ho_mrp,
             t.discount_reason as ho_discount_reason,
             GREATEST(0, TIMESTAMPDIFF(SECOND, NOW(), t.expires_at)) as ho_sla_remaining_seconds
      FROM retail_walkin_sessions s
      LEFT JOIN (
        SELECT t1.*
        FROM ho_price_exception_requests t1
        INNER JOIN (
          SELECT walkin_session_id, MAX(created_at) as max_created
          FROM ho_price_exception_requests
          WHERE walkin_session_id IS NOT NULL
          GROUP BY walkin_session_id
        ) t2 ON t1.walkin_session_id = t2.walkin_session_id AND t1.created_at = t2.max_created
      ) t ON s.id = t.walkin_session_id
      WHERE s.status IN ('ENTERED', 'ENGAGED', 'PENDING_SALES_COMMAND', 'CHECKOUT_INITIATED')
    `;
    const params: any[] = [];

    if (targetBranchId) {
      query += ' AND (s.branch_id = ? OR s.branch_id = ?)';
      params.push(targetBranchId, branchCode || targetBranchId);
    }

    query += ' ORDER BY s.entered_at DESC';
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch active walk-in sessions', error: error.message });
  }
};

export const reassignWalkIn = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { assigned_employee_id, assigned_employee_name } = req.body;

    if (!assigned_employee_id) {
      return res.status(400).json({ success: false, message: 'assigned_employee_id is required' });
    }

    await connection.beginTransaction();

    const [sessionRows]: any = await connection.query('SELECT status, branch_id FROM retail_walkin_sessions WHERE id = ?', [id]);
    if (!sessionRows[0]) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    const session = sessionRows[0];
    if (!isGlobalUser(req) && req.user?.branch_id && session.branch_id !== req.user.branch_id) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot reassign walk-in session from another branch' });
    }

    const previousStatus = sessionRows[0].status;
    const nextStatus = previousStatus === 'ENTERED' ? 'ENGAGED' : previousStatus;

    await connection.query(
      `UPDATE retail_walkin_sessions
       SET assigned_employee_id = ?,
           assigned_employee_name = ?,
           status = ?,
           engaged_at = COALESCE(engaged_at, NOW())
       WHERE id = ?`,
      [assigned_employee_id, assigned_employee_name || 'Staff Associate', nextStatus, id]
    );

    await connection.query(
      `INSERT INTO retail_session_timeline (id, session_id, from_status, to_status, triggered_by_user_id, notes)
       VALUES (UUID(), ?, ?, ?, ?, ?)`,
      [id, previousStatus, nextStatus, req.user?.id || null, `Reassigned to ${assigned_employee_name}`]
    );

    await connection.commit();
    res.json({ success: true, message: 'Walk-in session reassigned successfully' });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to reassign session', error: error.message });
  } finally {
    connection.release();
  }
};

export const logLostOpportunity = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const {
      taxonomy_id,
      product_id,
      brand_id,
      requested_sku,
      customer_budget,
      quoted_price,
      competitor_name,
      competitor_price,
      notes
    } = req.body;

    if (!taxonomy_id) {
      return res.status(400).json({ success: false, message: 'taxonomy_id is required' });
    }

    await connection.beginTransaction();

    const [sessionRows]: any = await connection.query('SELECT * FROM retail_walkin_sessions WHERE id = ?', [id]);
    if (!sessionRows[0]) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    const session = sessionRows[0];

    if (!isGlobalUser(req) && req.user?.branch_id && session.branch_id !== req.user.branch_id) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot log lost opportunities for another branch' });
    }

    // If product_id is supplied without brand_id, look up brand_id
    let resolvedBrandId = brand_id;
    if (product_id && !resolvedBrandId) {
      const [prodRows]: any = await connection.query('SELECT brand_id FROM retail_product_master WHERE id = ?', [product_id]);
      resolvedBrandId = prodRows[0]?.brand_id || null;
    }

    // 1. Mark session as LOST with dwell duration calculation
    await connection.query(
      `UPDATE retail_walkin_sessions
       SET status = 'LOST',
           exited_at = NOW(),
           dwell_duration_seconds = TIMESTAMPDIFF(SECOND, entered_at, NOW())
       WHERE id = ?`,
      [id]
    );

    // 2. Insert lost opportunity details
    const lostId = uuidv4();
    await connection.query(
      `INSERT INTO retail_lost_opportunities (
        id, session_id, branch_id, taxonomy_id, product_id, brand_id, requested_sku,
        customer_budget, quoted_price, competitor_name, competitor_price, notes,
        logged_by_employee_id, logged_by_employee_name, logged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        lostId,
        id,
        session.branch_id,
        taxonomy_id,
        product_id || null,
        resolvedBrandId || null,
        requested_sku || null,
        customer_budget || null,
        quoted_price || null,
        competitor_name || null,
        competitor_price || null,
        notes || null,
        req.user?.id || session.assigned_employee_id || 'UNKNOWN',
        req.user?.full_name || session.assigned_employee_name || 'Staff Associate'
      ]
    );

    // 3. Record timeline transition
    await connection.query(
      `INSERT INTO retail_session_timeline (id, session_id, from_status, to_status, triggered_by_user_id, notes)
       VALUES (UUID(), ?, ?, 'LOST', ?, 'Customer departed without purchase (Lost Opportunity logged)')`,
      [id, session.status, req.user?.id || null]
    );

    await connection.commit();
    res.json({ success: true, message: 'Non-conversion reason recorded successfully' });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to log lost opportunity', error: error.message });
  } finally {
    connection.release();
  }
};

export const manualLinkConversion = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const { id } = req.params;
    const { invoice_number, invoice_amount, payment_method, sold_skus } = req.body;

    if (!invoice_number || !invoice_amount) {
      return res.status(400).json({ success: false, message: 'invoice_number and invoice_amount are required' });
    }

    await connection.beginTransaction();

    const [sessionRows]: any = await connection.query('SELECT * FROM retail_walkin_sessions WHERE id = ?', [id]);
    if (!sessionRows[0]) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    const session = sessionRows[0];

    if (!isGlobalUser(req) && req.user?.branch_id && session.branch_id !== req.user.branch_id) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: 'Forbidden: Cannot convert sessions for another branch' });
    }

    // Mark session as CONVERTED
    await connection.query(
      `UPDATE retail_walkin_sessions
       SET status = 'CONVERTED',
           exited_at = NOW(),
           dwell_duration_seconds = TIMESTAMPDIFF(SECOND, entered_at, NOW())
       WHERE id = ?`,
      [id]
    );

    // Normalize legacy HQ corporate ID to Indiranagar Flagship showroom
    let targetBranch = session.branch_id;
    if (targetBranch === '1aea7937-4abc-4bb3-bb48-283172b49b8c') {
      targetBranch = 'c9832255-2791-401d-88b5-a3d2c870c533';
    }

    const hasWarrantyAttach = Boolean(req.body.has_warranty_attach);
    let brandName = req.body.brand_name || null;
    const productSku = req.body.product_sku || null;

    // Resolve brand FK against retail_brand_master (by id, code, or name)
    let brandId: string | null = null;
    if (req.body.brand_id || brandName) {
      const [brandRows]: any = await connection.query(
        `SELECT id, name FROM retail_brand_master
         WHERE id = ? OR UPPER(code) = UPPER(?) OR ? LIKE CONCAT('%', name, '%')
         ORDER BY (id = ?) DESC LIMIT 1`,
        [req.body.brand_id || '', brandName || '', brandName || '', req.body.brand_id || '']
      );
      if (brandRows.length) {
        brandId = brandRows[0].id;
        brandName = brandName || brandRows[0].name;
      }
    }

    // Record conversion
    await connection.query(
      `INSERT INTO retail_conversions (
        id, session_id, branch_id, invoice_number, invoice_amount, payment_method,
        sales_employee_id, sales_employee_name, sold_skus, has_warranty_attach, brand_name, brand_id, product_sku, converted_at
      ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        targetBranch,
        invoice_number,
        invoice_amount,
        payment_method || 'UPI',
        req.user?.id || session.assigned_employee_id,
        req.user?.full_name || session.assigned_employee_name,
        JSON.stringify(sold_skus || []),
        hasWarrantyAttach ? 1 : 0,
        brandName,
        brandId,
        productSku
      ]
    );

    await connection.query(
      `INSERT INTO retail_session_timeline (id, session_id, from_status, to_status, triggered_by_user_id, notes)
       VALUES (UUID(), ?, ?, 'CONVERTED', ?, ?)`,
      [id, session.status, req.user?.id || null, `Manually linked to Invoice #${invoice_number}`]
    );

    // Real-time Head Office Sales Command pacing update & Spiff Contest Accrual
    try {
      const unitsCount = Array.isArray(sold_skus) && sold_skus.length > 0 ? sold_skus.length : 1;
      await salesCommandService.recordRetailSaleConversion(
        targetBranch,
        Number(invoice_amount),
        unitsCount,
        connection,
        {
          salesEmployeeId: req.user?.id || session.assigned_employee_id,
          salesEmployeeName: req.user?.full_name || session.assigned_employee_name,
          invoiceNumber: invoice_number,
          brandName: brandName
        }
      );
    } catch (pacingErr) {
      console.error('[Manual Convert] Failed to update HO sales pacing:', pacingErr);
    }

    await connection.commit();
    res.json({ success: true, message: 'Walk-in session converted successfully' });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to link conversion', error: error.message });
  } finally {
    connection.release();
  }
};

export const getAllWalkIns = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id, status, search, limit = '20', offset = '0', start_date, end_date } = req.query;
    const { targetBranchId, branchCode } = await resolveBranchScope(req, branch_id as string);

    let query = `
      SELECT s.*,
             TIMESTAMPDIFF(MINUTE, s.entered_at, COALESCE(s.exited_at, NOW())) as dwell_minutes,
             TIMESTAMPDIFF(SECOND, s.entered_at, COALESCE(s.exited_at, NOW())) as dwell_seconds,
             c.invoice_number,
             c.invoice_amount,
             c.payment_method,
             c.sold_skus,
             t.category as lost_reason_category,
             t.label as lost_reason_label,
             lo.requested_sku as intent_sku_name,
             lo.competitor_price,
             lo.notes as lost_notes
      FROM retail_walkin_sessions s
      LEFT JOIN retail_conversions c ON s.id = c.session_id
      LEFT JOIN retail_lost_opportunities lo ON s.id = lo.session_id
      LEFT JOIN retail_reason_taxonomies t ON lo.taxonomy_id = t.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (targetBranchId) {
      query += ' AND (s.branch_id = ? OR s.branch_id = ?)';
      params.push(targetBranchId, branchCode || targetBranchId);
    }

    if (status && status !== 'ALL') {
      query += ' AND s.status = ?';
      params.push(status);
    }

    if (start_date && (start_date as string).trim()) {
      query += ' AND s.entered_at >= ?';
      params.push(`${(start_date as string).trim()} 00:00:00`);
    }

    if (end_date && (end_date as string).trim()) {
      query += ' AND s.entered_at <= ?';
      params.push(`${(end_date as string).trim()} 23:59:59`);
    }

    if (search && (search as string).trim()) {
      const q = `%${(search as string).trim()}%`;
      query += ` AND (
        s.session_number LIKE ? OR 
        s.customer_name LIKE ? OR 
        s.customer_phone LIKE ? OR 
        s.primary_category_name LIKE ? OR 
        s.assigned_employee_name LIKE ? OR
        lo.requested_sku LIKE ?
      )`;
      params.push(q, q, q, q, q, q);
    }

    query += ' ORDER BY s.entered_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [rows] = await pool.query(query, params);

    // Count query
    let countQuery = `
      SELECT COUNT(*) as total
      FROM retail_walkin_sessions s
      LEFT JOIN retail_lost_opportunities lo ON s.id = lo.session_id
      WHERE 1=1
    `;
    const countParams: any[] = [];
    if (targetBranchId && targetBranchId !== 'ALL') {
      countQuery += ' AND (s.branch_id = ? OR s.branch_id = ?)';
      countParams.push(targetBranchId, branchCode || targetBranchId);
    }
    if (status && status !== 'ALL') {
      countQuery += ' AND s.status = ?';
      countParams.push(status);
    }
    if (start_date && (start_date as string).trim()) {
      countQuery += ' AND s.entered_at >= ?';
      countParams.push(`${(start_date as string).trim()} 00:00:00`);
    }
    if (end_date && (end_date as string).trim()) {
      countQuery += ' AND s.entered_at <= ?';
      countParams.push(`${(end_date as string).trim()} 23:59:59`);
    }
    if (search && (search as string).trim()) {
      const q = `%${(search as string).trim()}%`;
      countQuery += ` AND (
        s.session_number LIKE ? OR 
        s.customer_name LIKE ? OR 
        s.customer_phone LIKE ? OR 
        s.primary_category_name LIKE ? OR 
        s.assigned_employee_name LIKE ? OR
        lo.requested_sku LIKE ?
      )`;
      countParams.push(q, q, q, q, q, q);
    }

    const [countRows]: any = await pool.query(countQuery, countParams);

    res.json({
      success: true,
      data: rows,
      total: countRows[0]?.total || 0,
      limit: Number(limit),
      offset: Number(offset)
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch walk-ins', error: error.message });
  }
};

/**
 * GET /api/footfall/customers/lookup
 * Fast lookup for POS auto-population by 10-digit mobile number
 */
export const lookupCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const rawPhone = (req.query.phone as string) || '';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    const branchId = (req.query.branch_id as string) || '';
    const { targetBranchId, branchCode } = await resolveBranchScope(req, branchId);

    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, message: 'Valid 10-digit phone number is required' });
    }

    // 1. Check for ACTIVE walk-in session with this phone
    let activeQuery = `
      SELECT s.*,
             TIMESTAMPDIFF(MINUTE, s.entered_at, NOW()) as dwell_minutes,
             t.ticket_number as ho_ticket_number,
             t.approved_discount as ho_approved_discount,
             t.authorization_code as ho_authorization_code,
             t.status as ho_ticket_status,
             t.product_name as ho_product_name,
             t.product_sku as ho_product_sku
      FROM retail_walkin_sessions s
      LEFT JOIN (
        SELECT t1.*
        FROM ho_price_exception_requests t1
        INNER JOIN (
          SELECT walkin_session_id, MAX(created_at) as max_created
          FROM ho_price_exception_requests
          WHERE walkin_session_id IS NOT NULL
          GROUP BY walkin_session_id
        ) t2 ON t1.walkin_session_id = t2.walkin_session_id AND t1.created_at = t2.max_created
      ) t ON s.id = t.walkin_session_id
      WHERE (s.customer_phone = ? OR s.customer_phone LIKE ?)
        AND s.status IN ('ENTERED', 'ENGAGED', 'PENDING_SALES_COMMAND', 'CHECKOUT_INITIATED')
    `;
    const activeParams: any[] = [cleanPhone, `%${cleanPhone}`];
    if (targetBranchId && targetBranchId !== 'ALL') {
      activeQuery += ' AND (s.branch_id = ? OR s.branch_id = ?)';
      activeParams.push(targetBranchId, branchCode || targetBranchId);
    }
    activeQuery += ' ORDER BY s.entered_at DESC LIMIT 1';

    const [activeRows]: any = await pool.query(activeQuery, activeParams);

    // 2. Lookup customer history if no active walk-in or to enrich customer profile
    const [historyRows]: any = await pool.query(`
      SELECT customer_name, customer_phone, COUNT(*) as total_visits,
             MAX(entered_at) as last_visit
      FROM retail_walkin_sessions
      WHERE (customer_phone = ? OR customer_phone LIKE ?)
        AND customer_name IS NOT NULL
        AND customer_name != 'Anonymous Guest'
      GROUP BY customer_phone, customer_name
      ORDER BY last_visit DESC LIMIT 1
    `, [cleanPhone, `%${cleanPhone}`]);

    const activeSession = activeRows[0] || null;
    const history = historyRows[0] || null;

    if (!activeSession && !history) {
      return res.json({
        success: true,
        found: false,
        message: 'No existing walk-in or customer profile found for this phone.'
      });
    }

    return res.json({
      success: true,
      found: true,
      data: {
        phone: cleanPhone,
        customerName: activeSession?.customer_name || history?.customer_name || '',
        activeSession: activeSession,
        assignedEmployeeId: activeSession?.assigned_employee_id || null,
        assignedEmployeeName: activeSession?.assigned_employee_name || null,
        categoryInterest: activeSession?.primary_category_name || null,
        hoApprovedDiscount: activeSession?.ho_approved_discount ? parseFloat(activeSession.ho_approved_discount) : 0,
        hoAuthorizationCode: activeSession?.ho_authorization_code || null,
        hoTicketNumber: activeSession?.ho_ticket_number || null,
        totalPastVisits: history?.total_visits || (activeSession ? 1 : 0)
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: 'Customer lookup failed', error: error.message });
  }
};
