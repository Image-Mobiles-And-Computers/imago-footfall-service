import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';

export interface CartTransferPayload {
  kioskId: string;
  branchId: string;
  employeeId?: string;
  customerPhone?: string;
  selectedSku: string;
  selectedColor: string;
  selectedStorage: string;
  mrpPrice: number;
  discountAmount?: number;
  bankCashbackAmount?: number;
  tradeinBonusAmount?: number;
}

export interface CartTransferRecord {
  id: string;
  transferToken: string;
  kioskId: string;
  branchId: string;
  employeeId?: string;
  customerPhone?: string;
  selectedSku: string;
  selectedColor: string;
  selectedStorage: string;
  mrpPrice: number;
  discountAmount: number;
  bankCashbackAmount: number;
  tradeinBonusAmount: number;
  effectivePrice: number;
  reservedImei?: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export class CartTransferService {
  /**
   * Generate random transfer token formatted as 'CART-XXXX'
   */
  private static generateToken(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `CART-${code}`;
  }

  /**
   * Create a direct cart handoff token with 30-minute hold for POS billing counter
   */
  public static async createCartTransfer(payload: CartTransferPayload): Promise<CartTransferRecord> {
    const id = uuidv4();
    const token = this.generateToken();

    const discount = payload.discountAmount || 0;
    const cashback = payload.bankCashbackAmount || 0;
    const tradein = payload.tradeinBonusAmount || 0;
    const effectivePrice = Math.max(0, payload.mrpPrice - discount - cashback - tradein);

    // Reserved demo IMEI for showroom stock reservation
    const reservedImei = `3589${Math.floor(10000000000 + Math.random() * 90000000000)}`;

    // 30 minute TTL
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(`
      INSERT INTO retail_kiosk_cart_transfers (
        id, transfer_token, kiosk_id, branch_id, employee_id, customer_phone,
        selected_sku, selected_color, selected_storage, mrp_price, discount_amount,
        bank_cashback_amount, tradein_bonus_amount, effective_price, reserved_imei,
        status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_AT_BILLING', NOW(), ?)
    `, [
      id,
      token,
      payload.kioskId,
      payload.branchId,
      payload.employeeId || null,
      payload.customerPhone || null,
      payload.selectedSku,
      payload.selectedColor,
      payload.selectedStorage,
      payload.mrpPrice,
      discount,
      cashback,
      tradein,
      effectivePrice,
      reservedImei,
      expiresAt
    ]);

    return {
      id,
      transferToken: token,
      kioskId: payload.kioskId,
      branchId: payload.branchId,
      employeeId: payload.employeeId,
      customerPhone: payload.customerPhone,
      selectedSku: payload.selectedSku,
      selectedColor: payload.selectedColor,
      selectedStorage: payload.selectedStorage,
      mrpPrice: payload.mrpPrice,
      discountAmount: discount,
      bankCashbackAmount: cashback,
      tradeinBonusAmount: tradein,
      effectivePrice,
      reservedImei,
      status: 'PENDING_AT_BILLING',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };
  }

  /**
   * Look up transfer token at the POS billing counter
   */
  public static async getTransferByToken(token: string): Promise<CartTransferRecord | null> {
    const [rows]: any = await pool.query(`
      SELECT 
        id, transfer_token, kiosk_id, branch_id, employee_id, customer_phone,
        selected_sku, selected_color, selected_storage, mrp_price, discount_amount,
        bank_cashback_amount, tradein_bonus_amount, effective_price, reserved_imei,
        status, created_at, expires_at
      FROM retail_kiosk_cart_transfers
      WHERE transfer_token = ?
    `, [token]);

    if (!rows || rows.length === 0) return null;
    const r = rows[0];

    return {
      id: r.id,
      transferToken: r.transfer_token,
      kioskId: r.kiosk_id,
      branchId: r.branch_id,
      employeeId: r.employee_id,
      customerPhone: r.customer_phone,
      selectedSku: r.selected_sku,
      selectedColor: r.selected_color,
      selectedStorage: r.selected_storage,
      mrpPrice: Number(r.mrp_price),
      discountAmount: Number(r.discount_amount),
      bankCashbackAmount: Number(r.bank_cashback_amount),
      tradeinBonusAmount: Number(r.tradein_bonus_amount),
      effectivePrice: Number(r.effective_price),
      reservedImei: r.reserved_imei,
      status: r.status,
      createdAt: r.created_at,
      expiresAt: r.expires_at
    };
  }

  /**
   * Update status (e.g. BILLED_PAID when cashier scans token)
   */
  public static async updateStatus(token: string, status: string): Promise<boolean> {
    const [result]: any = await pool.query(`
      UPDATE retail_kiosk_cart_transfers
      SET status = ?
      WHERE transfer_token = ?
    `, [status, token]);
    return result.affectedRows > 0;
  }
}
