import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../../middleware/auth';
import { resolveBranchScope } from '../../middleware/rbacScope';
import { PresenceService } from './presence.service';
import { RoutingEngine } from './routing.engine';
import { QueueService } from './queue.service';

/**
 * 3-Second Quick Intake at Greeting Desk
 * Creates walk-in session, logs greeting record, marks staff ENGAGED, and sets SERVICE_ONLY flag if applicable.
 */
export const quickIntakeWalkIn = async (req: AuthRequest, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const {
      branch_id,
      terminal_id,
      customer_phone,
      customer_name,
      primary_category_id,
      primary_category_name,
      requested_brand_id,
      assigned_employee_id,
      assigned_employee_name,
      routing_type = 'ROUND_ROBIN',
      is_service_inquiry = false,
      ho_questionnaire_answers
    } = req.body;

    const { targetBranchId } = await resolveBranchScope(req, branch_id);
    if (!targetBranchId) {
      return res.status(400).json({ success: false, message: 'branch_id is required' });
    }

    await connection.beginTransaction();

    // 1. Resolve terminal ID (use existing or fallback to branch default)
    let effectiveTerminalId = terminal_id;
    if (!effectiveTerminalId) {
      const [termRows]: any = await connection.query(`
        SELECT id FROM retail_greeting_terminals WHERE branch_id = ? AND is_active = TRUE LIMIT 1
      `, [targetBranchId]);
      effectiveTerminalId = termRows[0]?.id;
      
      // Auto-register default terminal if none exists
      if (!effectiveTerminalId) {
        effectiveTerminalId = uuidv4();
        await connection.query(`
          INSERT INTO retail_greeting_terminals (id, branch_id, terminal_code, device_name)
          VALUES (?, ?, CONCAT('GREET-', SUBSTRING(UUID(), 1, 8)), 'Entrance Host Terminal')
        `, [effectiveTerminalId, targetBranchId]);
      }
    }

    // 2. Generate human-readable session number WIN-YYYYMMDD-SEQ
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [countRows]: any = await connection.query(
      'SELECT COUNT(*) as c FROM retail_walkin_sessions WHERE DATE(entered_at) = CURDATE() AND branch_id = ?',
      [targetBranchId]
    );
    const seq = String((countRows[0]?.c || 0) + 1).padStart(3, '0');
    const sessionNumber = `WIN-${todayStr}-${seq}`;

    // 3. Determine Customer History & VIP Status
    let customerType = 'ANONYMOUS';
    let isVip = false;
    const cleanPhone = customer_phone?.trim();

    if (cleanPhone && cleanPhone.length >= 10) {
      const [history]: any = await connection.query(`
        SELECT 
          COUNT(DISTINCT ws.id) as visits,
          COALESCE(SUM(c.invoice_amount), 0) as total_spent
        FROM retail_walkin_sessions ws
        LEFT JOIN retail_conversions c ON ws.id = c.session_id
        WHERE ws.customer_phone = ?
      `, [cleanPhone]);

      const visits = Number(history[0]?.visits) || 0;
      const totalSpent = Number(history[0]?.total_spent) || 0;

      if (visits >= 3 || totalSpent >= 75000) {
        customerType = 'VIP';
        isVip = true;
      } else if (visits > 0) {
        customerType = 'RETURNING';
      } else {
        customerType = 'NEW';
      }
    }

    // 4. Service / Warranty check
    // If inquiry is service/repair, mark status as SERVICE_ONLY so it is bypassed from conversion analytics
    const isService = Boolean(
      is_service_inquiry || 
      (primary_category_name && primary_category_name.toLowerCase().includes('service')) ||
      (primary_category_id && primary_category_id.includes('service'))
    );

    const isAssigned = Boolean(assigned_employee_id);
    let initialStatus = isService ? 'SERVICE_ONLY' : (isAssigned ? 'ENGAGED' : 'ENTERED');

    const sessionId = uuidv4();
    const greetingLogId = uuidv4();

    // 5. Insert into retail_walkin_sessions
    await connection.query(`
      INSERT INTO retail_walkin_sessions (
        id, branch_id, session_number, customer_phone, customer_name, customer_type,
        primary_category_id, primary_category_name, assigned_employee_id, assigned_employee_name,
        greeter_employee_id, status, entered_at, engaged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    `, [
      sessionId,
      targetBranchId,
      sessionNumber,
      cleanPhone || null,
      customer_name?.trim() || null,
      customerType,
      primary_category_id || null,
      primary_category_name || null,
      assigned_employee_id || null,
      assigned_employee_name || null,
      req.user?.id || null,
      initialStatus,
      isAssigned ? new Date() : null
    ]);

    // 6. Insert into retail_greeting_logs
    await connection.query(`
      INSERT INTO retail_greeting_logs (
        id, branch_id, terminal_id, greeter_employee_id, walkin_session_id,
        customer_phone, customer_name, is_vip_customer, primary_category_id,
        requested_brand_id, assigned_employee_id, routing_type, greeted_at, handoff_completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
    `, [
      greetingLogId,
      targetBranchId,
      effectiveTerminalId,
      req.user?.id || 'sys-host',
      sessionId,
      cleanPhone || null,
      customer_name?.trim() || null,
      isVip,
      primary_category_id || 'cat-general',
      requested_brand_id || null,
      assigned_employee_id || 'unassigned',
      routing_type,
      isAssigned ? new Date() : null
    ]);

    // 7. Update staff floor status to ENGAGED
    if (assigned_employee_id) {
      await connection.query(`
        INSERT INTO retail_staff_floor_status (
          employee_id, branch_id, current_status, current_walkin_session_id, status_updated_at
        ) VALUES (?, ?, 'ENGAGED', ?, NOW())
        ON DUPLICATE KEY UPDATE
          current_status = 'ENGAGED',
          current_walkin_session_id = VALUES(current_walkin_session_id),
          status_updated_at = NOW()
      `, [assigned_employee_id, targetBranchId, sessionId]);
    }

    // 8. Record audit timeline entry
    await connection.query(`
      INSERT INTO retail_session_timeline (id, session_id, from_status, to_status, triggered_by_user_id, notes)
      VALUES (UUID(), ?, NULL, ?, ?, ?)
    `, [
      sessionId,
      initialStatus,
      req.user?.id || null,
      isService 
        ? 'Customer greeted at entrance for Service/Repairs (Excluded from sales conversion rate)'
        : (isAssigned ? `Greeted & auto-dispatched to ${assigned_employee_name} via ${routing_type}` : 'Customer checked in at greeting table')
    ]);

    await connection.commit();

    const [createdSession]: any = await connection.query(
      'SELECT * FROM retail_walkin_sessions WHERE id = ?',
      [sessionId]
    );

    res.status(201).json({
      success: true,
      message: 'Customer greeted and dispatched smoothly',
      data: {
        session: createdSession[0],
        greeting_log_id: greetingLogId,
        session_number: sessionNumber,
        customer_type: customerType,
        is_vip: isVip,
        is_service_only: isService,
        assigned_employee: assigned_employee_name || null
      }
    });
  } catch (error: any) {
    await connection.rollback();
    res.status(500).json({ success: false, message: 'Failed to complete greeting triage', error: error.message });
  } finally {
    connection.release();
  }
};

