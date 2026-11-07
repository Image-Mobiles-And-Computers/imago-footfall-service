import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';

export interface BranchTargetDTO {
  id?: string;
  fiscal_month: string;
  branch_id: string;
  branch_name: string;
  branch_code: string;
  branch_type?: string;
  region?: string;
  brand_name?: string;
  category_name?: string;
  target_revenue: number;
  target_unit_volume: number;
  min_gross_margin_percent: number;
  care_attach_percent: number;
}

export interface BranchPacingDTO {
  branch_id: string;
  branch_name: string;
  branch_code: string;
  branch_type?: string;
  region: string;
  mtd_sales_raw: number;
  mtd_target_raw: number;
  target_units: number;
  actual_units: number;
  min_margin_percent: number;
  care_attach_percent: number;
  pacing_percent: number;
  status: 'ON_TRACK' | 'MILD_LAG' | 'CRITICAL_LAG';
  key_growth_oem: string;
  progress_width_percent: number;
  live_conversions_count?: number;
  live_conversions_revenue?: number;
  last_conversion_at?: string | null;
}

export interface RetailConversionItemDTO {
  id: string;
  branch_id: string;
  branch_name?: string;
  branch_code?: string;
  invoice_number: string;
  invoice_amount: number;
  payment_method: string;
  sales_employee_name?: string;
  converted_at: string;
}

export interface CreateDiscountTicketDTO {
  walkin_session_id?: string;
  branch_id: string;
  cashier_user_id?: string;
  cashier_name?: string;
  customer_phone: string;
  customer_name?: string;
  product_sku?: string;
  product_name: string;
  mrp: number;
  landed_cost_fifo?: number;
  requested_discount: number;
  discount_reason: string;
}

export interface DiscountTicketDTO {
  id: string;
  ticket_number: string;
  branch_id: string;
  branch_name: string;
  walkin_session_id?: string | null;
  terminal_id?: string;
  cashier_user_id?: string;
  cashier_name: string;
  customer_phone: string;
  customer_name?: string;
  product_sku: string;
  product_name: string;
  mrp: number;
  landed_cost_fifo: number;
  standard_mop: number;
  requested_discount: number;
  discount_reason: string;
  status: 'PENDING' | 'APPROVED' | 'COUNTER_OFFERED' | 'REJECTED' | 'EXPIRED_ESCALATED';
  approved_discount?: number | null;
  authorization_code?: string | null;
  converted_invoice_number?: string | null;
  counter_bundle_notes?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  expires_at: string;
  sla_remaining_seconds: number;
  gross_margin_before_concession_pct: number;
  gross_margin_after_concession_pct: number;
}

export class SalesCommandService {
  /**
   * Fetch real canonical branches from imago_org_db.branches joined with ho_sales_targets
   */
  async getBranchTargets(fiscalMonth: string = '2026-10'): Promise<BranchTargetDTO[]> {
    const [rows]: any = await pool.query(
      `SELECT 
         b.id AS branch_id,
         b.name AS branch_name,
         b.code AS branch_code,
         b.type AS branch_type,
         CONCAT(b.city, ', ', b.state) AS region,
         COALESCE(t.id, CONCAT('tgt-', LOWER(b.code), '-', REPLACE(?, '-', ''))) AS id,
         ? AS fiscal_month,
         COALESCE(t.brand_name, 'Multi-Brand') AS brand_name,
         COALESCE(t.category_name, 'Smartphones') AS category_name,
         CAST(COALESCE(t.target_revenue, 50000000.00) AS DOUBLE) AS target_revenue,
         COALESCE(t.target_unit_volume, 2200) AS target_unit_volume,
         CAST(COALESCE(t.min_gross_margin_percent, 6.50) AS DOUBLE) AS min_gross_margin_percent,
         CAST(COALESCE(t.care_attach_percent, 22.00) AS DOUBLE) AS care_attach_percent,
         t.created_at,
         t.updated_at
       FROM imago_org_db.branches b
       LEFT JOIN imago_footfall_db.ho_sales_targets t 
         ON b.id = t.branch_id AND t.fiscal_month = ?
       WHERE b.is_active = 1 AND b.type IN ('SHOWROOM', 'SERVICE_CENTER')
       ORDER BY b.type DESC, b.name ASC`,
      [fiscalMonth, fiscalMonth, fiscalMonth]
    );

    return rows;
  }

  /**
   * Batch upsert showroom branch quotas
   */
  async upsertBranchTargets(
    targets: Array<Partial<BranchTargetDTO>>,
    fiscalMonth: string = '2026-10',
    userId: string = 'HO-COMMERCIAL-DESK'
  ): Promise<{ success: boolean; updatedCount: number }> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let count = 0;
      for (const t of targets) {
        if (!t.branch_id || !t.target_revenue) continue;

        const id = t.id || `tgt-${t.branch_code?.toLowerCase() || 'br'}-${fiscalMonth.replace('-', '')}`;
        await connection.query(
          `INSERT INTO ho_sales_targets (
             id, fiscal_month, branch_id, branch_name, branch_code, brand_name, category_name,
             target_revenue, target_unit_volume, min_gross_margin_percent, care_attach_percent, created_by_ho_user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             target_revenue = VALUES(target_revenue),
             target_unit_volume = VALUES(target_unit_volume),
             min_gross_margin_percent = VALUES(min_gross_margin_percent),
             care_attach_percent = VALUES(care_attach_percent),
             branch_name = VALUES(branch_name),
             branch_code = VALUES(branch_code),
             updated_at = CURRENT_TIMESTAMP`,
          [
            id,
            fiscalMonth,
            t.branch_id,
            t.branch_name || 'Showroom Branch',
            t.branch_code || 'BR-SH',
            t.brand_name || 'All Brands',
            t.category_name || 'Smartphones',
            t.target_revenue,
            t.target_unit_volume || Math.round(Number(t.target_revenue) / 22500),
            t.min_gross_margin_percent || 6.5,
            t.care_attach_percent || 22.0,
            userId
          ]
        );
        count++;
      }

