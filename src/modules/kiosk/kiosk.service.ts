import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';
import { ComparisonEngine, SpecData } from './comparison.engine';

export interface ProductCatalogItem {
  sku: string;
  modelName: string;
  brand: string;
  category: string;
  mrpPrice: number;
  discountAmount: number;
  bankCashbackAmount: number;
  tradeinBonusAmount: number;
  effectivePrice: number;
  monthlyEmiAmount: number;
  gltfGlbUrl: string;
  usdzArUrl: string;
  colorSwatches: Array<{
    color_id: string;
    name: string;
    hex: string;
    albedo_color: number;
    in_stock: boolean;
    stock_count: number;
    badge?: string;
  }>;
  storageVariants: Array<{
    tier: string;
    mrpPrice: number;
    effectivePrice: number;
    popular?: boolean;
  }>;
  specs: SpecData;
}

export class KioskService {
  /**
   * Fetch full kiosk catalog with 3D models, swatches, and specs
   */
  public static async getCatalog(category?: string): Promise<ProductCatalogItem[]> {
    let query = `
      SELECT 
        a.sku,
        a.model_name,
        a.brand,
        a.category,
        a.gltf_glb_url,
        a.usdz_ar_url,
        a.materials_pbr_config,
        a.color_swatches_json,
        s.*
      FROM retail_kiosk_3d_assets a
      JOIN retail_kiosk_product_specs s ON a.sku = s.sku
      WHERE a.is_active = TRUE
    `;
    const params: any[] = [];
    if (category) {
      query += ' AND a.category = ?';
      params.push(category);
    }
    query += ' ORDER BY a.brand ASC, a.model_name ASC';

    const [rows]: any = await pool.query(query, params);

    return rows.map((r: any) => {
      // Dynamic storage & pricing calculation
      const isLaptop = r.category === 'Laptops';
      const mrp = isLaptop ? (r.sku.includes('APPLE') ? 249900 : 219900) : (r.sku.includes('APPLE') ? 144900 : 134900);
      const discount = isLaptop ? 12000 : 8000;
      const bankCashback = 6000;
      const tradeinBonus = 8000;
      const effectivePrice = mrp - discount - bankCashback - tradeinBonus;
      const monthlyEmi = Math.round(effectivePrice / 24);

      let swatches: any[] = [];
      try {
        swatches = typeof r.color_swatches_json === 'string' ? JSON.parse(r.color_swatches_json) : r.color_swatches_json;
      } catch {
        swatches = [];
      }

      const storageVariants = isLaptop
        ? [
            { tier: '512GB SSD', mrpPrice: mrp, effectivePrice, popular: false },
            { tier: '1TB SSD', mrpPrice: mrp + 20000, effectivePrice: effectivePrice + 20000, popular: true },
            { tier: '2TB SSD', mrpPrice: mrp + 60000, effectivePrice: effectivePrice + 60000, popular: false }
          ]
        : [
            { tier: '256GB', mrpPrice: mrp, effectivePrice, popular: false },
            { tier: '512GB', mrpPrice: mrp + 15000, effectivePrice: effectivePrice + 15000, popular: true },
            { tier: '1TB', mrpPrice: mrp + 35000, effectivePrice: effectivePrice + 35000, popular: false }
          ];

      return {
        sku: r.sku,
        modelName: r.model_name,
        brand: r.brand,
        category: r.category,
        mrpPrice: mrp,
        discountAmount: discount,
        bankCashbackAmount: bankCashback,
        tradeinBonusAmount: tradeinBonus,
        effectivePrice,
        monthlyEmiAmount: monthlyEmi,
        gltfGlbUrl: r.gltf_glb_url,
        usdzArUrl: r.usdz_ar_url,
        colorSwatches: swatches,
        storageVariants,
        specs: {
          sku: r.sku,
          category: r.category,
          display_type: r.display_type,
          display_size_inches: Number(r.display_size_inches),
          resolution: r.resolution,
          ppi: Number(r.ppi),
          peak_brightness_nits: Number(r.peak_brightness_nits),
          refresh_rate_hz: r.refresh_rate_hz,
          glass_durability: r.glass_durability,
          camera_main: r.camera_main,
          camera_telephoto: r.camera_telephoto,
          camera_ultrawide: r.camera_ultrawide,
          video_recording_max: r.video_recording_max,
          camera_features: r.camera_features,
          processor_soc: r.processor_soc,
          geekbench_single_score: Number(r.geekbench_single_score),
          geekbench_multi_score: Number(r.geekbench_multi_score),
          gpu_3dmark_extreme_score: Number(r.gpu_3dmark_extreme_score),
          ai_npu_tops: Number(r.ai_npu_tops),
          battery_capacity_mah: Number(r.battery_capacity_mah),
          wired_charging_watts: Number(r.wired_charging_watts),
          wireless_charging_watts: Number(r.wireless_charging_watts),
          reverse_wireless_supported: Boolean(r.reverse_wireless_supported),
          rated_video_playback_hours: Number(r.rated_video_playback_hours),
          weight_grams: Number(r.weight_grams),
          thickness_mm: Number(r.thickness_mm),
          chassis_material: r.chassis_material,
          ip_rating: r.ip_rating,
          stylus_supported: Boolean(r.stylus_supported)
        }
      };
    });
  }

