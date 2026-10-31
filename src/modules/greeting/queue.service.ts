import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';

export interface IssueTokenParams {
  branch_id: string;
  customer_phone: string;
  customer_name?: string;
  category_id: string;
  requested_brand_id?: string;
  prefix?: string;
}

export interface QueueTokenRecord {
  id: string;
  branch_id: string;
  token_number: string;
  customer_phone: string;
  customer_name: string | null;
  requested_brand_id: string | null;
  category_id: string;
  status: 'WAITING' | 'CALLED' | 'ENGAGED' | 'CANCELLED' | 'NO_SHOW';
  created_at: string;
  called_at: string | null;
  served_at: string | null;
  assigned_employee_id: string | null;
  wait_time_minutes: number;
  sms_message: string;
}

export class QueueService {
  /**
   * Issues a new virtual queue token and formats the customer SMS message
   */
  public static async issueToken(params: IssueTokenParams): Promise<QueueTokenRecord> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const prefix = params.prefix || 'T';

      // 1. Calculate today's token sequence for this branch and prefix
      const [countRows]: any = await connection.query(`
        SELECT COUNT(*) as c 
        FROM retail_queue_tokens 
        WHERE branch_id = ? AND DATE(created_at) = CURDATE() AND token_number LIKE ?
      `, [params.branch_id, `${prefix}-%`]);

      const seq = String((countRows[0]?.c || 0) + 1).padStart(3, '0');
      const tokenNumber = `${prefix}-${seq}`;

      // 2. Count customers ahead in line
      const [aheadRows]: any = await connection.query(`
        SELECT COUNT(*) as ahead 
        FROM retail_queue_tokens 
        WHERE branch_id = ? AND status = 'WAITING' AND DATE(created_at) = CURDATE()
      `, [params.branch_id]);
      const queuePosition = (aheadRows[0]?.ahead || 0) + 1;

      const tokenId = uuidv4();

      await connection.query(`
        INSERT INTO retail_queue_tokens (
          id, branch_id, token_number, customer_phone, customer_name,
          requested_brand_id, category_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'WAITING', NOW())
      `, [
        tokenId,
        params.branch_id,
        tokenNumber,
        params.customer_phone.trim(),
        params.customer_name?.trim() || null,
        params.requested_brand_id || null,
        params.category_id
      ]);

      await connection.commit();

      const brandContext = params.prefix === 'S' 
        ? 'Samsung Flagship Demos' 
        : params.prefix === 'A' 
        ? 'Apple Experience Table' 
        : 'our Showroom Specialists';

      const sms = `Welcome to Image Mobiles! You hold Token #${tokenNumber} (You are #${queuePosition} in line for ${brandContext}). Feel free to explore our floor kiosks or accessories lounge. We will text you the moment your specialist is ready.`;

      return {
        id: tokenId,
        branch_id: params.branch_id,
        token_number: tokenNumber,
        customer_phone: params.customer_phone,
        customer_name: params.customer_name || null,
        requested_brand_id: params.requested_brand_id || null,
        category_id: params.category_id,
        status: 'WAITING',
        created_at: new Date().toISOString(),
        called_at: null,
        served_at: null,
        assigned_employee_id: null,
        wait_time_minutes: 0,
        sms_message: sms
      };
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieves active tokens (WAITING and CALLED) for a showroom branch
   */
  public static async getActiveTokens(branchId: string): Promise<QueueTokenRecord[]> {
    const connection = await pool.getConnection();
    try {
      const [rows]: any = await connection.query(`
        SELECT 
          qt.id, qt.branch_id, qt.token_number, qt.customer_phone, qt.customer_name,
          qt.requested_brand_id, qt.category_id, qt.status, qt.created_at, qt.called_at, qt.served_at,
          qt.assigned_employee_id,
          TIMESTAMPDIFF(MINUTE, qt.created_at, NOW()) as wait_time_minutes,
          bm.name as requested_brand_name,
          cm.name as category_name
        FROM retail_queue_tokens qt
        LEFT JOIN retail_brand_master bm ON qt.requested_brand_id = bm.id
        LEFT JOIN retail_category_master cm ON qt.category_id = cm.id
        WHERE qt.branch_id = ? AND qt.status IN ('WAITING', 'CALLED') AND DATE(qt.created_at) = CURDATE()
        ORDER BY 
          CASE WHEN qt.status = 'CALLED' THEN 1 ELSE 2 END,
          qt.created_at ASC
      `, [branchId]);

      return rows.map((r: any) => ({
        ...r,
        wait_time_minutes: Number(r.wait_time_minutes) || 0,
        sms_message: `Token #${r.token_number}`
      }));
    } finally {
      connection.release();
    }
  }

  /**
   * Calls the next customer in the queue
   */
  public static async callToken(tokenId: string, employeeId: string): Promise<any> {
    const connection = await pool.getConnection();
    try {
      await connection.query(`
        UPDATE retail_queue_tokens
        SET status = 'CALLED', called_at = NOW(), assigned_employee_id = ?
        WHERE id = ?
      `, [employeeId, tokenId]);

      const [rows]: any = await connection.query(`
        SELECT * FROM retail_queue_tokens WHERE id = ?
      `, [tokenId]);

      return rows[0];
    } finally {
      connection.release();
    }
  }

  /**
   * Completes or cancels a queue token
   */
  public static async updateTokenStatus(tokenId: string, status: 'ENGAGED' | 'CANCELLED' | 'NO_SHOW'): Promise<any> {
    const connection = await pool.getConnection();
    try {
      const servedAt = status === 'ENGAGED' ? new Date() : null;
      await connection.query(`
        UPDATE retail_queue_tokens
        SET status = ?, served_at = COALESCE(?, served_at)
        WHERE id = ?
      `, [status, servedAt, tokenId]);

      const [rows]: any = await connection.query(`
        SELECT * FROM retail_queue_tokens WHERE id = ?
      `, [tokenId]);

      return rows[0];
    } finally {
      connection.release();
    }
  }
}
