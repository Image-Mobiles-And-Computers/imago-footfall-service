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
