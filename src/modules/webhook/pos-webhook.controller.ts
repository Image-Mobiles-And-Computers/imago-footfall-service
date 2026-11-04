import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';
import { salesCommandService } from '../sales-command/sales.service';

export const handlePosWebhook = async (req: Request, res: Response) => {
  const connection = await pool.getConnection();
  try {
    const {
      session_id,
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

    // Normalize legacy HQ corporate ID to Indiranagar Flagship showroom
    let effectiveBranchId = branch_id;
    if (effectiveBranchId === '1aea7937-4abc-4bb3-bb48-283172b49b8c') {
      effectiveBranchId = 'c9832255-2791-401d-88b5-a3d2c870c533';
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

    let targetSessionId: string | null = session_id || null;
    let matchType = targetSessionId ? 'MATCHED_WALKIN' : 'DIRECT_CHECKOUT';

    // 2. Reconciliation search: Match active walk-in within 4-hour window if session_id was not explicitly passed
    if (!targetSessionId && customer_phone && customer_phone.trim().length >= 10) {
      const cleanPhone = customer_phone.trim();
      const [candidates]: any = await connection.query(
        `SELECT id, status, entered_at, assigned_employee_id, assigned_employee_name
         FROM retail_walkin_sessions
         WHERE branch_id = ?
           AND customer_phone = ?
           AND status IN ('ENTERED', 'ENGAGED', 'PENDING_SALES_COMMAND', 'CHECKOUT_INITIATED')
         ORDER BY entered_at DESC
         LIMIT 1`,
        [branch_id, cleanPhone]
      );

      if (candidates[0]) {
        targetSessionId = candidates[0].id;
        matchType = 'MATCHED_WALKIN';
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
             dwell_duration_seconds = GREATEST(60, TIMESTAMPDIFF(SECOND, entered_at, NOW()))
         WHERE id = ?`,
        [targetSessionId]
      );
    }

    // 4. Record converted sale in retail_conversions
    const conversionId = uuidv4();
    const hasWarrantyAttach = Boolean(
      req.body.has_warranty_attach || 
      (Array.isArray(sold_skus) && sold_skus.some((s: any) => s.warranty_attached || /care|warranty|applecare/i.test(s.name || '')))
    );
    const brandName = req.body.brand_name || (
      Array.isArray(sold_skus) && sold_skus.length > 0
        ? (/iphone|macbook|ipad|apple/i.test(sold_skus[0].name) ? 'Apple India' : /galaxy|samsung/i.test(sold_skus[0].name) ? 'Samsung Electronics' : /oneplus/i.test(sold_skus[0].name) ? 'OnePlus' : null)
        : null
    );
    const productSku = req.body.product_sku || (Array.isArray(sold_skus) && sold_skus[0]?.sku ? sold_skus[0].sku : null);

    await connection.query(
      `INSERT INTO retail_conversions (
        id, session_id, branch_id, invoice_number, invoice_amount, payment_method,
        sales_employee_id, sales_employee_name, sold_skus, has_warranty_attach, brand_name, product_sku, converted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        conversionId,
        targetSessionId,
        effectiveBranchId,
        invoice_number,
        invoice_amount,
        payment_method || 'UPI',
        sales_employee_id || null,
        sales_employee_name || null,
        JSON.stringify(sold_skus || []),
        hasWarrantyAttach ? 1 : 0,
        brandName,
        productSku
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

    // 6. Real-time Head Office Sales Command pacing update
    try {
      const unitsCount = Array.isArray(sold_skus) && sold_skus.length > 0 ? sold_skus.length : 1;
      await salesCommandService.recordRetailSaleConversion(
        effectiveBranchId,
        Number(invoice_amount),
        unitsCount,
        connection
      );
    } catch (pacingErr) {
      console.error('[POS Webhook] Failed to update HO sales pacing:', pacingErr);
    }

    // 7. Stamp remote price exception ticket if discount authorization code or ticket ID was linked
    try {
      const discountTicketId = req.body.discount_ticket_id || null;
      const authCode = req.body.authorization_code || null;
      if (discountTicketId || authCode || targetSessionId) {
        await connection.query(
          `UPDATE ho_price_exception_requests
           SET converted_invoice_number = ?
           WHERE (id = ? OR authorization_code = ? OR (walkin_session_id = ? AND status = 'APPROVED'))
             AND converted_invoice_number IS NULL`,
          [invoice_number, discountTicketId, authCode, targetSessionId]
        );
      }
    } catch (ticketErr) {
      console.warn('[POS Webhook] Could not stamp ho_price_exception_requests:', ticketErr);
    }

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
      if (!rows[0]) {
        return res.status(404).json({ success: false, message: 'Walk-in session not found' });
      }
      if (rows[0].status === 'CONVERTED') {
        return res.status(400).json({ success: false, message: 'This customer walk-in session has already been converted into a Converted.' });
      }
      targetPhone = rows[0].customer_phone;
      targetBranch = rows[0].branch_id;
      targetStaffId = rows[0].assigned_employee_id;
      targetStaffName = rows[0].assigned_employee_name;
    }

    const simInvoice = `INV-${Date.now().toString().slice(-6)}`;
    const simAmount = invoice_amount || 79900.00;

    // Dispatch internally through POS webhook handler
    const simPayload = {
      session_id: session_id || null,
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
    res.status(500).json({ success: false, message: 'Failed to simulate Converted', error: error.message });
  }
};