/**
 * Fast Customer Lookup by Phone Number (< 100ms)
 * Used by Greeter Console during live keypad entry to auto-detect VIP status and returning history.
 */
export const lookupCustomerByPhone = async (req: AuthRequest, res: Response) => {
  try {
    const { phone } = req.query;
    if (!phone || typeof phone !== 'string' || phone.trim().length < 6) {
      return res.json({ success: true, data: { exists: false } });
    }

    const cleanPhone = phone.trim();

    const [visits]: any = await pool.query(`
      SELECT 
        ws.customer_name,
        ws.customer_type,
        ws.primary_category_name,
        ws.entered_at,
        c.invoice_amount,
        c.invoice_number
      FROM retail_walkin_sessions ws
      LEFT JOIN retail_conversions c ON ws.id = c.session_id
      WHERE ws.customer_phone = ?
      ORDER BY ws.entered_at DESC
    `, [cleanPhone]);

    if (visits.length === 0) {
      return res.json({
        success: true,
        data: {
          exists: false,
          is_vip: false,
          visits_count: 0,
          customer_name: null,
          total_spend: 0
        }
      });
    }

    const totalSpent = visits.reduce((acc: number, v: any) => acc + (Number(v.invoice_amount) || 0), 0);
    const isVip = visits.length >= 3 || totalSpent >= 75000;
    const latestName = visits.find((v: any) => v.customer_name)?.customer_name || null;

    res.json({
      success: true,
      data: {
        exists: true,
        customer_name: latestName,
        customer_type: isVip ? 'VIP' : (visits.length > 1 ? 'RETURNING' : 'NEW'),
        is_vip: isVip,
        visits_count: visits.length,
        total_spend: totalSpent,
        last_visit_at: visits[0]?.entered_at || null,
        recent_category: visits[0]?.primary_category_name || null
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to lookup customer profile', error: error.message });
  }
};

/**
 * Live Floor Presence Board
 */
export const getStaffFloorPresence = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id } = req.query;
    const { targetBranchId } = await resolveBranchScope(req, branch_id as string);
    if (!targetBranchId) {
      return res.status(400).json({ success: false, message: 'branch_id is required' });
    }

    const presence = await PresenceService.getBranchFloorPresence(targetBranchId);
    res.json({ success: true, data: presence });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch floor staff presence', error: error.message });
  }
};

/**
 * Update Staff Floor Status
 */
export const updateStaffFloorStatus = async (req: AuthRequest, res: Response) => {
  try {
    const employee_id = String(req.params.employee_id);
    const { status, branch_id, floor_zone } = req.body;

    const { targetBranchId } = await resolveBranchScope(req, branch_id);
    if (!targetBranchId || !employee_id) {
      return res.status(400).json({ success: false, message: 'employee_id and branch_id are required' });
    }

    await PresenceService.updateStaffStatus(
      employee_id,
      targetBranchId,
      status || 'AVAILABLE',
      null,
      floor_zone || null
    );

    res.json({ success: true, message: 'Staff floor status updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to update staff status', error: error.message });
  }
};

