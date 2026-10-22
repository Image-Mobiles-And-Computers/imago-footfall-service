import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { AuthRequest } from '../../middleware/auth';

export const getBranchLiveMetrics = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id, date } = req.query;
    let targetBranchId = branch_id as string | undefined;

    if (!targetBranchId && !req.user?.roles?.includes('SUPER_ADMIN')) {
      targetBranchId = req.user?.branch_id || undefined;
    }

    const dateFilter = date ? String(date) : new Date().toISOString().slice(0, 10);

    let whereClause = 'WHERE DATE(s.entered_at) = ?';
    const params: any[] = [dateFilter];

    if (targetBranchId && targetBranchId !== 'ALL') {
      whereClause += ' AND s.branch_id = ?';
      params.push(targetBranchId);
    }

    // 1. Footfall & Conversion Summary
    const [summaryRows]: any = await pool.query(
      `SELECT 
         COUNT(*) as total_walkins,
         SUM(CASE WHEN s.status = 'CONVERTED' THEN 1 ELSE 0 END) as conversions,
         SUM(CASE WHEN s.status = 'LOST' THEN 1 ELSE 0 END) as lost_opportunities,
         SUM(CASE WHEN s.status IN ('ENTERED', 'ENGAGED', 'CHECKOUT_INITIATED') THEN 1 ELSE 0 END) as active_on_floor,
         ROUND(AVG(CASE WHEN s.dwell_duration_seconds IS NOT NULL THEN s.dwell_duration_seconds / 60 ELSE NULL END), 1) as avg_dwell_minutes
       FROM retail_walkin_sessions s
       ${whereClause}`,
      params
    );

    const summary = summaryRows[0] || {
      total_walkins: 0,
      conversions: 0,
      lost_opportunities: 0,
      active_on_floor: 0,
      avg_dwell_minutes: 0
    };

    const totalWalkins = Number(summary.total_walkins) || 0;
    const conversions = Number(summary.conversions) || 0;
    const conversionRate = totalWalkins > 0 ? Number(((conversions / totalWalkins) * 100).toFixed(1)) : 0;

    // 2. Revenue Billed Today
    let revQuery = `
      SELECT COALESCE(SUM(invoice_amount), 0) as total_revenue
      FROM retail_conversions c
      WHERE DATE(c.converted_at) = ?
    `;
    const revParams: any[] = [dateFilter];
    if (targetBranchId && targetBranchId !== 'ALL') {
      revQuery += ' AND c.branch_id = ?';
      revParams.push(targetBranchId);
    }
    const [revRows]: any = await pool.query(revQuery, revParams);
    const totalRevenue = Number(revRows[0]?.total_revenue) || 0;

    // 3. Unassisted Customer Alerts Count (> 5 mins in ENTERED status right now)
    let unassistedQuery = `
      SELECT COUNT(*) as count
      FROM retail_walkin_sessions s
      WHERE s.status = 'ENTERED'
        AND TIMESTAMPDIFF(MINUTE, s.entered_at, NOW()) >= 5
    `;
    const unassistedParams: any[] = [];
    if (targetBranchId && targetBranchId !== 'ALL') {
      unassistedQuery += ' AND s.branch_id = ?';
      unassistedParams.push(targetBranchId);
    }
    const [unassistedRows]: any = await pool.query(unassistedQuery, unassistedParams);
    const unassistedAlerts = Number(unassistedRows[0]?.count) || 0;

    // 4. Lost Reason Pareto Breakdown Today
    let paretoQuery = `
      SELECT t.category, t.label, t.code, COUNT(l.id) as count
      FROM retail_lost_opportunities l
      JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
      WHERE DATE(l.logged_at) = ?
    `;
    const paretoParams: any[] = [dateFilter];
    if (targetBranchId && targetBranchId !== 'ALL') {
      paretoQuery += ' AND l.branch_id = ?';
      paretoParams.push(targetBranchId);
    }
    paretoQuery += ' GROUP BY t.category, t.label, t.code ORDER BY count DESC LIMIT 10';
    const [paretoRows]: any = await pool.query(paretoQuery, paretoParams);

    res.json({
      success: true,
      data: {
        date: dateFilter,
        branch_id: targetBranchId || 'ALL',
        total_walkins: totalWalkins,
        conversions: conversions,
        lost_opportunities: Number(summary.lost_opportunities) || 0,
        active_on_floor: Number(summary.active_on_floor) || 0,
        conversion_rate_percentage: conversionRate,
        target_conversion_rate_percentage: 28.0, // Benchmark showroom target
        avg_dwell_minutes: Number(summary.avg_dwell_minutes) || 0,
        total_revenue: totalRevenue,
        unassisted_alerts_count: unassistedAlerts,
        loss_pareto: paretoRows
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch branch metrics', error: error.message });
  }
};

export const getExecutiveLossAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id, days = '7' } = req.query;
    const daysNum = parseInt(days as string, 10) || 7;

    // 1. Cross-Branch Heatmap & Ranking
    const [branchStats]: any = await pool.query(
      `SELECT 
         b.id as branch_id,
         b.name as branch_name,
         b.code as branch_code,
         b.city,
         COUNT(s.id) as footfall,
         SUM(CASE WHEN s.status = 'CONVERTED' THEN 1 ELSE 0 END) as conversions,
         ROUND(
           CASE WHEN COUNT(s.id) > 0 
           THEN (SUM(CASE WHEN s.status = 'CONVERTED' THEN 1 ELSE 0 END) / COUNT(s.id)) * 100 
           ELSE 0 END, 1
         ) as conversion_rate,
         COALESCE(SUM(c.invoice_amount), 0) as total_revenue
       FROM imago_org_db.branches b
       LEFT JOIN retail_walkin_sessions s 
         ON b.id = s.branch_id AND s.entered_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       LEFT JOIN retail_conversions c 
         ON s.id = c.session_id
       GROUP BY b.id, b.name, b.code, b.city
       ORDER BY footfall DESC`,
      [daysNum]
    );

    // 2. Lost Revenue Opportunity Calculator by SKU & Model
    const [lostRevenueSKUs]: any = await pool.query(
      `SELECT 
         COALESCE(p.model_name, l.requested_sku, 'Unspecified SKU') as sku_name,
         COALESCE(p.brand_name, 'Generic') as brand_name,
         COALESCE(p.category_name, 'Smartphones') as category_name,
         COALESCE(p.msrp, AVG(l.quoted_price), AVG(l.customer_budget), 50000.00) as msrp,
         COUNT(l.id) as lost_count,
         ROUND(COUNT(l.id) * COALESCE(p.msrp, AVG(l.quoted_price), AVG(l.customer_budget), 50000.00), 2) as estimated_revenue_loss,
         SUM(CASE WHEN t.code LIKE 'STOCK_%' THEN 1 ELSE 0 END) as stockout_count,
         SUM(CASE WHEN t.code LIKE 'PRICE_%' THEN 1 ELSE 0 END) as price_loss_count
       FROM retail_lost_opportunities l
       LEFT JOIN retail_product_master p ON l.product_id = p.id
       JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
       WHERE l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY sku_name, brand_name, category_name, p.msrp
       ORDER BY estimated_revenue_loss DESC
       LIMIT 10`,
      [daysNum]
    );

    // 3. Overall Lost Opportunity Root-Cause Distribution
    const [categoryPareto]: any = await pool.query(
      `SELECT 
         t.category,
         COUNT(l.id) as count,
         ROUND(COUNT(l.id) * 100.0 / (SELECT COUNT(*) FROM retail_lost_opportunities WHERE logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)), 1) as percentage
       FROM retail_lost_opportunities l
       JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
       WHERE l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY t.category
       ORDER BY count DESC`,
      [daysNum, daysNum]
    );

    // 4. Stockout Alerts Trigger Criteria (> 3 stockouts in timeframe)
    const stockoutAlerts = lostRevenueSKUs
      .filter((sku: any) => Number(sku.stockout_count) >= 1)
      .map((sku: any) => ({
        sku_name: sku.sku_name,
        brand_name: sku.brand_name,
        stockout_count: Number(sku.stockout_count),
        potential_loss: Number(sku.estimated_revenue_loss),
        recommended_action: `Transfer ${Math.max(Number(sku.stockout_count) * 2, 5)} units to Indiranagar Flagship`,
        can_trigger_initiative: true
      }));

    res.json({
      success: true,
      data: {
        timeframe_days: daysNum,
        branch_heatmap: branchStats,
        lost_revenue_skus: lostRevenueSKUs,
        category_pareto: categoryPareto,
        stockout_alerts: stockoutAlerts
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch executive analytics', error: error.message });
  }
};

export const getSkuLossDetails = async (req: AuthRequest, res: Response) => {
  try {
    const { sku_name, days = '7' } = req.query;
    const daysNum = parseInt(days as string, 10) || 7;

    if (!sku_name) {
      return res.status(400).json({ success: false, message: 'sku_name query parameter is required' });
    }

    // 1. Detailed breakdown of lost records for this SKU
    const [incidents]: any = await pool.query(
      `SELECT 
         l.id,
         l.logged_at,
         l.quoted_price,
         l.competitor_price,
         l.competitor_name,
         l.customer_budget,
         l.notes,
         t.code as reason_code,
         t.label as reason_label,
         t.category as reason_category,
         s.session_number,
         s.customer_name,
         s.customer_phone,
         TIMESTAMPDIFF(MINUTE, s.entered_at, s.exited_at) as dwell_minutes,
         b.name as branch_name,
         b.code as branch_code,
         COALESCE(l.logged_by_employee_name, s.assigned_employee_name, 'Showroom Associate') as logged_by_staff_name
       FROM retail_lost_opportunities l
       LEFT JOIN retail_product_master p ON l.product_id = p.id
       JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
       LEFT JOIN retail_walkin_sessions s ON l.session_id = s.id
       LEFT JOIN imago_org_db.branches b ON s.branch_id = b.id
       WHERE (p.model_name = ? OR l.requested_sku = ?)
         AND l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       ORDER BY l.logged_at DESC`,
      [sku_name, sku_name, daysNum]
    );

    // 2. Breakdown by Showroom Branch
    const [branchBreakdown]: any = await pool.query(
      `SELECT 
         COALESCE(b.name, 'Flagship Showroom') as branch_name,
         COUNT(l.id) as lost_count,
         SUM(CASE WHEN t.code LIKE 'STOCK_%' THEN 1 ELSE 0 END) as stockout_count,
         SUM(CASE WHEN t.code LIKE 'PRICE_%' THEN 1 ELSE 0 END) as price_loss_count
       FROM retail_lost_opportunities l
       LEFT JOIN retail_product_master p ON l.product_id = p.id
       JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
       LEFT JOIN retail_walkin_sessions s ON l.session_id = s.id
       LEFT JOIN imago_org_db.branches b ON s.branch_id = b.id
       WHERE (p.model_name = ? OR l.requested_sku = ?)
         AND l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY b.id, b.name
       ORDER BY lost_count DESC`,
      [sku_name, sku_name, daysNum]
    );

    // 3. Reason Taxonomy Pareto for this model
    const [reasonPareto]: any = await pool.query(
      `SELECT 
         t.code,
         t.label,
         t.category,
         COUNT(l.id) as count
       FROM retail_lost_opportunities l
       LEFT JOIN retail_product_master p ON l.product_id = p.id
       JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
       WHERE (p.model_name = ? OR l.requested_sku = ?)
         AND l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY t.code, t.label, t.category
       ORDER BY count DESC`,
      [sku_name, sku_name, daysNum]
    );

    res.json({
      success: true,
      data: {
        sku_name,
        total_incidents: incidents.length,
        incidents,
        branch_breakdown: branchBreakdown,
        reason_pareto: reasonPareto
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch SKU loss details', error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Branch Operational Insights (Strengths & Conversion Opportunity Areas)
// Every insight is derived from live walk-in / conversion / lost-opportunity data
// for the requested window and benchmarked against the network-wide baseline.
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_CR = 28.0;
const FAST_GREET_SECONDS = 180; // 3-minute engagement SLA
const MIN_SAMPLE = 3;           // minimum records before an insight is considered meaningful

type Insight = { key: string; text: string; metric: string; weight: number };

const n = (v: any) => Number(v) || 0;
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0);
const fmtHour = (h: number) => {
  const hh = ((h % 24) + 24) % 24;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:00 ${suffix}`;
};
const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

async function getCoreAggregates(daysNum: number, branchId?: string) {
  const branchClause = branchId ? ' AND s.branch_id = ?' : '';
  const params: any[] = branchId ? [daysNum, branchId] : [daysNum];

  const [rows]: any = await pool.query(
    `SELECT
       COUNT(s.id) AS footfall,
       SUM(s.status = 'CONVERTED') AS conversions,
       SUM(s.status = 'LOST') AS lost,
       SUM(s.engaged_at IS NOT NULL) AS engaged_count,
       AVG(CASE WHEN s.engaged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, s.entered_at, s.engaged_at) END) AS avg_greet_seconds,
       SUM(s.engaged_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, s.entered_at, s.engaged_at) <= ${FAST_GREET_SECONDS}) AS fast_greet_count,
       SUM(s.engaged_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, s.entered_at, s.engaged_at) <= ${FAST_GREET_SECONDS} AND s.status = 'CONVERTED') AS fast_greet_conversions,
       SUM(s.engaged_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, s.entered_at, s.engaged_at) > ${FAST_GREET_SECONDS}) AS slow_greet_count,
       SUM(s.engaged_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, s.entered_at, s.engaged_at) > ${FAST_GREET_SECONDS} AND s.status = 'CONVERTED') AS slow_greet_conversions,
       SUM(s.customer_type IN ('RETURNING', 'VIP')) AS repeat_count,
       SUM(s.customer_type IN ('RETURNING', 'VIP') AND s.status = 'CONVERTED') AS repeat_conversions,
       AVG(s.dwell_duration_seconds) / 60 AS avg_dwell_minutes
     FROM retail_walkin_sessions s
     WHERE s.entered_at >= DATE_SUB(NOW(), INTERVAL ? DAY)${branchClause}`,
    params
  );

  const convClause = branchId ? ' AND c.branch_id = ?' : '';
  const [convRows]: any = await pool.query(
    `SELECT
       COUNT(c.id) AS invoices,
       COALESCE(SUM(c.invoice_amount), 0) AS revenue,
       COALESCE(AVG(c.invoice_amount), 0) AS avg_ticket,
       SUM(c.sold_skus IS NOT NULL AND JSON_CONTAINS(c.sold_skus, JSON_OBJECT('type', 'ADDON'))) AS addon_invoices,
       SUM(c.payment_method = 'FINANCE_EMI') AS emi_invoices
     FROM retail_conversions c
     WHERE c.converted_at >= DATE_SUB(NOW(), INTERVAL ? DAY)${convClause}`,
    params
  );

  const r = rows[0] || {};
  const c = convRows[0] || {};
  const footfall = n(r.footfall);
  const conversions = n(r.conversions);
  const invoices = n(c.invoices);

  return {
    footfall,
    conversions,
    lost: n(r.lost),
    conversion_rate: pct(conversions, footfall),
    engaged_count: n(r.engaged_count),
    avg_greet_minutes: r.avg_greet_seconds != null ? n(r.avg_greet_seconds) / 60 : null,
    fast_greet_pct: pct(n(r.fast_greet_count), n(r.engaged_count)),
    fast_greet_count: n(r.fast_greet_count),
    slow_greet_count: n(r.slow_greet_count),
    fast_greet_cr: pct(n(r.fast_greet_conversions), n(r.fast_greet_count)),
    slow_greet_cr: pct(n(r.slow_greet_conversions), n(r.slow_greet_count)),
    repeat_count: n(r.repeat_count),
    repeat_cr: pct(n(r.repeat_conversions), n(r.repeat_count)),
    avg_dwell_minutes: r.avg_dwell_minutes != null ? n(r.avg_dwell_minutes) : null,
    invoices,
    revenue: n(c.revenue),
    avg_ticket: n(c.avg_ticket),
    addon_attach_pct: pct(n(c.addon_invoices), invoices),
    emi_share_pct: pct(n(c.emi_invoices), invoices)
  };
}

export const getBranchInsights = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id, days = '7' } = req.query;
    const daysNum = parseInt(days as string, 10) || 7;
    const branchId = branch_id ? String(branch_id) : '';

    if (!branchId) {
      return res.status(400).json({ success: false, message: 'branch_id query parameter is required' });
    }

    const [branch, network] = await Promise.all([
      getCoreAggregates(daysNum, branchId),
      getCoreAggregates(daysNum)
    ]);

    // Hourly footfall / walkout profile (for peak-hour analysis)
    const [hourlyRows]: any = await pool.query(
      `SELECT HOUR(s.entered_at) AS hr,
              COUNT(*) AS footfall,
              SUM(s.status = 'CONVERTED') AS conversions,
              SUM(s.status = 'LOST') AS lost
       FROM retail_walkin_sessions s
       WHERE s.branch_id = ? AND s.entered_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY HOUR(s.entered_at)
       ORDER BY hr`,
      [branchId, daysNum]
    );
    const hourly = (hourlyRows as any[]).map(h => ({
      hour: n(h.hr), footfall: n(h.footfall), conversions: n(h.conversions), lost: n(h.lost)
    }));

    // Sliding 3-hour window with the most walkouts
    let peakWindow: { start: number; end: number; footfall: number; lost: number; walkout_rate: number } | null = null;
    for (const h of hourly) {
      const win = hourly.filter(x => x.hour >= h.hour && x.hour < h.hour + 3);
      const ff = win.reduce((a, x) => a + x.footfall, 0);
      const lost = win.reduce((a, x) => a + x.lost, 0);
      if (lost > 0 && (!peakWindow || lost > peakWindow.lost)) {
        peakWindow = { start: h.hour, end: h.hour + 3, footfall: ff, lost, walkout_rate: pct(lost, ff) };
      }
    }

    // Best converting hour (with meaningful sample)
    const bestHour = hourly
      .filter(h => h.footfall >= MIN_SAMPLE)
      .map(h => ({ ...h, cr: pct(h.conversions, h.footfall) }))
      .sort((a, b) => b.cr - a.cr)[0] || null;

    // Lost-reason Pareto for this branch
    const [reasonRows]: any = await pool.query(
      `SELECT t.code, t.label, t.category, COUNT(l.id) AS count
       FROM retail_lost_opportunities l
       JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
       WHERE l.branch_id = ? AND l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY t.code, t.label, t.category
       ORDER BY count DESC
       LIMIT 5`,
      [branchId, daysNum]
    );
    const loggedLost = (reasonRows as any[]).reduce((a, r) => a + n(r.count), 0);
    const [loggedTotalRows]: any = await pool.query(
      `SELECT COUNT(*) AS cnt FROM retail_lost_opportunities l
       WHERE l.branch_id = ? AND l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [branchId, daysNum]
    );
    const totalLoggedLost = n(loggedTotalRows[0]?.cnt) || loggedLost;
    const unloggedWalkouts = Math.max(0, branch.lost - totalLoggedLost);

    // Most-cited competitor
    const [competitorRows]: any = await pool.query(
      `SELECT l.competitor_name, COUNT(*) AS count, AVG(l.quoted_price - l.competitor_price) AS avg_price_gap
       FROM retail_lost_opportunities l
       WHERE l.branch_id = ? AND l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         AND l.competitor_name IS NOT NULL AND l.competitor_name <> ''
       GROUP BY l.competitor_name
       ORDER BY count DESC
       LIMIT 1`,
      [branchId, daysNum]
    );
    const topCompetitor = competitorRows[0] || null;

    // Most-lost SKU due to stockouts
    const [stockoutRows]: any = await pool.query(
      `SELECT COALESCE(p.model_name, l.requested_sku) AS sku_name, COUNT(*) AS count
       FROM retail_lost_opportunities l
       JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
       LEFT JOIN retail_product_master p ON l.product_id = p.id
       WHERE l.branch_id = ? AND l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         AND t.code LIKE 'STOCK_%'
       GROUP BY sku_name
       HAVING sku_name IS NOT NULL
       ORDER BY count DESC
       LIMIT 1`,
      [branchId, daysNum]
    );
    const topStockout = stockoutRows[0] || null;

    // Top floor associate
    const [associateRows]: any = await pool.query(
      `SELECT s.assigned_employee_name AS name,
              COUNT(*) AS handled,
              SUM(s.status = 'CONVERTED') AS conversions
       FROM retail_walkin_sessions s
       WHERE s.branch_id = ? AND s.entered_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         AND s.assigned_employee_name IS NOT NULL
         AND s.assigned_employee_id IS NOT NULL AND s.assigned_employee_id <> ''
         AND s.assigned_employee_name NOT LIKE '%Desk%' AND s.assigned_employee_name NOT LIKE '%System%'
       GROUP BY s.assigned_employee_id, s.assigned_employee_name
       HAVING handled >= ?
       ORDER BY conversions DESC, handled DESC
       LIMIT 1`,
      [branchId, daysNum, MIN_SAMPLE]
    );
    const topAssociate = associateRows[0] || null;

    // ── Rule engine ────────────────────────────────────────────────────────
    const strengths: Insight[] = [];
    const opportunities: Insight[] = [];
    const hasFootfall = branch.footfall >= MIN_SAMPLE;

    if (hasFootfall) {
      const gap = branch.conversion_rate - TARGET_CR;
      if (gap >= 0) {
        strengths.push({
          key: 'cr_benchmark', weight: 100,
          metric: `${branch.conversion_rate.toFixed(1)}%`,
          text: `Floor conversion of ${branch.conversion_rate.toFixed(1)}% beats the ${TARGET_CR}% benchmark by ${gap.toFixed(1)} pts.`
        });
      } else {
        opportunities.push({
          key: 'cr_gap', weight: 100,
          metric: `-${Math.abs(gap).toFixed(1)} pts`,
          text: `Conversion is ${Math.abs(gap).toFixed(1)} pts below the ${TARGET_CR}% benchmark — ${branch.lost} of ${branch.footfall} walk-ins left without buying.`
        });
      }

      if (network.footfall > 0 && branch.conversion_rate > network.conversion_rate + 1) {
        strengths.push({
          key: 'cr_network', weight: 80,
          metric: `+${(branch.conversion_rate - network.conversion_rate).toFixed(1)} pts`,
          text: `Converts ${branch.conversion_rate.toFixed(1)}% of walk-ins vs the network average of ${network.conversion_rate.toFixed(1)}%.`
        });
      }
    }

    // Engagement speed
    if (branch.engaged_count >= MIN_SAMPLE && branch.avg_greet_minutes != null) {
      if (branch.avg_greet_minutes <= FAST_GREET_SECONDS / 60) {
        strengths.push({
          key: 'greet_speed', weight: 70,
          metric: `${branch.avg_greet_minutes.toFixed(1)} min`,
          text: `Associates engage walk-ins in ${branch.avg_greet_minutes.toFixed(1)} min on average; ${branch.fast_greet_pct.toFixed(0)}% are greeted within 3 minutes.`
        });
      } else {
        opportunities.push({
          key: 'greet_speed', weight: 75,
          metric: `${branch.avg_greet_minutes.toFixed(1)} min`,
          text: `Average time to engage a walk-in is ${branch.avg_greet_minutes.toFixed(1)} min — only ${branch.fast_greet_pct.toFixed(0)}% are greeted within the 3-minute SLA.`
        });
      }

      if (branch.fast_greet_count >= MIN_SAMPLE && branch.slow_greet_count >= MIN_SAMPLE && branch.fast_greet_cr > branch.slow_greet_cr) {
        opportunities.push({
          key: 'greet_impact', weight: 65,
          metric: `${branch.fast_greet_cr.toFixed(0)}% vs ${branch.slow_greet_cr.toFixed(0)}%`,
          text: `Walk-ins engaged within 3 min convert at ${branch.fast_greet_cr.toFixed(1)}% vs ${branch.slow_greet_cr.toFixed(1)}% when engaged later (${branch.slow_greet_count} slow engagements).`
        });
      }
    }

    // Peak walkout window
    if (peakWindow && peakWindow.lost >= 2) {
      opportunities.push({
        key: 'peak_window', weight: 90,
        metric: `${peakWindow.walkout_rate.toFixed(0)}% walkout`,
        text: `Walkouts peak between ${fmtHour(peakWindow.start)} – ${fmtHour(peakWindow.end)}: ${peakWindow.lost} of ${peakWindow.footfall} walk-ins lost (${peakWindow.walkout_rate.toFixed(0)}%).`
      });
    }

    if (bestHour && bestHour.cr > 0) {
      strengths.push({
        key: 'best_hour', weight: 40,
        metric: `${bestHour.cr.toFixed(0)}%`,
        text: `Strongest conversion window is ${fmtHour(bestHour.hour)} – ${fmtHour(bestHour.hour + 1)} at ${bestHour.cr.toFixed(0)}% (${bestHour.conversions}/${bestHour.footfall}).`
      });
    }

    // Root causes
    const topReason = (reasonRows as any[])[0];
    if (topReason && n(topReason.count) >= 2) {
      const share = pct(n(topReason.count), totalLoggedLost);
      opportunities.push({
        key: 'top_reason', weight: 85,
        metric: `${share.toFixed(0)}% of losses`,
        text: `"${topReason.label}" is the leading walkout reason — ${topReason.count} of ${totalLoggedLost} logged losses (${share.toFixed(0)}%).`
      });
    }

    if (topStockout && n(topStockout.count) >= 2) {
      opportunities.push({
        key: 'stockout_sku', weight: 80,
        metric: `${topStockout.count} lost`,
        text: `Stockouts of ${topStockout.sku_name} caused ${topStockout.count} walkouts — replenish or transfer inventory.`
      });
    }

    if (topCompetitor && n(topCompetitor.count) >= 2) {
      const gapVal = topCompetitor.avg_price_gap != null ? n(topCompetitor.avg_price_gap) : 0;
      opportunities.push({
        key: 'competitor', weight: 60,
        metric: `${topCompetitor.count} cases`,
        text: `${topCompetitor.competitor_name} was cited in ${topCompetitor.count} lost sales${gapVal > 0 ? `, undercutting quotes by ${inr(gapVal)} on average` : ''}.`
      });
    }

    if (branch.lost >= MIN_SAMPLE && unloggedWalkouts > 0) {
      const unloggedPct = pct(unloggedWalkouts, branch.lost);
      if (unloggedPct >= 20) {
        opportunities.push({
          key: 'unlogged', weight: 50,
          metric: `${unloggedWalkouts} untagged`,
          text: `${unloggedWalkouts} of ${branch.lost} walkouts (${unloggedPct.toFixed(0)}%) have no root cause logged — capture reasons to sharpen loss analytics.`
        });
      }
    } else if (branch.lost >= MIN_SAMPLE && unloggedWalkouts === 0) {
      strengths.push({
        key: 'logging_discipline', weight: 35,
        metric: '100%',
        text: `Every walkout in this window has a root cause logged — full loss-reason visibility.`
      });
    }

    // Commercial quality
    if (branch.invoices >= MIN_SAMPLE) {
      if (branch.addon_attach_pct >= Math.max(30, network.addon_attach_pct)) {
        strengths.push({
          key: 'addon_attach', weight: 65,
          metric: `${branch.addon_attach_pct.toFixed(0)}%`,
          text: `${branch.addon_attach_pct.toFixed(0)}% of invoices include warranty / protection add-ons (network: ${network.addon_attach_pct.toFixed(0)}%).`
        });
      } else {
        opportunities.push({
          key: 'addon_attach', weight: 55,
          metric: `${branch.addon_attach_pct.toFixed(0)}%`,
          text: `Add-on attach rate is ${branch.addon_attach_pct.toFixed(0)}% (network: ${network.addon_attach_pct.toFixed(0)}%) — push warranty and protection plans at checkout.`
        });
      }

      if (network.avg_ticket > 0) {
        const diff = pct(branch.avg_ticket - network.avg_ticket, network.avg_ticket);
        if (diff >= 5) {
          strengths.push({
            key: 'avg_ticket', weight: 60,
            metric: inr(branch.avg_ticket),
            text: `Average ticket of ${inr(branch.avg_ticket)} is ${diff.toFixed(0)}% above the network average (${inr(network.avg_ticket)}).`
          });
        } else if (diff <= -10) {
          opportunities.push({
            key: 'avg_ticket', weight: 45,
            metric: inr(branch.avg_ticket),
            text: `Average ticket of ${inr(branch.avg_ticket)} trails the network (${inr(network.avg_ticket)}) by ${Math.abs(diff).toFixed(0)}% — upsell higher variants.`
          });
        }
      }
    }

    if (branch.repeat_count >= MIN_SAMPLE && branch.repeat_cr > branch.conversion_rate) {
      strengths.push({
        key: 'repeat', weight: 45,
        metric: `${branch.repeat_cr.toFixed(0)}%`,
        text: `Returning & VIP customers convert at ${branch.repeat_cr.toFixed(0)}% (${branch.repeat_count} visits) — strong relationship selling.`
      });
    }

    if (topAssociate && n(topAssociate.conversions) > 0) {
      const aCr = pct(n(topAssociate.conversions), n(topAssociate.handled));
      strengths.push({
        key: 'top_associate', weight: 50,
        metric: `${topAssociate.conversions} sales`,
        text: `${topAssociate.name} leads the floor with ${topAssociate.conversions} conversions from ${topAssociate.handled} walk-ins (${aCr.toFixed(0)}%).`
      });
    }

    const rank = (list: Insight[]) => list.sort((a, b) => b.weight - a.weight).slice(0, 4);

    res.json({
      success: true,
      data: {
        branch_id: branchId,
        timeframe_days: daysNum,
        target_conversion_rate: TARGET_CR,
        metrics: {
          branch,
          network,
          peak_walkout_window: peakWindow,
          best_hour: bestHour,
          hourly_profile: hourly,
          loss_reasons: reasonRows,
          unlogged_walkouts: unloggedWalkouts
        },
        strengths: rank(strengths),
        opportunities: rank(opportunities)
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to compute branch insights', error: error.message });
  }
};

// ==============================================================================
// Touchpoint E: Cross-Branch Head-to-Head & Benchmark Comparison (Executive)
// ==============================================================================
export const getBranchComparison = async (req: AuthRequest, res: Response) => {
  try {
    const { primary_branch_id, secondary_branch_id = 'NETWORK_AVG', days = '7' } = req.query;
    const daysNum = parseInt(days as string, 10) || 7;
    const user = req.user;

    const isGlobal = user?.roles?.includes('SUPER_ADMIN') || 
                     user?.permissions?.includes('retail:branch_comparison:global');

    let primaryId = primary_branch_id as string | undefined;

    // RBAC: Store managers can only select their own branch as Primary
    if (!isGlobal) {
      const userBranchId = user?.branch_id;
      if (!userBranchId) {
        return res.status(403).json({ success: false, message: 'Forbidden: No branch assigned to your account.' });
      }
      if (primaryId && primaryId !== userBranchId) {
        return res.status(403).json({ 
          success: false, 
          message: 'Forbidden: Store managers are restricted to comparing their assigned branch against benchmarks.' 
        });
      }
      primaryId = userBranchId;
    }

    if (!primaryId) {
      const [firstBranch]: any = await pool.query('SELECT id FROM imago_org_db.branches LIMIT 1');
      primaryId = firstBranch[0]?.id;
    }

    const resolvedPrimaryId: string = primaryId || 'NETWORK_AVG';
    const secondaryId = (secondary_branch_id as string) || 'NETWORK_AVG';

    // Helper to calculate telemetry
    const computeTelemetry = async (bId: string) => {
      const isNet = bId === 'NETWORK_AVG';
      let bMeta: any = { id: 'NETWORK_AVG', name: 'Enterprise Network Average', code: 'NETWORK', city: 'All Locations' };

      if (!isNet) {
        const [bRows]: any = await pool.query('SELECT id, name, code, city FROM imago_org_db.branches WHERE id = ?', [bId]);
        if (bRows.length > 0) bMeta = bRows[0];
      }

      const whereClause = isNet ? '' : 'AND s.branch_id = ?';
      const qParams = isNet ? [daysNum] : [daysNum, bId];

      const [sRows]: any = await pool.query(
        `SELECT 
           COUNT(s.id) as footfall,
           SUM(CASE WHEN s.status = 'CONVERTED' THEN 1 ELSE 0 END) as conversions,
           SUM(CASE WHEN s.status = 'LOST' THEN 1 ELSE 0 END) as lost_count,
           ROUND(AVG(CASE WHEN s.dwell_duration_seconds IS NOT NULL THEN s.dwell_duration_seconds / 60 ELSE NULL END), 1) as avg_dwell_minutes,
           ROUND(AVG(CASE WHEN s.engaged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, s.entered_at, s.engaged_at) / 60 ELSE NULL END), 1) as avg_greet_minutes,
           ROUND(
             CASE WHEN COUNT(CASE WHEN s.engaged_at IS NOT NULL THEN 1 ELSE NULL END) > 0
             THEN (SUM(CASE WHEN s.engaged_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, s.entered_at, s.engaged_at) <= 180 THEN 1 ELSE 0 END) / COUNT(CASE WHEN s.engaged_at IS NOT NULL THEN 1 ELSE NULL END)) * 100
             ELSE 0 END, 1
           ) as fast_greet_pct
         FROM retail_walkin_sessions s
         WHERE s.entered_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${whereClause}`,
        qParams
      );

      const summary = sRows[0] || {};
      const footfall = Number(summary.footfall) || 0;
      const conversions = Number(summary.conversions) || 0;
      const lostCount = Number(summary.lost_count) || 0;
      const conversionRate = footfall > 0 ? Number(((conversions / footfall) * 100).toFixed(1)) : 0;
      const avgGreetMinutes = summary.avg_greet_minutes != null ? Number(summary.avg_greet_minutes) : null;
      const fastGreetPct = Number(summary.fast_greet_pct) || 0;
      const avgDwellMinutes = Number(summary.avg_dwell_minutes) || 0;

      const revWhere = isNet ? '' : 'AND c.branch_id = ?';
      const revParams = isNet ? [daysNum] : [daysNum, bId];
      const [rRows]: any = await pool.query(
        `SELECT COALESCE(SUM(c.invoice_amount), 0) as total_revenue
         FROM retail_conversions c
         WHERE c.converted_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${revWhere}`,
        revParams
      );
      const totalRevenue = Number(rRows[0]?.total_revenue) || 0;
      const avgTicket = conversions > 0 ? Math.round(totalRevenue / conversions) : 0;

      const lossWhere = isNet ? '' : 'AND l.branch_id = ?';
      const lossParams = isNet ? [daysNum] : [daysNum, bId];
      const [lRows]: any = await pool.query(
        `SELECT 
           COALESCE(t.category, 'OTHER') as category,
           COALESCE(t.label, 'Other') as label,
           COUNT(l.id) as count
         FROM retail_lost_opportunities l
         LEFT JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
         WHERE l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${lossWhere}
         GROUP BY category, label
         ORDER BY count DESC
         LIMIT 6`,
        lossParams
      );

      return {
        branch_id: bMeta.id,
        branch_name: bMeta.name,
        branch_code: bMeta.code,
        city: bMeta.city,
        metrics: {
          footfall,
          conversions,
          lost_count: lostCount,
          conversion_rate: conversionRate,
          total_revenue: totalRevenue,
          avg_ticket: avgTicket,
          avg_dwell_minutes: avgDwellMinutes,
          avg_greet_minutes: avgGreetMinutes,
          fast_greet_pct: fastGreetPct
        },
        loss_reasons: lRows
      };
    };

    const [primary, secondary] = await Promise.all([
      computeTelemetry(resolvedPrimaryId),
      computeTelemetry(secondaryId)
    ]);

    // Calculate Variance
    const crDelta = Number((primary.metrics.conversion_rate - secondary.metrics.conversion_rate).toFixed(1));
    const revDelta = primary.metrics.total_revenue - secondary.metrics.total_revenue;
    const ticketDelta = primary.metrics.avg_ticket - secondary.metrics.avg_ticket;
    const greetDelta = (primary.metrics.avg_greet_minutes !== null && secondary.metrics.avg_greet_minutes !== null)
      ? Number((primary.metrics.avg_greet_minutes - secondary.metrics.avg_greet_minutes).toFixed(1))
      : 0;

    let verdictStatus = 'PARITY';
    let verdictSummary = '';
    let recommendation = '';

    if (crDelta >= 3.0) {
      verdictStatus = 'OUTPERFORMING';
      verdictSummary = `${primary.branch_name} converts at ${primary.metrics.conversion_rate}%, outperforming by +${crDelta}% points.`;
      recommendation = `Replicate ${primary.branch_name}'s floor engagement strategy and product placement across other showrooms.`;
    } else if (crDelta <= -3.0) {
      verdictStatus = 'NEEDS_WORK';
      verdictSummary = `${primary.branch_name} lags with a ${primary.metrics.conversion_rate}% conversion rate (${Math.abs(crDelta)}% points below).`;
      if (greetDelta > 1.5) {
        recommendation = `Customer greeting delays (+${greetDelta}m) correlate with high walkout rates. Enforce the 3-minute greeting rule.`;
      } else {
        recommendation = `Review product inventory availability and price negotiation flexibility to reduce unclosed walkouts.`;
      }
    } else {
      verdictStatus = 'PARITY';
      verdictSummary = `${primary.branch_name} performs in close parity with comparison showroom (${crDelta > 0 ? `+${crDelta}` : crDelta}% delta).`;
      recommendation = `Focus on incremental upsell opportunities and extended warranty/protection attach rates.`;
    }

    res.json({
      success: true,
      data: {
        timeframe_days: daysNum,
        primary,
        secondary,
        variance: {
          conversion_rate_delta: crDelta,
          revenue_delta: revDelta,
          avg_ticket_delta: ticketDelta,
          greet_speed_delta: greetDelta,
          lost_delta: primary.metrics.lost_count - secondary.metrics.lost_count
        },
        verdict: {
          status: verdictStatus,
          summary: verdictSummary,
          recommendation
        }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to compute showroom comparison', error: error.message });
  }
};

// ==============================================================================
// Touchpoint F: Store Sales Team Performance & Rep Telemetry (Store Manager)
// ==============================================================================
export const getSalesAssociatesPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const { branch_id, days = '7' } = req.query;
    const daysNum = parseInt(days as string, 10) || 7;
    const user = req.user;

    const isGlobal = user?.roles?.includes('SUPER_ADMIN') || 
                     user?.permissions?.includes('retail:staff_performance:all_branches');

    let targetBranchId = branch_id as string | undefined;

    // RBAC: If not global, strictly lock to user's assigned branch
    if (!isGlobal) {
      const userBranchId = user?.branch_id;
      if (!userBranchId) {
        return res.status(403).json({ success: false, message: 'Forbidden: No branch assigned to your account.' });
      }
      if (targetBranchId && targetBranchId !== 'ALL' && targetBranchId !== userBranchId) {
        return res.status(403).json({ 
          success: false, 
          message: 'Forbidden: You are only authorized to inspect sales staff within your assigned branch.' 
        });
      }
      targetBranchId = userBranchId;
    }

    // Default to first active branch if still undefined or 'ALL'
    if (!targetBranchId || targetBranchId === 'ALL') {
      const [firstBranch]: any = await pool.query('SELECT id FROM imago_org_db.branches LIMIT 1');
      targetBranchId = firstBranch[0]?.id;
    }

    // Fetch branch info
    const [bInfo]: any = await pool.query('SELECT id, name, code, city FROM imago_org_db.branches WHERE id = ?', [targetBranchId]);
    const branchMeta = bInfo[0] || { id: targetBranchId, name: 'Showroom', code: '', city: '' };

    // Query associates of this specific showroom branch from org DB.
    // Starting from imago_org_db.users ensures:
    // 1. Only real, active staff from the SALES department assigned to THIS showroom appear.
    // 2. People from other branches never leak into this showroom's telemetry.
    // 3. Ghost / non-existent names (e.g. mock seed entries) are completely eliminated.
    // 4. All active sales consultants assigned to this branch are visible, even if 0 walk-ins.
    const [associateRows]: any = await pool.query(
      `SELECT 
         u.id as employee_id,
         u.full_name as employee_name,
         u.employee_code as employee_code,
         d.name as department_name,
         COUNT(s.id) as handled_walkins,
         SUM(CASE WHEN s.status = 'CONVERTED' THEN 1 ELSE 0 END) as conversions,
         SUM(CASE WHEN s.status = 'LOST' THEN 1 ELSE 0 END) as lost_count,
         ROUND(
           CASE WHEN COUNT(s.id) > 0 
           THEN (SUM(CASE WHEN s.status = 'CONVERTED' THEN 1 ELSE 0 END) / COUNT(s.id)) * 100 
           ELSE 0 END, 1
         ) as conversion_rate,
         COALESCE(SUM(c.invoice_amount), 0) as total_revenue,
         ROUND(
           CASE WHEN SUM(CASE WHEN s.status = 'CONVERTED' THEN 1 ELSE 0 END) > 0 
           THEN COALESCE(SUM(c.invoice_amount), 0) / SUM(CASE WHEN s.status = 'CONVERTED' THEN 1 ELSE 0 END)
           ELSE 0 END, 0
         ) as avg_ticket,
         ROUND(AVG(CASE WHEN s.engaged_at IS NOT NULL THEN TIMESTAMPDIFF(SECOND, s.entered_at, s.engaged_at) / 60 ELSE NULL END), 1) as avg_greet_minutes,
         ROUND(
           CASE WHEN COUNT(CASE WHEN s.engaged_at IS NOT NULL THEN 1 ELSE NULL END) > 0
           THEN (SUM(CASE WHEN s.engaged_at IS NOT NULL AND TIMESTAMPDIFF(SECOND, s.entered_at, s.engaged_at) <= 180 THEN 1 ELSE 0 END) / COUNT(CASE WHEN s.engaged_at IS NOT NULL THEN 1 ELSE NULL END)) * 100
           ELSE 0 END, 1
         ) as fast_greet_pct
       FROM imago_org_db.users u
       INNER JOIN imago_org_db.departments d
         ON u.department_id = d.id
         AND d.code = 'SALES'
       LEFT JOIN retail_walkin_sessions s
         ON s.assigned_employee_id = u.id
         AND s.branch_id = u.branch_id
         AND s.entered_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       LEFT JOIN retail_conversions c ON s.id = c.session_id
       WHERE u.branch_id = ? AND u.is_active = 1
       GROUP BY u.id, u.full_name, u.employee_code, d.name
       ORDER BY conversions DESC, conversion_rate DESC, u.full_name ASC`,
      [daysNum, targetBranchId]
    );

    // Compute store benchmark
    const totalHandled = associateRows.reduce((a: number, r: any) => a + Number(r.handled_walkins), 0);
    const totalConv = associateRows.reduce((a: number, r: any) => a + Number(r.conversions), 0);
    const totalRev = associateRows.reduce((a: number, r: any) => a + Number(r.total_revenue), 0);
    const storeBenchmark = {
      conversion_rate: totalHandled > 0 ? Number(((totalConv / totalHandled) * 100).toFixed(1)) : 28.0,
      avg_ticket: totalConv > 0 ? Math.round(totalRev / totalConv) : 0,
      total_handled: totalHandled,
      total_revenue: totalRev
    };

    // Enrich each associate with tags & top loss reason
    const associates = await Promise.all(associateRows.map(async (rep: any) => {
      const cr = Number(rep.conversion_rate || 0);
      const greet = rep.avg_greet_minutes != null ? Number(rep.avg_greet_minutes) : null;
      const tags: { type: string; label: string; tone: string }[] = [];

      if (cr >= 35) {
        tags.push({ type: 'STAR_CLOSER', label: 'Star Closer', tone: 'emerald' });
      } else if (cr >= 25) {
        tags.push({ type: 'CONSISTENT', label: 'Consistent Performer', tone: 'blue' });
      } else if (Number(rep.handled_walkins) >= 2 && cr < 20) {
        tags.push({ type: 'NEEDS_COACHING', label: 'Coaching: Closing Rate', tone: 'amber' });
      }

      if (greet !== null && greet <= 2.0) {
        tags.push({ type: 'FAST_GREETER', label: `Fast Greet (${greet}m)`, tone: 'emerald' });
      } else if (greet !== null && greet > 4.0) {
        tags.push({ type: 'SLOW_GREETER', label: `Coaching: Greet Speed (${greet}m)`, tone: 'amber' });
      }

      // Top loss reason for this associate
      let topLoss = 'NONE';
      if (rep.employee_id) {
        const [lRows]: any = await pool.query(
          `SELECT t.label, COUNT(*) as count 
           FROM retail_lost_opportunities l
           JOIN retail_reason_taxonomies t ON l.taxonomy_id = t.id
           JOIN retail_walkin_sessions s ON l.session_id = s.id
           WHERE s.assigned_employee_id = ? AND l.logged_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
           GROUP BY t.label ORDER BY count DESC LIMIT 1`,
          [rep.employee_id, daysNum]
        );
        if (lRows.length > 0) topLoss = lRows[0].label;
      }

      return {
        ...rep,
        conversion_rate: cr,
        total_revenue: Number(rep.total_revenue || 0),
        avg_ticket: Number(rep.avg_ticket || 0),
        top_loss_reason: topLoss,
        tags
      };
    }));

    res.json({
      success: true,
      data: {
        branch: branchMeta,
        timeframe_days: daysNum,
        store_benchmark: storeBenchmark,
        associates
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch sales associates telemetry', error: error.message });
  }
};