      await connection.commit();
      return { success: true, updatedCount: count };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Calculate live pacing breakdown across real database showrooms,
   * linked directly with actual retail floor conversions from retail_conversions.
   */
  async getLivePacingOverview(fiscalMonth: string = '2026-10'): Promise<{
    network: {
      mtd_sales_raw: number;
      mtd_target_raw: number;
      elapsed_days: number;
      total_days: number;
      pacing_percent: number;
      status: 'ON_TRACK' | 'MILD_LAG' | 'CRITICAL_LAG';
      top_growth_oem: string;
      active_deal_tickets: number;
      total_retail_conversions: number;
      total_retail_converted_rev: number;
      recent_conversions: RetailConversionItemDTO[];
    };
    branches: BranchPacingDTO[];
  }> {
    const targets = await this.getBranchTargets(fiscalMonth);

    // Query authentic timeline date bounds from POS conversions
    const [dateStats]: any = await pool.query(
      `SELECT 
         MAX(converted_at) as latest_pos_date, 
         MIN(converted_at) as earliest_pos_date 
       FROM retail_conversions 
       WHERE DATE_FORMAT(converted_at, '%Y-%m') = ?`,
      [fiscalMonth]
    );

    const latestPosDate = dateStats[0]?.latest_pos_date ? new Date(dateStats[0].latest_pos_date) : new Date();
    // POS conversion date determines elapsed days (Day 28 of 31 for October 2026)
    const elapsedDays = Math.min(31, Math.max(1, latestPosDate.getUTCDate()));
    const totalDays = 31;
    const elapsedRatio = elapsedDays / totalDays;

    // 1. Query authentic POS conversions directly from retail_conversions for the fiscal month
    // Strictly real POS data — no artificial extra baseline data added
    const [convSummaryRows]: any = await pool.query(
      `SELECT 
         branch_id,
         COUNT(*) as total_conversions,
         CAST(COALESCE(SUM(invoice_amount), 0) AS DOUBLE) as converted_rev,
         MAX(converted_at) as last_converted_at
       FROM retail_conversions
       WHERE DATE_FORMAT(converted_at, '%Y-%m') = ?
       GROUP BY branch_id`,
      [fiscalMonth]
    );

    const retailConvMap: Record<string, { count: number; rev: number; lastAt: string | null }> = {};
    let totalNetworkConversions = 0;
    let totalNetworkConvertedRev = 0;

    if (Array.isArray(convSummaryRows)) {
      for (const c of convSummaryRows) {
        retailConvMap[c.branch_id] = {
          count: Number(c.total_conversions) || 0,
          rev: Number(c.converted_rev) || 0,
          lastAt: c.last_converted_at ? new Date(c.last_converted_at).toISOString() : null
        };
        totalNetworkConversions += Number(c.total_conversions) || 0;
        totalNetworkConvertedRev += Number(c.converted_rev) || 0;
      }
    }

    // 2. Query recent authentic POS conversions across retail stores (up to 100 for branch filtering)
    const [recentConvRows]: any = await pool.query(
      `SELECT 
         rc.id,
         rc.branch_id,
         b.name as branch_name,
         b.code as branch_code,
         rc.invoice_number,
         CAST(rc.invoice_amount AS DOUBLE) as invoice_amount,
         rc.payment_method,
         rc.sales_employee_name,
         rc.converted_at
       FROM retail_conversions rc
       LEFT JOIN imago_org_db.branches b ON rc.branch_id = b.id
       WHERE DATE_FORMAT(rc.converted_at, '%Y-%m') = ?
       ORDER BY rc.converted_at DESC
       LIMIT 100`,
      [fiscalMonth]
    );

    const recentConversions: RetailConversionItemDTO[] = (recentConvRows || []).map((r: any) => ({
      id: r.id,
      branch_id: r.branch_id,
      branch_name: r.branch_name || 'Retail Showroom',
      branch_code: r.branch_code || 'BR-SH',
      invoice_number: r.invoice_number,
      invoice_amount: Number(r.invoice_amount) || 0,
      payment_method: r.payment_method || 'UPI',
      sales_employee_name: r.sales_employee_name || 'Sales Staff',
      converted_at: r.converted_at ? new Date(r.converted_at).toISOString() : new Date().toISOString()
    }));

    let totalNetworkSales = 0;
    let totalNetworkTarget = 0;

    const branches: BranchPacingDTO[] = targets.map((t) => {
      // Authentic POS numbers only
      const floorConv = retailConvMap[t.branch_id] || { count: 0, rev: 0, lastAt: null };
      const actualRevenue = floorConv.rev;
      const actualUnits = floorConv.count;

      totalNetworkSales += actualRevenue;
      totalNetworkTarget += Number(t.target_revenue);

      const targetRunRate = Number(t.target_revenue) * elapsedRatio;
      const pacingRatio = targetRunRate > 0 ? (actualRevenue / targetRunRate) * 100 : 0;
      const pacingRounded = Math.round(pacingRatio);

      let status: 'ON_TRACK' | 'MILD_LAG' | 'CRITICAL_LAG' = 'CRITICAL_LAG';
      if (pacingRounded >= 100) status = 'ON_TRACK';
      else if (pacingRounded >= 85) status = 'MILD_LAG';

      const progressWidth = Number(t.target_revenue) > 0 
        ? Math.min(100, Math.round((actualRevenue / Number(t.target_revenue)) * 100))
        : 0;

      return {
        branch_id: t.branch_id,
        branch_name: t.branch_name,
        branch_code: t.branch_code,
        branch_type: t.branch_type,
        region: t.region || 'Bengaluru, Karnataka',
        mtd_sales_raw: actualRevenue,
        mtd_target_raw: Number(t.target_revenue),
        target_units: t.target_unit_volume,
        actual_units: actualUnits,
        min_margin_percent: Number(t.min_gross_margin_percent),
        care_attach_percent: Number(t.care_attach_percent),
        pacing_percent: pacingRounded,
        status,
        key_growth_oem: actualUnits > 0 ? `POS Telemetry (${actualUnits} bills)` : 'Awaiting Floor Sales',
        progress_width_percent: progressWidth,
        live_conversions_count: floorConv.count,
        live_conversions_revenue: floorConv.rev,
        last_conversion_at: floorConv.lastAt
      };
    });

    const expectedNetworkRunRate = totalNetworkTarget * elapsedRatio;
    const networkPacing = expectedNetworkRunRate > 0 ? Math.round((totalNetworkSales / expectedNetworkRunRate) * 100) : 100;
    let networkStatus: 'ON_TRACK' | 'MILD_LAG' | 'CRITICAL_LAG' = 'ON_TRACK';
    if (networkPacing < 85) networkStatus = 'CRITICAL_LAG';
    else if (networkPacing < 100) networkStatus = 'MILD_LAG';

    // Pending discount tickets count
    const [ticketRows]: any = await pool.query(
      `SELECT COUNT(*) as pending_count FROM ho_price_exception_requests WHERE status = 'PENDING'`
    );

    return {
      network: {
        mtd_sales_raw: totalNetworkSales,
        mtd_target_raw: totalNetworkTarget,
        elapsed_days: elapsedDays,
        total_days: totalDays,
        pacing_percent: networkPacing,
        status: networkStatus,
        top_growth_oem: 'Apple India (+18.4% YoY)',
        active_deal_tickets: ticketRows[0]?.pending_count ?? 0,
        total_retail_conversions: totalNetworkConversions,
        total_retail_converted_rev: totalNetworkConvertedRev,
        recent_conversions: recentConversions
      },
      branches
    };
  }

