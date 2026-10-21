import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../../middleware/auth';

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

    const targetBranchId = branch_id || req.user?.branch_id;
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
    let targetBranchId = branch_id as string | undefined;

    // If not super admin and no branch query provided, default to user's branch
    if (!targetBranchId && !req.user?.roles?.includes('SUPER_ADMIN')) {
      targetBranchId = req.user?.branch_id || undefined;
    }

    let query = `
      SELECT s.*,
             TIMESTAMPDIFF(MINUTE, s.entered_at, NOW()) as dwell_minutes,
             TIMESTAMPDIFF(SECOND, s.entered_at, NOW()) as dwell_seconds,
             CASE 
               WHEN s.status = 'ENTERED' AND TIMESTAMPDIFF(MINUTE, s.entered_at, NOW()) >= 5 THEN TRUE 
               ELSE FALSE 
             END as is_unassisted_alert
      FROM retail_walkin_sessions s
      WHERE s.status IN ('ENTERED', 'ENGAGED', 'CHECKOUT_INITIATED')
    `;
    const params: any[] = [];

    if (targetBranchId) {
      query += ' AND s.branch_id = ?';
      params.push(targetBranchId);
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

    const [sessionRows]: any = await connection.query('SELECT status FROM retail_walkin_sessions WHERE id = ?', [id]);
    if (!sessionRows[0]) {
      return res.status(404).json({ success: false, message: 'Session not found' });
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

    // Mark session as CONVERTED
    await connection.query(
      `UPDATE retail_walkin_sessions
       SET status = 'CONVERTED',
           exited_at = NOW(),
           dwell_duration_seconds = TIMESTAMPDIFF(SECOND, entered_at, NOW())
       WHERE id = ?`,
      [id]
    );

    // Record conversion
    await connection.query(
      `INSERT INTO retail_conversions (
        id, session_id, branch_id, invoice_number, invoice_amount, payment_method,
        sales_employee_id, sales_employee_name, sold_skus, converted_at
      ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        session.branch_id,
        invoice_number,
        invoice_amount,
        payment_method || 'UPI',
        req.user?.id || session.assigned_employee_id,
        req.user?.full_name || session.assigned_employee_name,
        JSON.stringify(sold_skus || [])
      ]
    );

    await connection.query(
      `INSERT INTO retail_session_timeline (id, session_id, from_status, to_status, triggered_by_user_id, notes)
       VALUES (UUID(), ?, ?, 'CONVERTED', ?, ?)`,
      [id, session.status, req.user?.id || null, `Manually linked to Invoice #${invoice_number}`]
    );

    await connection.commit();
    res.json({ success: true, message: 'Walk-in session converted successfully' });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to link conversion', error: error.message });
  } finally {
    connection.release();
  }
};