  /**
   * Compare two SKUs and calculate dynamic differentials
   */
  public static async compareModels(skuA: string, skuB: string): Promise<any> {
    const catalog = await this.getCatalog();
    const modelA = catalog.find(m => m.sku === skuA);
    const modelB = catalog.find(m => m.sku === skuB);

    if (!modelA || !modelB) {
      throw new Error(`One or both models (${skuA}, ${skuB}) not found in kiosk catalog.`);
    }

    const comparison = ComparisonEngine.computeDifferentials(modelA.specs, modelB.specs);

    return {
      modelA,
      modelB,
      differentials: comparison.dimensions,
      verdict: comparison.executiveVerdict
    };
  }

  /**
   * Record kiosk terminal heartbeat
   */
  public static async recordHeartbeat(kioskCode: string, ipAddress?: string): Promise<boolean> {
    const [res]: any = await pool.query(`
      UPDATE retail_kiosk_terminals
      SET 
        device_status = 'ONLINE',
        last_heartbeat_at = NOW(),
        ip_address = COALESCE(?, ip_address)
      WHERE kiosk_code = ? OR id = ?
    `, [ipAddress || null, kioskCode, kioskCode]);
    return res.affectedRows > 0;
  }

  /**
   * Start a touch session on the kiosk
   */
  public static async startSession(kioskId: string, branchId: string, walkinSessionId?: string): Promise<string> {
    const sessionId = uuidv4();
    await pool.query(`
      INSERT INTO retail_kiosk_sessions (
        id, kiosk_id, branch_id, walkin_session_id, session_started_at, total_screen_touches
      ) VALUES (?, ?, ?, ?, NOW(), 1)
    `, [sessionId, kioskId, branchId, walkinSessionId || null]);
    return sessionId;
  }