/**
 * Intelligent Routing Engine Recommendation
 */
export const getRoutingRecommendation = async (req: AuthRequest, res: Response) => {
  try {
    const {
      branch_id,
      category_id,
      category_code,
      requested_brand_id,
      requested_brand_name,
      customer_phone,
      is_service_inquiry
    } = req.body;

    const { targetBranchId } = await resolveBranchScope(req, branch_id);
    if (!targetBranchId) {
      return res.status(400).json({ success: false, message: 'branch_id is required' });
    }

    const rec = await RoutingEngine.evaluateRouting({
      branch_id: targetBranchId,
      category_id,
      category_code,
      requested_brand_id,
      requested_brand_name,
      customer_phone,
      is_service_inquiry
    });

    res.json({ success: true, data: rec });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to evaluate routing', error: error.message });
  }
};

/**
 * Peak-Hour Virtual Queue Token Issue
 */
export const issueQueueToken = async (req: AuthRequest, res: Response) => {
  try {
    const {
      branch_id,
      customer_phone,
      customer_name,
      category_id,
      requested_brand_id,
      prefix
    } = req.body;

    const { targetBranchId } = await resolveBranchScope(req, branch_id);
    if (!targetBranchId || !customer_phone || !category_id) {
      return res.status(400).json({ success: false, message: 'branch_id, customer_phone, and category_id are required' });
    }

    const token = await QueueService.issueToken({
      branch_id: targetBranchId,
      customer_phone,
      customer_name,
      category_id,
      requested_brand_id,
      prefix: prefix || 'T'
    });

    res.status(201).json({ success: true, message: 'Queue token issued successfully', data: token });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to issue queue token', error: error.message });
  }
};

/**
 * Get Active Queue Tokens for Branch
 */
export const getActiveQueueTokens = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id } = req.query;
    const { targetBranchId } = await resolveBranchScope(req, branch_id as string);
    if (!targetBranchId) {
      return res.status(400).json({ success: false, message: 'branch_id is required' });
    }

    const tokens = await QueueService.getActiveTokens(targetBranchId);
    res.json({ success: true, data: tokens });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch queue tokens', error: error.message });
  }
};

/**
 * Call Next Queue Token
 */
export const callQueueToken = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const employeeId = req.user?.id || 'staff';

    const token = await QueueService.callToken(id, employeeId);
    res.json({ success: true, message: 'Customer called', data: token });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to call queue token', error: error.message });
  }
};

/**
 * Update Queue Token Status
 */
export const updateQueueTokenStatus = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    const token = await QueueService.updateTokenStatus(id, status);
    res.json({ success: true, message: `Token marked as ${status}`, data: token });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to update token status', error: error.message });
  }
};

/**
 * Get Active HO Sales Greeting Campaigns
 */
export const getActiveHoCampaigns = async (req: AuthRequest, res: Response) => {
  try {
    const [rows]: any = await pool.query(`
      SELECT 
        c.*,
        bm.name as target_brand_name
      FROM retail_greeting_ho_campaigns c
      LEFT JOIN retail_brand_master bm ON c.target_brand_priority_id = bm.id
      WHERE c.is_active = TRUE AND CURDATE() BETWEEN c.start_date AND c.end_date
      ORDER BY c.created_at DESC
    `);

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch HO campaigns', error: error.message });
  }
};

/**
 * Create / Update HO Campaign
 */
export const createHoCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const {
      campaign_name,
      welcome_headline,
      intake_questions_json,
      target_brand_priority_id,
      target_branch_scope = 'ALL_STORES',
      start_date,
      end_date
    } = req.body;

    const campaignId = uuidv4();
    await pool.query(`
      INSERT INTO retail_greeting_ho_campaigns (
        id, campaign_name, welcome_headline, intake_questions_json,
        target_brand_priority_id, target_branch_scope, start_date, end_date,
        is_active, created_by_ho_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)
    `, [
      campaignId,
      campaign_name,
      welcome_headline,
      intake_questions_json ? JSON.stringify(intake_questions_json) : null,
      target_brand_priority_id || null,
      target_branch_scope,
      start_date,
      end_date,
      req.user?.id || 'ho-sales-admin'
    ]);

    res.status(201).json({ success: true, message: 'HO Greeting campaign created', data: { id: campaignId } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to create campaign', error: error.message });
  }
};

/**
 * List Greeting Terminals
 */
export const getGreetingTerminals = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id } = req.query;
    const { targetBranchId } = await resolveBranchScope(req, branch_id as string);

    let query = 'SELECT * FROM retail_greeting_terminals WHERE 1=1';
    const params: any[] = [];
    if (targetBranchId) {
      query += ' AND branch_id = ?';
      params.push(targetBranchId);
    }

    const [rows]: any = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch greeting terminals', error: error.message });
  }
};
