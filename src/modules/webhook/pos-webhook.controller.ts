import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';

export const handlePosWebhook = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const {
      branch_id,
      invoice_number,
      invoice_amount,
      customer_phone,
      customer_name,
      payment_method,
      sales_employee_id,
      sales_employee_name,
      sold_skus
    } = req.body;

    if (!branch_id || !invoice_number || !invoice_amount) {
      return res.status(400).json({
        success: false,
        message: 'branch_id, invoice_number, and invoice_amount are required'
      });
    }

    await connection.beginTransaction();

    // 1. Idempotency Check: Avoid double-counting duplicate webhooks
    const [existingConv]: any = await connection.query(
      'SELECT id, session_id FROM retail_conversions WHERE invoice_number = ?',
      [invoice_number]
    );

    if (existingConv[0]) {
      await connection.rollback();
      return res.json({
        success: true,
        status: 'ALREADY_RECONCILED',
        message: `Invoice #${invoice_number} has already been reconciled`,
        session_id: existingConv[0].session_id
      });
    }

    let targetSessionId: string | null = null;
    let matchType = 'MATCHED_WALKIN';

    // 2. Reconciliation search: Match active walk-in within 4-hour window
    if (customer_phone && customer_phone.trim().length >= 10) {
      const cleanPhone = customer_phone.trim();
      const [candidates]: any = await connection.query(
        `SELECT id, status, entered_at, assigned_employee_id, assigned_employee_name
         FROM retail_walkin_sessions
         WHERE branch_id = ?
           AND customer_phone = ?
           AND status IN ('ENTERED', 'ENGAGED', 'CHECKOUT_INITIATED')
           AND entered_at >= DATE_SUB(NOW(), INTERVAL 4 HOUR)
         ORDER BY entered_at DESC
         LIMIT 1`,
        [branch_id, cleanPhone]
      );

      if (candidates[0]) {
        targetSessionId = candidates[0].id;
      }
    }

    // 3. Fallback: If no matching active walk-in exists, create a direct checkout session
    if (!targetSessionId) {
      matchType = 'DIRECT_CHECKOUT';
      targetSessionId = uuidv4();
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const sessionNumber = `WIN-${todayStr}-DIR-${invoice_number.slice(-4)}`;

      await connection.query(
        `INSERT INTO retail_walkin_sessions (
          id, branch_id, session_number, customer_phone, customer_name, customer_type,
          primary_category_name, assigned_employee_id, assigned_employee_name,
          status, entered_at, exited_at, dwell_duration_seconds
        ) VALUES (?, ?, ?, ?, ?, 'NEW', 'Direct Checkout', ?, ?, 'CONVERTED', NOW(), NOW(), 120)`,
        [
          targetSessionId,
          branch_id,
          sessionNumber,
          customer_phone || null,
          customer_name || 'Walk-In Customer',
          sales_employee_id || null,
          sales_employee_name || 'Cashier Desk'
        ]
      );
    } else {
      // Update matched walk-in session to CONVERTED
      await connection.query(
        `UPDATE retail_walkin_sessions
         SET status = 'CONVERTED',
             exited_at = NOW(),
             dwell_duration_seconds = TIMESTAMPDIFF(SECOND, entered_at, NOW())
         WHERE id = ?`,
        [targetSessionId]
      );
    }

    // 4. Record converted sale in retail_conversions
    const conversionId = uuidv4();
    await connection.query(
      `INSERT INTO retail_conversions (
        id, session_id, branch_id, invoice_number, invoice_amount, payment_method,
        sales_employee_id, sales_employee_name, sold_skus, converted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        conversionId,
        targetSessionId,
        branch_id,
        invoice_number,
        invoice_amount,
        payment_method || 'UPI',
        sales_employee_id || null,
        sales_employee_name || null,
        JSON.stringify(sold_skus || [])
      ]
    );

    // 5. Add timeline log
    await connection.query(
      `INSERT INTO retail_session_timeline (id, session_id, from_status, to_status, triggered_by_user_id, notes)
       VALUES (UUID(), ?, 'ENGAGED', 'CONVERTED', ?, ?)`,
      [
        targetSessionId,
        sales_employee_id || null,
        `Reconciled automatically with POS Invoice #${invoice_number} (₹${invoice_amount})`
      ]
    );

    await connection.commit();

    console.log(`[POS Webhook] ✅ Reconciled Invoice #${invoice_number} (₹${invoice_amount}) -> Session ${targetSessionId} (${matchType})`);

    res.status(200).json({
      success: true,
      status: matchType,
      message: `Invoice #${invoice_number} successfully reconciled`,
      session_id: targetSessionId,
      conversion_id: conversionId
    });
  } catch (error: any) {
    await connection.rollback();
    console.error('[POS Webhook] ❌ Error processing transaction:', error);
    res.status(500).json({ success: false, message: 'POS Webhook Processing Failed', error: error.message });
  } finally {
    connection.release();
  }
};

export const simulatePosSale = async (req: Request, res: Response) => {
  try {
    const { session_id, branch_id, invoice_amount, payment_method, sku_name } = req.body;
    let targetPhone = null;
    let targetBranch = branch_id;
    let targetStaffId = null;
    let targetStaffName = null;

    if (session_id) {
      const [rows]: any = await pool.query('SELECT * FROM retail_walkin_sessions WHERE id = ?', [session_id]);
      if (rows[0]) {
        targetPhone = rows[0].customer_phone;
        targetBranch = rows[0].branch_id;
        targetStaffId = rows[0].assigned_employee_id;
        targetStaffName = rows[0].assigned_employee_name;
      }
    }

    const simInvoice = `INV-${Date.now().toString().slice(-6)}`;
    const simAmount = invoice_amount || 79900.00;

    // Dispatch internally through POS webhook handler
    const simPayload = {
      branch_id: targetBranch,
      invoice_number: simInvoice,
      invoice_amount: simAmount,
      customer_phone: targetPhone || '9876543210',
      customer_name: 'Simulated Shopper',
      payment_method: payment_method || 'UPI',
      sales_employee_id: targetStaffId,
      sales_employee_name: targetStaffName,
      sold_skus: [{ name: sku_name || 'Apple iPhone 16 128GB', qty: 1, price: simAmount }]
    };

    req.body = simPayload;
    return handlePosWebhook(req, res);
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to simulate POS sale', error: error.message });
  }
};