  /**
   * Update touch session dwell and screen touches
   */
  public static async updateSession(sessionId: string, data: {
    dwellSeconds?: number;
    customerPhone?: string;
    categoryBrowsed?: string;
    touchIncrement?: number;
  }): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];

    if (data.dwellSeconds !== undefined) {
      sets.push('dwell_duration_seconds = ?');
      params.push(data.dwellSeconds);
    }
    if (data.customerPhone) {
      sets.push('customer_phone = ?');
      params.push(data.customerPhone);
    }
    if (data.categoryBrowsed) {
      sets.push('primary_category_browsed = ?');
      params.push(data.categoryBrowsed);
    }
    if (data.touchIncrement) {
      sets.push('total_screen_touches = total_screen_touches + ?');
      params.push(data.touchIncrement);
    }

    if (sets.length > 0) {
      params.push(sessionId);
      await pool.query(`
        UPDATE retail_kiosk_sessions
        SET ${sets.join(', ')}
        WHERE id = ?
      `, params);
    }
  }

  /**
   * Log comparison telemetry event
   */
  public static async logComparisonTelemetry(sessionId: string, skuA: string, skuB: string, durationSeconds: number): Promise<void> {
    const id = uuidv4();
    await pool.query(`
      INSERT INTO retail_kiosk_comparisons (
        id, session_id, model_a_sku, model_b_sku, duration_seconds
      ) VALUES (?, ?, ?, ?, ?)
    `, [id, sessionId, skuA, skuB, durationSeconds]);
  }

  /**
   * Request live product demo / on-demand floor associate paging
   */
  public static async requestAssistance(payload: {
    sessionId: string;
    kioskId: string;
    branchId: string;
    requestedSku: string;
    brandId?: string;
  }): Promise<{
    id: string;
    assignedAssociateName: string;
    etaSeconds: number;
    status: string;
  }> {
    const id = uuidv4();

    // Query on-duty floor staff or brand promoter in imago-footfall-service / imago-hr-service
    const [staffRows]: any = await pool.query(`
      SELECT 
        s.employee_id, 
        s.staff_name, 
        s.current_presence_status, 
        s.assigned_brand_name
      FROM retail_staff_floor_status s
      WHERE s.branch_id = ? AND s.current_presence_status IN ('READY_FOR_NEXT', 'CONSULTING_CUSTOMER')
      ORDER BY (s.current_presence_status = 'READY_FOR_NEXT') DESC
      LIMIT 1
    `, [payload.branchId]);

    const assignedStaff = staffRows && staffRows.length > 0
      ? staffRows[0]
      : { employee_id: 'emp-rahul-01', staff_name: 'Rahul Sharma (Samsung Specialist)' };

    await pool.query(`
      INSERT INTO retail_kiosk_assistance_requests (
        id, session_id, kiosk_id, branch_id, requested_sku, brand_id,
        assigned_employee_id, status, requested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())
    `, [
      id,
      payload.sessionId,
      payload.kioskId,
      payload.branchId,
      payload.requestedSku,
      payload.brandId || null,
      assignedStaff.employee_id
    ]);

    return {
      id,
      assignedAssociateName: assignedStaff.staff_name,
      etaSeconds: 45,
      status: 'PENDING'
    };
  }

  /**
   * Send Omnichannel Quotation to customer WhatsApp
   */
  public static async sendWhatsAppQuotation(payload: {
    sessionId: string;
    branchId: string;
    customerPhone: string;
    quotedSkus: any[];
    downPaymentAmount?: number;
    monthlyEmiAmount?: number;
    financePartnerName?: string;
  }): Promise<string> {
    const quoteId = uuidv4();
    await pool.query(`
      INSERT INTO retail_kiosk_quotations (
        id, session_id, branch_id, customer_phone, quoted_skus,
        down_payment_amount, monthly_emi_amount, finance_partner_name, sent_via
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'WHATSAPP')
    `, [
      quoteId,
      payload.sessionId,
      payload.branchId,
      payload.customerPhone,
      JSON.stringify(payload.quotedSkus),
      payload.downPaymentAmount || 0,
      payload.monthlyEmiAmount || 0,
      payload.financePartnerName || 'Bajaj Finserv'
    ]);
    return quoteId;
  }

  /**
   * Get active HO campaigns for kiosks
   */
  public static async getHoCampaigns(): Promise<any[]> {
    const [rows]: any = await pool.query(`
      SELECT * FROM retail_kiosk_ho_campaigns
      WHERE is_active = TRUE AND end_date >= CURDATE()
      ORDER BY created_at DESC
    `);
    return rows;
  }

  /**
   * Dispatch remote fleet command
   */
  public static async dispatchRemoteCommand(kioskId: string, commandType: string, payload?: any, hoUserId: string = 'usr-ho-sales-director'): Promise<string> {
    const cmdId = uuidv4();
    await pool.query(`
      INSERT INTO retail_kiosk_remote_commands (
        id, kiosk_id, command_type, payload_json, status, dispatched_by_ho_user_id
      ) VALUES (?, ?, ?, ?, 'PENDING', ?)
    `, [
      cmdId,
      kioskId,
      commandType,
      payload ? JSON.stringify(payload) : null,
      hoUserId
    ]);
    return cmdId;
  }

  /**
   * Get all terminals overview for HO fleet management
   */
  public static async getFleetOverview(branchId?: string): Promise<any[]> {
    let query = `
      SELECT 
        t.*,
        c.campaign_title as active_campaign_title,
        TIMESTAMPDIFF(SECOND, t.last_heartbeat_at, NOW()) as seconds_since_heartbeat
      FROM retail_kiosk_terminals t
      LEFT JOIN retail_kiosk_ho_campaigns c ON t.active_ho_campaign_id = c.id
    `;
    const params: any[] = [];
    if (branchId) {
      query += ' WHERE t.branch_id = ?';
      params.push(branchId);
    }
    query += ' ORDER BY t.kiosk_code ASC';

    const [rows]: any = await pool.query(query, params);
    return rows.map((r: any) => ({
      ...r,
      is_live: r.seconds_since_heartbeat !== null && r.seconds_since_heartbeat <= 90
    }));
  }
}
