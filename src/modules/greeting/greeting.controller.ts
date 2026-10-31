import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../../middleware/auth';
import { resolveBranchScope, isGlobalUser } from '../../middleware/rbacScope';
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
    const { branch_id } = req.query;
    let branchFilter = '';
    const params: any[] = [];

    if (branch_id && branch_id !== 'ALL' && branch_id !== 'undefined' && branch_id !== 'null') {
      branchFilter = `
        AND (
          c.target_branch_scope = 'ALL_STORES' OR
          c.target_branch_ids IS NULL OR
          JSON_CONTAINS(c.target_branch_ids, JSON_QUOTE(?))
        )
      `;
      params.push(String(branch_id));
    }

    const [rows]: any = await pool.query(`
      SELECT 
        c.*,
        bm.name as target_brand_name
      FROM retail_greeting_ho_campaigns c
      LEFT JOIN retail_brand_master bm ON c.target_brand_priority_id = bm.id
      WHERE c.is_active = TRUE AND CURDATE() BETWEEN c.start_date AND c.end_date
      ${branchFilter}
      ORDER BY c.created_at DESC
    `, params);

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch HO campaigns', error: error.message });
  }
};

/**
 * Create / Update HO Campaign (Enforcing RBAC ho:sales:greet:manage)
 */
export const createHoCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const roles: string[] = (req.user?.roles || []).map((r: any) => typeof r === 'string' ? r : r.name);
    const isHoAuthorized = isGlobalUser(req) || roles.some(r => 
      ['SUPER_ADMIN', 'HO_SALES_DIRECTOR', 'COMMERCIAL_OPS_MANAGER', 'HO_STAFF'].includes(r)
    );

    if (!isHoAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'RBAC Access Denied: Only Head Office Commercial leadership can broadcast greeting campaigns.'
      });
    }

    const {
      campaign_name,
      welcome_headline,
      media_type = 'IMAGE',
      media_url,
      banner_image_url,
      thumbnail_url,
      intake_questions_json,
      target_brand_priority_id,
      target_branch_scope = 'ALL_STORES',
      target_branch_ids_json,
      start_date,
      end_date
    } = req.body;

    const campaignId = uuidv4();
    await pool.query(`
      INSERT INTO retail_greeting_ho_campaigns (
        id, campaign_name, welcome_headline, media_type, media_url, banner_image_url, thumbnail_url,
        intake_questions_json, target_brand_priority_id, target_branch_scope, target_branch_ids_json,
        start_date, end_date, is_active, created_by_ho_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)
    `, [
      campaignId,
      campaign_name,
      welcome_headline,
      media_type,
      media_url || null,
      banner_image_url || null,
      thumbnail_url || null,
      intake_questions_json ? JSON.stringify(intake_questions_json) : null,
      target_brand_priority_id || null,
      target_branch_scope,
      target_branch_ids_json ? JSON.stringify(target_branch_ids_json) : null,
      start_date,
      end_date,
      req.user?.id || 'ho-sales-admin'
    ]);

    res.status(201).json({ success: true, message: 'HO Greeting campaign broadcasted successfully', data: { id: campaignId } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to create campaign', error: error.message });
  }
};

/**
 * Update Existing HO Campaign or Toggle Active Status (RBAC Protected)
 */
export const updateHoCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const roles: string[] = (req.user?.roles || []).map((r: any) => typeof r === 'string' ? r : r.name);
    const isHoAuthorized = isGlobalUser(req) || roles.some(r => 
      ['SUPER_ADMIN', 'HO_SALES_DIRECTOR', 'COMMERCIAL_OPS_MANAGER', 'HO_STAFF'].includes(r)
    );

    if (!isHoAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'RBAC Access Denied: Only Head Office Commercial leadership can edit broadcast campaigns.'
      });
    }

    const campaignId = String(req.params.id);
    const {
      campaign_name,
      welcome_headline,
      media_type,
      media_url,
      banner_image_url,
      thumbnail_url,
      target_brand_priority_id,
      target_branch_scope,
      target_branch_ids_json,
      start_date,
      end_date,
      is_active,
      intake_questions_json
    } = req.body;

    await pool.query(`
      UPDATE retail_greeting_ho_campaigns
      SET
        campaign_name = COALESCE(?, campaign_name),
        welcome_headline = COALESCE(?, welcome_headline),
        media_type = COALESCE(?, media_type),
        media_url = COALESCE(?, media_url),
        banner_image_url = COALESCE(?, banner_image_url),
        thumbnail_url = COALESCE(?, thumbnail_url),
        target_brand_priority_id = ?,
        target_branch_scope = COALESCE(?, target_branch_scope),
        target_branch_ids_json = ?,
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        is_active = COALESCE(?, is_active),
        intake_questions_json = COALESCE(?, intake_questions_json)
      WHERE id = ?
    `, [
      campaign_name || null,
      welcome_headline || null,
      media_type || null,
      media_url || null,
      banner_image_url || null,
      thumbnail_url || null,
      target_brand_priority_id !== undefined ? (target_brand_priority_id || null) : null,
      target_branch_scope || null,
      target_branch_ids_json !== undefined ? (JSON.stringify(target_branch_ids_json) || null) : null,
      start_date || null,
      end_date || null,
      is_active !== undefined ? is_active : null,
      intake_questions_json !== undefined ? (typeof intake_questions_json === 'string' ? intake_questions_json : JSON.stringify(intake_questions_json)) : null,
      campaignId
    ]);

    res.json({ success: true, message: 'Broadcast campaign updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to update campaign', error: error.message });
  }
};