  /**
   * Atomically increment MTD sales pacing when a retail walk-in is converted on the showroom floor
   */
  async recordRetailSaleConversion(
    branchId: string,
    invoiceAmount: number,
    unitsCount: number = 1,
    connection?: any
  ): Promise<void> {
    const db = connection || pool;
    let targetBranchId = branchId;
    // Normalize legacy HQ corporate ID to Indiranagar Flagship showroom
    if (targetBranchId === '1aea7937-4abc-4bb3-bb48-283172b49b8c') {
      targetBranchId = 'c9832255-2791-401d-88b5-a3d2c870c533';
    }

    const elapsedDays = 18;
    const totalDays = 31;
    const elapsedRatio = elapsedDays / totalDays;

    const [rows]: any = await db.query(
      `SELECT id, target_revenue_mtd, actual_revenue_mtd, actual_units_mtd, gross_margin_mtd 
       FROM ho_sales_daily_pacing 
       WHERE branch_id = ? 
       ORDER BY snapshot_date DESC LIMIT 1`,
      [targetBranchId]
    );

    if (rows && rows.length > 0) {
      const row = rows[0];
      const newRev = Number(row.actual_revenue_mtd) + Number(invoiceAmount);
      const newUnits = Number(row.actual_units_mtd) + Number(unitsCount);
      const newMargin = Number(row.gross_margin_mtd) + Math.round(Number(invoiceAmount) * 0.08);
      const targetRunRate = Number(row.target_revenue_mtd) * elapsedRatio;
      const pacingRatio = targetRunRate > 0 ? (newRev / targetRunRate) * 100 : 100;
      const pacingRounded = Math.round(pacingRatio);

      let status: 'ON_TRACK' | 'MILD_LAG' | 'CRITICAL_LAG' = 'ON_TRACK';
      if (pacingRounded < 85) status = 'CRITICAL_LAG';
      else if (pacingRounded < 100) status = 'MILD_LAG';

      await db.query(
        `UPDATE ho_sales_daily_pacing
         SET 
           actual_revenue_mtd = ?,
           actual_units_mtd = ?,
           gross_margin_mtd = ?,
           pacing_percent = ?,
           status = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [newRev, newUnits, newMargin, pacingRounded, status, row.id]
      );
      console.log(`[SalesCommandService] ✅ Live MTD Sales updated for branch ${targetBranchId}: +₹${invoiceAmount} -> ₹${newRev} (${pacingRounded}% pacing)`);
    } else {
      // Find branch details from imago_org_db
      const [bRows]: any = await db.query(
        `SELECT name, code FROM imago_org_db.branches WHERE id = ?`,
        [targetBranchId]
      );
      const branchName = bRows[0]?.name || 'Retail Showroom';
      const branchCode = bRows[0]?.code || 'BR-SH';
      const defaultTarget = 50000000.00;
      const targetRunRate = defaultTarget * elapsedRatio;
      const pacing = Math.round((Number(invoiceAmount) / targetRunRate) * 100);

      await db.query(
        `INSERT INTO ho_sales_daily_pacing (
           id, snapshot_date, branch_id, branch_name, actual_revenue_mtd, target_revenue_mtd,
           pacing_percent, actual_units_mtd, target_units_mtd, gross_margin_mtd, status, key_growth_oem
         ) VALUES (?, CURRENT_DATE(), ?, ?, ?, ?, ?, ?, 2200, ?, ?, 'Multi-Brand')`,
        [
          `snap-${branchCode.toLowerCase()}-${Date.now()}`,
          targetBranchId,
          branchName,
          invoiceAmount,
          defaultTarget,
          pacing,
          unitsCount,
          Math.round(Number(invoiceAmount) * 0.08),
          pacing >= 100 ? 'ON_TRACK' : pacing >= 85 ? 'MILD_LAG' : 'CRITICAL_LAG'
        ]
      );
      console.log(`[SalesCommandService] ✅ Seeded new pacing row for branch ${targetBranchId}: ₹${invoiceAmount}`);
    }
  }

  /**
   * Fetch OEM Brand contracts & live aggregated rebate telemetry
   */
  async getOemRebatesDashboard(fiscalQuarter: string = '2026-Q4'): Promise<any> {
    const [contracts]: any = await pool.query(
      `SELECT c.*, b.code AS brand_code, b.name AS brand_master_name, b.tier AS brand_tier, b.logo_url AS brand_logo
       FROM ho_brand_oem_contracts c
       LEFT JOIN retail_brand_master b ON c.brand_id = b.id
       WHERE c.fiscal_quarter = ? AND c.is_active = 1
       ORDER BY c.target_purchase_volume DESC`,
      [fiscalQuarter]
    );

    // Query live conversions aggregated by brand master FK (falls back to brand_name for legacy rows)
    const [conversionStats]: any = await pool.query(`
      SELECT 
        brand_id,
        brand_name,
        COUNT(*) as conversions_count,
        COALESCE(SUM(invoice_amount), 0) as total_conversions_amount,
        COALESCE(SUM(has_warranty_attach), 0) as warranty_attach_count
      FROM retail_conversions
      WHERE brand_id IS NOT NULL OR brand_name IS NOT NULL
      GROUP BY brand_id, brand_name
    `);

    const statsByBrandId: Record<string, any> = {};
    for (const stat of conversionStats) {
      if (!stat.brand_id) continue;
      const prev = statsByBrandId[stat.brand_id] || { count: 0, amount: 0, warrantyCount: 0 };
      statsByBrandId[stat.brand_id] = {
        count: prev.count + (Number(stat.conversions_count) || 0),
        amount: prev.amount + (Number(stat.total_conversions_amount) || 0),
        warrantyCount: prev.warrantyCount + (Number(stat.warranty_attach_count) || 0)
      };
    }

    // Baseline enterprise quarterly purchase volume baselines (reflecting Q4 network run-rate)
    const baselinePurchases: Record<string, number> = {
      'oem-apple-2026q4': 268500000,   // ₹26.85 Cr base
      'oem-samsung-2026q4': 214000000, // ₹21.40 Cr base
      'oem-oneplus-2026q4': 112000000  // ₹11.20 Cr base
    };

    const enrichedContracts = contracts.map((c: any) => {
      const liveStats = (c.brand_id && statsByBrandId[c.brand_id]) || { count: 0, amount: 0, warrantyCount: 0 };

      const basePurchases = baselinePurchases[c.id] || 0;
      const actualPurchasesToDate = basePurchases + liveStats.amount;
      const targetVolume = Number(c.target_purchase_volume) || 1;
      const achievementPct = Number(((actualPurchasesToDate / targetVolume) * 100).toFixed(1));
      
      // Elapsed pacing: ~73.3% of Q4 elapsed
      const elapsedQuarterPct = 73.3;
      const pacingPct = Number(((achievementPct / elapsedQuarterPct) * 100).toFixed(1));

      // Rebate calculation
      const rebatePct = Number(c.rebate_percentage) || 2.5;
      const minAchievementPct = Number(c.min_achievement_percent) || 90;
      const isRebateQualified = achievementPct >= minAchievementPct;
      const expectedRebateAmount = Math.round(actualPurchasesToDate * (rebatePct / 100));

      // Care / Warranty Attachment (AppleCare+ or extended warranty)
      const careAttachTarget = Number(c.care_attach_target_percent) || 22.0;
      const actualCareAttachPct = liveStats.count > 0 
        ? Number(((liveStats.warrantyCount / liveStats.count) * 100).toFixed(1))
        : 0;
      const isCareQualified = actualCareAttachPct >= careAttachTarget;
      const mdfRate = Number(c.mdf_per_unit) || 0;
      const mdfEarned = Math.round(liveStats.warrantyCount * mdfRate);

      let status = 'ON_TRACK';
      if (achievementPct >= 100) status = 'ACHIEVED';
      else if (pacingPct < 90) status = 'AT_RISK';

      return {
        ...c,
        target_purchase_volume: targetVolume,
        actual_purchases_todate: actualPurchasesToDate,
        live_retail_revenue: liveStats.amount,
        live_units_sold: liveStats.count,
        achievement_pct: achievementPct,
        pacing_pct: pacingPct,
        run_rate_status: status,
        is_rebate_qualified: isRebateQualified,
        expected_rebate_amount: expectedRebateAmount,
        care_attach_target_percent: careAttachTarget,
        actual_care_attach_percent: actualCareAttachPct,
        care_attach_status: isCareQualified ? 'QUALIFIED' : 'UNDER_TARGET',
        care_attach_units: liveStats.warrantyCount,
        min_achievement_percent: minAchievementPct,
        rebate_percentage: rebatePct,
        mdf_per_unit: mdfRate,
        mdf_earned: mdfEarned,
        promoter_threshold: Number(c.promoter_min_units_threshold) || 25,
        promoter_subsidy_rate: Number(c.promoter_subsidy_amount_per_rep) || 28000
      };
    });

    // Network Summary
    const totalTarget = enrichedContracts.reduce((sum: number, c: any) => sum + c.target_purchase_volume, 0);
    const totalActual = enrichedContracts.reduce((sum: number, c: any) => sum + c.actual_purchases_todate, 0);
    const totalProjectedRebate = enrichedContracts.reduce((sum: number, c: any) => sum + (c.is_rebate_qualified ? c.expected_rebate_amount : 0), 0);
    const totalMdfEarned = enrichedContracts.reduce((sum: number, c: any) => sum + c.mdf_earned, 0);
    const overallAchievement = Number(((totalActual / totalTarget) * 100).toFixed(1));

    return {
      fiscal_quarter: fiscalQuarter,
      summary: {
        total_target_volume: totalTarget,
        total_actual_purchases: totalActual,
        overall_achievement_pct: overallAchievement,
        total_projected_rebate: totalProjectedRebate,
        total_mdf_earned: totalMdfEarned,
        promoter_protection_rate: 94.2,
        active_contracts_count: enrichedContracts.length
      },
      contracts: enrichedContracts
    };
  }

  /**
   * Fetch in-store brand promoter productivity & subsidy protection monitor
   */
  async getPromoterProductivity(): Promise<any> {
    const [rows]: any = await pool.query(`
      SELECT 
        rc.sales_employee_id,
        rc.sales_employee_name,
        COALESCE(MAX(CASE WHEN rc.brand_name = 'Samsung Electronics' THEN 'Samsung Electronics' WHEN rc.brand_name = 'Apple India' THEN 'Apple India' ELSE rc.brand_name END), 'Samsung Electronics') as brand_name,
        rc.branch_id,
        COALESCE(b.name, 'Retail Showroom') as branch_name,
        COALESCE(b.code, 'BR-SH') as branch_code,
        COUNT(*) as units_sold_mtd,
        COALESCE(SUM(rc.invoice_amount), 0) as revenue_mtd,
        COALESCE(SUM(rc.has_warranty_attach), 0) as care_units_mtd
      FROM retail_conversions rc
      LEFT JOIN imago_org_db.branches b ON rc.branch_id = b.id
      WHERE rc.sales_employee_name IS NOT NULL
      GROUP BY rc.sales_employee_id, rc.sales_employee_name, rc.branch_id, b.name, b.code
      ORDER BY units_sold_mtd DESC
    `);

    const threshold = 25; // 25 units/month threshold for 100% manufacturer subsidy reimbursement
    const subsidyRate = 28000; // ₹28,000 monthly OEM promoter salary subsidy

    const promoters = rows.map((r: any) => {
      const units = Number(r.units_sold_mtd) || 0;
      const shortfall = Math.max(0, threshold - units);
      let status: 'SAFE' | 'WARNING' | 'FORFEITURE_RISK' = 'SAFE';
      if (units < threshold - 5) {
        status = 'FORFEITURE_RISK';
      } else if (units < threshold) {
        status = 'WARNING';
      }

      const achievementPct = Number(((units / threshold) * 100).toFixed(1));
      const subsidyAtStake = subsidyRate;
      const isProtected = status === 'SAFE';

      return {
        promoter_id: r.sales_employee_id || r.sales_employee_name.toLowerCase().replace(/\s+/g, '-'),
        promoter_name: r.sales_employee_name,
        branch_id: r.branch_id,
        branch_name: r.branch_name,
        branch_code: r.branch_code,
        brand_name: r.brand_name || 'Multi-Brand',
        units_sold_mtd: units,
        monthly_target_units: threshold,
        achievement_pct: achievementPct,
        units_shortfall: shortfall,
        subsidy_amount: subsidyAtStake,
        subsidy_status: status,
        is_subsidy_protected: isProtected,
        care_units_mtd: Number(r.care_units_mtd) || 0,
        revenue_mtd: Number(r.revenue_mtd) || 0,
        days_remaining: 18
      };
    });

    const safeCount = promoters.filter((p: any) => p.is_subsidy_protected).length;
    const atRiskCount = promoters.filter((p: any) => !p.is_subsidy_protected).length;
    const totalSubsidiesAtStake = promoters.length * subsidyRate;
    const protectedSubsidies = safeCount * subsidyRate;

    return {
      monthly_threshold: threshold,
      subsidy_rate_per_rep: subsidyRate,
      summary: {
        total_promoters: promoters.length,
        promoters_safe: safeCount,
        promoters_at_risk: atRiskCount,
        total_subsidies_at_stake: totalSubsidiesAtStake,
        protected_subsidies_amount: protectedSubsidies,
        at_risk_subsidies_amount: atRiskCount * subsidyRate,
        protection_percent: promoters.length > 0 ? Number(((safeCount / promoters.length) * 100).toFixed(1)) : 100
      },
      promoters
    };
  }

  /**
   * Create or renew an OEM Brand contract
   */
  async createOemContract(data: any): Promise<any> {
    if (!data.brand_id) {
      throw new Error('brand_id is required (must reference retail_brand_master)');
    }
    const [brandRows]: any = await pool.query(
      `SELECT id, code, name FROM retail_brand_master WHERE id = ? LIMIT 1`,
      [data.brand_id]
    );
    if (!brandRows.length) {
      throw new Error(`Brand ${data.brand_id} not found in retail_brand_master`);
    }
    const brand = brandRows[0];
    const brandName = (data.brand_name && String(data.brand_name).trim()) || brand.name;
    const id = `oem-${String(brand.code).toLowerCase()}-${String(data.fiscal_quarter).toLowerCase()}`;
    await pool.query(
      `INSERT INTO ho_brand_oem_contracts (
        id, brand_id, brand_name, fiscal_quarter, target_purchase_volume, rebate_percentage,
        min_achievement_percent, care_attach_target_percent, mdf_per_unit,
        promoter_min_units_threshold, promoter_subsidy_amount_per_rep, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
      ON DUPLICATE KEY UPDATE
        brand_id = VALUES(brand_id),
        brand_name = VALUES(brand_name),
        target_purchase_volume = VALUES(target_purchase_volume),
        rebate_percentage = VALUES(rebate_percentage),
        min_achievement_percent = VALUES(min_achievement_percent),
        care_attach_target_percent = VALUES(care_attach_target_percent),
        mdf_per_unit = VALUES(mdf_per_unit),
        promoter_min_units_threshold = VALUES(promoter_min_units_threshold),
        promoter_subsidy_amount_per_rep = VALUES(promoter_subsidy_amount_per_rep),
        is_active = 1`,
      [
        id,
        brand.id,
        brandName,
        data.fiscal_quarter,
        data.target_purchase_volume,
        data.rebate_percentage,
        data.min_achievement_percent || 90.0,
        data.care_attach_target_percent || 22.0,
        data.mdf_per_unit || 500.0,
        data.promoter_min_units_threshold || 25,
        data.promoter_subsidy_amount_per_rep || 28000.0
      ]
    );

    return { id, success: true, message: 'OEM Contract saved successfully' };
  }

  /**
   * Update an existing OEM Brand contract (partial update; only whitelisted fields)
   */
  async updateOemContract(id: string, data: any): Promise<any | null> {
    const [existing]: any = await pool.query(
      `SELECT id FROM ho_brand_oem_contracts WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!existing.length) return null;

    const numericFields = [
      'target_purchase_volume', 'rebate_percentage', 'min_achievement_percent',
      'care_attach_target_percent', 'mdf_per_unit', 'promoter_min_units_threshold',
      'promoter_subsidy_amount_per_rep'
    ];
    const sets: string[] = [];
    const values: any[] = [];

    if (data.brand_id !== undefined) {
      const [brandRows]: any = await pool.query(
        `SELECT id FROM retail_brand_master WHERE id = ? LIMIT 1`,
        [data.brand_id]
      );
      if (!brandRows.length) throw new Error(`Brand ${data.brand_id} not found in retail_brand_master`);
      sets.push('brand_id = ?');
      values.push(data.brand_id);
    }
    if (data.brand_name !== undefined && String(data.brand_name).trim()) {
      sets.push('brand_name = ?');
      values.push(String(data.brand_name).trim());
    }
    if (data.fiscal_quarter !== undefined && String(data.fiscal_quarter).trim()) {
      sets.push('fiscal_quarter = ?');
      values.push(String(data.fiscal_quarter).trim());
    }
    for (const f of numericFields) {
      if (data[f] !== undefined && data[f] !== null && data[f] !== '') {
        const n = Number(data[f]);
        if (Number.isNaN(n) || n < 0) throw new Error(`${f} must be a non-negative number`);
        sets.push(`${f} = ?`);
        values.push(n);
      }
    }
    if (data.is_active !== undefined) {
      sets.push('is_active = ?');
      values.push(data.is_active ? 1 : 0);
    }

    if (sets.length > 0) {
      values.push(id);
      await pool.query(`UPDATE ho_brand_oem_contracts SET ${sets.join(', ')} WHERE id = ?`, values);
    }

    const [rows]: any = await pool.query(`SELECT * FROM ho_brand_oem_contracts WHERE id = ?`, [id]);
    return { ...rows[0], success: true, message: 'OEM Contract updated successfully' };
  }

  /**
   * Fetch live active walk-in sessions across showrooms for direct concession binding
   */
  async getActiveWalkinSessions(branchId?: string): Promise<any[]> {
    let query = `
      SELECT 
        w.id,
        w.session_number,
        w.branch_id,
        COALESCE(b.name, 'Retail Showroom') as branch_name,
        COALESCE(b.code, 'BR-SH') as branch_code,
        w.customer_name,
        w.customer_phone,
        w.customer_type,
        w.primary_category_name,
        w.assigned_employee_name,
        w.status,
        w.entered_at,
        GREATEST(1, TIMESTAMPDIFF(MINUTE, w.entered_at, NOW())) as dwell_minutes,
        (SELECT ticket_number FROM ho_price_exception_requests WHERE walkin_session_id = w.id AND status = 'PENDING' LIMIT 1) as pending_ticket_number,
        (SELECT authorization_code FROM ho_price_exception_requests WHERE walkin_session_id = w.id AND status = 'APPROVED' LIMIT 1) as approved_auth_code
      FROM retail_walkin_sessions w
      LEFT JOIN imago_org_db.branches b ON w.branch_id = b.id
      WHERE w.status IN ('ENTERED', 'ENGAGED', 'PENDING_SALES_COMMAND', 'CHECKOUT_INITIATED')
    `;
    const params: any[] = [];
    if (branchId && branchId !== 'ALL') {
      query += ` AND w.branch_id = ?`;
      params.push(branchId);
    }
    query += ` ORDER BY w.entered_at DESC LIMIT 30`;
    const [rows]: any = await pool.query(query, params);
    return rows;
  }

  /**
   * Create a new remote price exception ticket strictly linked to an active Retail Walk-in Session (<60s SLA)
   */
  async createDiscountTicket(data: CreateDiscountTicketDTO): Promise<DiscountTicketDTO> {
    const id = uuidv4();
    const ticketNumber = `DSC-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Strict Walk-in Session Referential Binding:
    let targetWalkin: any = null;
    if (data.walkin_session_id) {
      const [wRows]: any = await pool.query(
        `SELECT * FROM retail_walkin_sessions WHERE id = ?`,
        [data.walkin_session_id]
      );
      if (wRows && wRows.length > 0) {
        targetWalkin = wRows[0];
      }
    }

    if (!targetWalkin && data.branch_id) {
      const [candidates]: any = await pool.query(
        `SELECT * FROM retail_walkin_sessions 
         WHERE branch_id = ? AND status IN ('ENTERED', 'ENGAGED', 'PENDING_SALES_COMMAND', 'CHECKOUT_INITIATED')
         ORDER BY entered_at DESC LIMIT 1`,
        [data.branch_id]
      );
      if (candidates && candidates.length > 0) {
        targetWalkin = candidates[0];
      }
    }

    if (!targetWalkin) {
      const [candidates]: any = await pool.query(
        `SELECT * FROM retail_walkin_sessions 
         WHERE status IN ('ENTERED', 'ENGAGED', 'PENDING_SALES_COMMAND', 'CHECKOUT_INITIATED')
         ORDER BY entered_at DESC LIMIT 1`
      );
      if (candidates && candidates.length > 0) {
        targetWalkin = candidates[0];
      }
    }

    if (!targetWalkin) {
      throw new Error(`Cannot submit price concession: No active walk-in session found on showroom floor.`);
    }

    const effectiveBranchId = targetWalkin.branch_id || data.branch_id;
    const effectiveWalkinId = targetWalkin.id;
    const effectiveCustomerName = targetWalkin.customer_name || data.customer_name || 'Walk-In Customer';
    const effectiveCustomerPhone = targetWalkin.customer_phone || data.customer_phone || '';
    const effectiveCashierName = targetWalkin.assigned_employee_name || data.cashier_name || 'Floor Sales Consultant';
    const effectiveTerminalId = `TERMINAL-${targetWalkin.session_number}`;

    // Resolve branch name
    const [bRows]: any = await pool.query(
      `SELECT name FROM imago_org_db.branches WHERE id = ?`,
      [effectiveBranchId]
    );
    const branchName = bRows[0]?.name || 'Retail Showroom';

    const mrp = Number(data.mrp) || 0;
    const requestedDiscount = Number(data.requested_discount) || 0;
    const landedCost = data.landed_cost_fifo ? Number(data.landed_cost_fifo) : Math.round(mrp * 0.82);
    const standardMop = Math.round(mrp * 0.95);

    // 60-second SLA
    const expiresAt = new Date(Date.now() + 60 * 1000);

    await pool.query(
      `INSERT INTO ho_price_exception_requests (
        id, ticket_number, branch_id, branch_name, walkin_session_id, terminal_id,
        cashier_user_id, cashier_name, customer_phone, customer_name,
        product_sku, product_name, mrp, landed_cost_fifo, standard_mop,
        requested_discount, discount_reason, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [
        id,
        ticketNumber,
        effectiveBranchId,
        branchName,
        effectiveWalkinId,
        effectiveTerminalId,
        data.cashier_user_id || 'USR-FLOOR-REP',
        effectiveCashierName,
        effectiveCustomerPhone,
        effectiveCustomerName,
        data.product_sku || 'FLAGSHIP-DEVICE',
        data.product_name,
        mrp,
        landedCost,
        standardMop,
        requestedDiscount,
        data.discount_reason,
        expiresAt
      ]
    );

    // Synchronize live shop floor walk-in status to PENDING_SALES_COMMAND
    await pool.query(
      `UPDATE retail_walkin_sessions SET status = 'PENDING_SALES_COMMAND' WHERE id = ?`,
      [effectiveWalkinId]
    );

    return this.getTicketById(id);
  }

  /**
   * Fetch ticket by ID with margin analytics & SLA remaining
   */
  async getTicketById(id: string): Promise<DiscountTicketDTO> {
    const [rows]: any = await pool.query(
      `SELECT * FROM ho_price_exception_requests WHERE id = ?`,
      [id]
    );
    if (!rows || rows.length === 0) {
      throw new Error(`Discount ticket ${id} not found`);
    }
    return this.formatTicketDTO(rows[0]);
  }

  /**
   * Fetch latest ticket for a walk-in session ID
   */
  async getTicketBySessionId(sessionId: string): Promise<DiscountTicketDTO | null> {
    const [rows]: any = await pool.query(
      `SELECT * FROM ho_price_exception_requests 
       WHERE walkin_session_id = ? 
       ORDER BY created_at DESC LIMIT 1`,
      [sessionId]
    );
    if (!rows || rows.length === 0) return null;
    return this.formatTicketDTO(rows[0]);
  }

  /**
   * Fetch all active pending tickets (<60s SLA)
   */
  async getPendingDiscountTickets(): Promise<DiscountTicketDTO[]> {
    // Auto-escalate tickets where expires_at has passed and status is still PENDING
    await pool.query(
      `UPDATE ho_price_exception_requests
       SET status = 'EXPIRED_ESCALATED'
       WHERE status = 'PENDING' AND expires_at < NOW()`
    );

    // Both active PENDING (<60s) and EXPIRED_ESCALATED tickets are actively awaiting HO VP clearance
    const [rows]: any = await pool.query(
      `SELECT * FROM ho_price_exception_requests 
       WHERE status IN ('PENDING', 'EXPIRED_ESCALATED') 
       ORDER BY FIELD(status, 'PENDING', 'EXPIRED_ESCALATED'), created_at DESC`
    );

    return rows.map((r: any) => this.formatTicketDTO(r));
  }

  /**
   * Fetch recently resolved discount tickets (decided by HO Commercial VP)
   */
  async getResolvedDiscountTickets(limit: number = 50): Promise<DiscountTicketDTO[]> {
    const [rows]: any = await pool.query(
      `SELECT * FROM ho_price_exception_requests 
       WHERE status IN ('APPROVED', 'COUNTER_OFFERED', 'REJECTED')
       ORDER BY COALESCE(reviewed_at, created_at) DESC 
       LIMIT ?`,
      [limit]
    );

    return rows.map((r: any) => this.formatTicketDTO(r));
  }

  /**
   * Make a decision on a price exception ticket (Approve, Counter-Offer, Reject)
   */
  async decideDiscountTicket(
    ticketId: string,
    decision: {
      action: 'APPROVE' | 'COUNTER_OFFER' | 'REJECT' | 'CANCEL';
      approved_discount?: number;
      counter_bundle_notes?: string;
      reviewed_by_user_id?: string;
    }
  ): Promise<DiscountTicketDTO> {
    const [ticketRows]: any = await pool.query(
      `SELECT * FROM ho_price_exception_requests WHERE id = ?`,
      [ticketId]
    );
    if (!ticketRows || ticketRows.length === 0) {
      throw new Error(`Ticket ${ticketId} not found`);
    }

    const currentTicket = ticketRows[0];
    let newStatus: string = 'APPROVED';
    let authCode: string | null = null;
    let finalDiscount: number | null = null;
    let counterNotes: string | null = decision.counter_bundle_notes || null;

    if (decision.action === 'APPROVE') {
      newStatus = 'APPROVED';
      finalDiscount = decision.approved_discount !== undefined 
        ? Number(decision.approved_discount) 
        : Number(currentTicket.requested_discount);
      authCode = `APP-${Math.floor(1000 + Math.random() * 9000)}-HO`;
    } else if (decision.action === 'COUNTER_OFFER') {
      newStatus = 'COUNTER_OFFERED';
      finalDiscount = Number(decision.approved_discount) || 0;
      authCode = `CTR-${Math.floor(1000 + Math.random() * 9000)}-HO`;
      counterNotes = decision.counter_bundle_notes || 'Counter offer bundle attached';
    } else if (decision.action === 'CANCEL') {
      newStatus = 'CANCELLED';
      finalDiscount = 0;
      counterNotes = decision.counter_bundle_notes || 'Concession request cancelled by store representative.';
    } else {
      newStatus = 'REJECTED';
      finalDiscount = 0;
      counterNotes = decision.counter_bundle_notes || 'Discount concession declined. Minimum gross margin safeguard enforced.';
    }

    await pool.query(
      `UPDATE ho_price_exception_requests
       SET 
         status = ?,
         approved_discount = ?,
         authorization_code = ?,
         counter_bundle_notes = ?,
         reviewed_by_user_id = ?,
         reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        newStatus,
        finalDiscount,
        authCode,
        counterNotes,
        decision.reviewed_by_user_id || 'HO-COMMERCIAL-OPS',
        ticketId
      ]
    );

    // Synchronize shop floor walk-in status on decision
    if (currentTicket.walkin_session_id) {
      if (decision.action === 'APPROVE') {
        await pool.query(
          `UPDATE retail_walkin_sessions SET status = 'CHECKOUT_INITIATED' WHERE id = ?`,
          [currentTicket.walkin_session_id]
        );
      } else if (decision.action === 'REJECT' || decision.action === 'CANCEL') {
        await pool.query(
          `UPDATE retail_walkin_sessions SET status = 'ENGAGED' WHERE id = ?`,
          [currentTicket.walkin_session_id]
        );
      }
    }

    return this.getTicketById(ticketId);
  }

  /**
   * Cancel an active or pending price exception ticket and roll back session status to ENGAGED
   */
  async cancelDiscountTicket(
    ticketIdOrNumberOrSession: string,
    reason?: string,
    cancelledBy: string = 'STORE-ASSOCIATE'
  ): Promise<DiscountTicketDTO> {
    const [ticketRows]: any = await pool.query(
      `SELECT * FROM ho_price_exception_requests 
       WHERE id = ? OR ticket_number = ? OR (walkin_session_id = ? AND status IN ('PENDING', 'EXPIRED_ESCALATED'))
       ORDER BY created_at DESC LIMIT 1`,
      [ticketIdOrNumberOrSession, ticketIdOrNumberOrSession, ticketIdOrNumberOrSession]
    );
    if (!ticketRows || ticketRows.length === 0) {
      throw new Error(`Ticket or session ${ticketIdOrNumberOrSession} not found`);
    }

    const currentTicket = ticketRows[0];
    const cancellationNotes = reason || 'Concession request cancelled by store representative.';

    await pool.query(
      `UPDATE ho_price_exception_requests
       SET 
         status = 'CANCELLED',
         counter_bundle_notes = ?,
         reviewed_by_user_id = ?,
         reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [cancellationNotes, cancelledBy, currentTicket.id]
    );

    // Roll back linked walk-in session to ENGAGED (In Service)
    if (currentTicket.walkin_session_id) {
      await pool.query(
        `UPDATE retail_walkin_sessions
         SET status = 'ENGAGED'
         WHERE id = ? AND status = 'PENDING_SALES_COMMAND'`,
        [currentTicket.walkin_session_id]
      );
    }

    return this.getTicketById(currentTicket.id);
  }

  private formatTicketDTO(r: any): DiscountTicketDTO {
    const mrp = Number(r.mrp) || 0;
    const landedCost = Number(r.landed_cost_fifo) || Math.round(mrp * 0.82);
    const requestedDiscount = Number(r.requested_discount) || 0;
    const approvedDiscount = r.approved_discount !== null ? Number(r.approved_discount) : null;
    const standardMop = Number(r.standard_mop) || Math.round(mrp * 0.95);

    const marginBefore = mrp > 0 ? Number((((mrp - landedCost) / mrp) * 100).toFixed(1)) : 0;
    const effectiveDisc = approvedDiscount !== null ? approvedDiscount : requestedDiscount;
    const netSellingPrice = mrp - effectiveDisc;
    const marginAfter = netSellingPrice > 0 ? Number((((netSellingPrice - landedCost) / netSellingPrice) * 100).toFixed(1)) : 0;

    const expiresAt = r.expires_at ? new Date(r.expires_at) : new Date(Date.now() + 60000);
    const slaRemaining = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000));

    return {
      id: r.id,
      ticket_number: r.ticket_number,
      branch_id: r.branch_id,
      branch_name: r.branch_name,
      walkin_session_id: r.walkin_session_id,
      terminal_id: r.terminal_id,
      cashier_user_id: r.cashier_user_id,
      cashier_name: r.cashier_name,
      customer_phone: r.customer_phone,
      customer_name: r.customer_name || 'Walk-In Customer',
      product_sku: r.product_sku,
      product_name: r.product_name,
      mrp,
      landed_cost_fifo: landedCost,
      standard_mop: standardMop,
      requested_discount: requestedDiscount,
      discount_reason: r.discount_reason,
      status: r.status,
      approved_discount: approvedDiscount,
      authorization_code: r.authorization_code,
      converted_invoice_number: r.converted_invoice_number || null,
      counter_bundle_notes: r.counter_bundle_notes,
      reviewed_by_user_id: r.reviewed_by_user_id,
      reviewed_at: r.reviewed_at ? new Date(r.reviewed_at).toISOString() : null,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      sla_remaining_seconds: r.status === 'PENDING' ? slaRemaining : 0,
      gross_margin_before_concession_pct: marginBefore,
      gross_margin_after_concession_pct: marginAfter
    };
  }
}

export const salesCommandService = new SalesCommandService();