/**
 * List Greeting Terminals
 */
export const getGreetingTerminals = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id } = req.query;
    const { targetBranchId } = await resolveBranchScope(req, branch_id as string);

    let query = `
      SELECT 
        t.*,
        b.name as branch_name,
        b.city,
        b.state,
        c.campaign_name as assigned_campaign_name,
        c.welcome_headline as assigned_campaign_headline
      FROM retail_greeting_terminals t
      LEFT JOIN imago_org_db.branches b ON t.branch_id = b.id
      LEFT JOIN retail_greeting_ho_campaigns c ON t.active_ho_campaign_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (targetBranchId) {
      query += ' AND t.branch_id = ?';
      params.push(targetBranchId);
    }

    query += ' ORDER BY b.name ASC, t.terminal_code ASC';

    const [rows]: any = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch greeting terminals', error: error.message });
  }
};

/**
 * Update Terminal Unit Configuration (Campaign Assignment, Setup PIN, Hardware Details)
 */
export const updateGreetingTerminal = async (req: AuthRequest, res: Response) => {
  try {
    const terminalId = String(req.params.id);
    const { active_ho_campaign_id, paired_setup_pin, device_name, floor_zone, device_model } = req.body;

    await pool.query(`
      UPDATE retail_greeting_terminals
      SET
        active_ho_campaign_id = ?,
        paired_setup_pin = COALESCE(?, paired_setup_pin),
        device_name = COALESCE(?, device_name),
        floor_zone = COALESCE(?, floor_zone),
        device_model = COALESCE(?, device_model)
      WHERE id = ? OR terminal_code = ?
    `, [
      active_ho_campaign_id !== undefined ? (active_ho_campaign_id || null) : null,
      paired_setup_pin || null,
      device_name || null,
      floor_zone || null,
      device_model || null,
      terminalId,
      terminalId
    ]);

    res.json({ success: true, message: 'Greeting terminal configuration updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to update terminal', error: error.message });
  }
};

/**
 * Register a New Greeting Terminal Unit (RBAC: Store Manager / IT Admin)
 */
export const registerGreetingTerminal = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id, terminal_code, device_name, floor_zone, device_model, paired_setup_pin } = req.body;
    const { targetBranchId } = await resolveBranchScope(req, branch_id);

    if (!targetBranchId || !terminal_code || !device_name) {
      return res.status(400).json({ success: false, message: 'branch_id, terminal_code, and device_name are required' });
    }

    const terminalId = uuidv4();
    await pool.query(`
      INSERT INTO retail_greeting_terminals (
        id, branch_id, terminal_code, device_name, floor_zone, device_model, paired_setup_pin, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
    `, [
      terminalId,
      targetBranchId,
      terminal_code.toUpperCase().trim(),
      device_name.trim(),
      floor_zone || 'Main Showroom Entrance',
      device_model || 'Apple iPad 10.9-inch',
      paired_setup_pin || '4006'
    ]);

    res.status(201).json({
      success: true,
      message: 'Greeting terminal unit registered successfully',
      data: { id: terminalId, terminal_code }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to register terminal unit', error: error.message });
  }
};

/**
 * Record Terminal Heartbeat Telemetry (Auto-fired every 60s by active kiosk)
 */
export const recordTerminalHeartbeat = async (req: AuthRequest, res: Response) => {
  try {
    const terminalCodeOrId = String(req.params.id);
    const { employee_id, ip_address } = req.body;

    await pool.query(`
      UPDATE retail_greeting_terminals
      SET 
        last_heartbeat_at = NOW(),
        active_greeter_id = COALESCE(?, active_greeter_id),
        ip_address = COALESCE(?, ip_address)
      WHERE id = ? OR terminal_code = ?
    `, [employee_id || null, ip_address || null, terminalCodeOrId, terminalCodeOrId]);

    res.json({
      success: true,
      message: 'Terminal heartbeat acknowledged',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to record heartbeat', error: error.message });
  }
};

/**
 * Get HO Sales Fleet Overview across all Showrooms & Greeting Units
 */
export const getFleetOverview = async (req: AuthRequest, res: Response) => {
  try {
    const roles: string[] = (req.user?.roles || []).map((r: any) => typeof r === 'string' ? r : r.name);
    const isHo = isGlobalUser(req) || roles.some(r => 
      ['SUPER_ADMIN', 'HO_SALES_DIRECTOR', 'COMMERCIAL_OPS_MANAGER', 'HO_STAFF'].includes(r)
    );

    let branchFilter = '';
    const params: any[] = [];

    // If branch-scoped manager, limit to their branch
    if (!isHo && req.user?.branch_id) {
      branchFilter = 'WHERE t.branch_id = ?';
      params.push(req.user.branch_id);
    }

    const [rows]: any = await pool.query(`
      SELECT 
        t.id as terminal_id,
        t.branch_id,
        COALESCE(b.name, 'Flagship Showroom') as branch_name,
        COALESCE(b.city, 'Bengaluru') as city,
        COALESCE(b.state, 'Karnataka') as state,
        t.terminal_code,
        t.device_name,
        t.device_model,
        t.floor_zone,
        t.last_heartbeat_at,
        t.paired_setup_pin,
        CASE 
          WHEN t.last_heartbeat_at >= NOW() - INTERVAL 5 MINUTE THEN 'ONLINE'
          WHEN t.last_heartbeat_at >= NOW() - INTERVAL 60 MINUTE THEN 'STANDBY'
          ELSE 'OFFLINE'
        END as connectivity_status,
        COALESCE(tc.campaign_name, def_c.campaign_name) as active_campaign_name,
        COALESCE(tc.welcome_headline, def_c.welcome_headline) as welcome_headline,
        COALESCE(tc.media_type, def_c.media_type) as media_type,
        COALESCE(tc.media_url, def_c.media_url) as media_url,
        COALESCE(tc.banner_image_url, def_c.banner_image_url) as banner_image_url,
        COALESCE(tc.thumbnail_url, def_c.thumbnail_url) as thumbnail_url,
        u.full_name as greeter_name,
        (
          SELECT COUNT(*) 
          FROM retail_greeting_logs gl 
          WHERE gl.terminal_id = t.id AND DATE(gl.greeted_at) = CURDATE()
        ) as today_intakes_count
      FROM retail_greeting_terminals t
      LEFT JOIN imago_org_db.branches b ON t.branch_id = b.id
      LEFT JOIN retail_greeting_ho_campaigns tc ON t.active_ho_campaign_id = tc.id
      LEFT JOIN (
        SELECT id, campaign_name, welcome_headline, media_type, media_url, banner_image_url, thumbnail_url
        FROM retail_greeting_ho_campaigns
        WHERE is_active = TRUE AND CURDATE() BETWEEN start_date AND end_date
        ORDER BY created_at DESC
        LIMIT 1
      ) def_c ON t.active_ho_campaign_id IS NULL
      LEFT JOIN imago_iam_db.users u ON t.active_greeter_id = u.id
      ${branchFilter}
      ORDER BY b.name ASC, t.terminal_code ASC
    `, params);

    // Compute fleet metrics
    const totalTerminals = rows.length;
    const onlineTerminals = rows.filter((r: any) => r.connectivity_status === 'ONLINE').length;
    const totalIntakesToday = rows.reduce((acc: number, r: any) => acc + (Number(r.today_intakes_count) || 0), 0);
    const uniqueBranches = new Set(rows.map((r: any) => r.branch_id)).size;

    res.json({
      success: true,
      data: {
        summary: {
          total_branches: uniqueBranches,
          total_terminals: totalTerminals,
          online_terminals: onlineTerminals,
          offline_terminals: totalTerminals - onlineTerminals,
          total_intakes_today: totalIntakesToday
        },
        fleet: rows
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch fleet overview', error: error.message });
  }
};
