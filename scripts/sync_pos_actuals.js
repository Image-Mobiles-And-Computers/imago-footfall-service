const mysql = require('mysql2/promise');

async function syncPosActuals() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: 'IMAGE@Local!2026',
    database: 'imago_footfall_db'
  });

  console.log('Connected to imago_footfall_db');

  // 1. Fetch exact POS actuals from retail_conversions for 2026-10
  const [convRows] = await conn.query(`
    SELECT 
      branch_id, 
      COUNT(*) as count, 
      COALESCE(SUM(invoice_amount), 0) as total_rev,
      MAX(converted_at) as last_sale,
      MIN(converted_at) as first_sale
    FROM retail_conversions 
    WHERE DATE_FORMAT(converted_at, '%Y-%m') = '2026-10'
    GROUP BY branch_id
  `);
  console.log('Authentic POS conversions from retail_conversions:', convRows);

  // 2. Fetch canonical branches
  const [branches] = await conn.query(`
    SELECT id, name, code FROM imago_org_db.branches WHERE type IN ('SHOWROOM', 'SERVICE_CENTER')
  `);

  // Clear old pacing rows with artificial data
  await conn.query(`TRUNCATE TABLE ho_sales_daily_pacing;`);

  // Elapsed days: latest POS sale is 2026-10-28, so 28 of 31 days
  const elapsedDays = 28;
  const totalDays = 31;
  const elapsedRatio = elapsedDays / totalDays;

  for (const b of branches) {
    const conv = convRows.find(c => c.branch_id === b.id) || { count: 0, total_rev: 0, last_sale: null };
    const rev = Number(conv.total_rev);
    const units = Number(conv.count);
    const margin = Math.round(rev * 0.08);
    const snapshotDate = conv.last_sale ? new Date(conv.last_sale).toISOString().slice(0, 10) : '2026-10-28';

    // Target from ho_sales_targets
    const [tRows] = await conn.query(
      `SELECT target_revenue, target_unit_volume FROM ho_sales_targets WHERE branch_id = ? AND fiscal_month = '2026-10'`,
      [b.id]
    );
    const targetRev = tRows[0]?.target_revenue ? Number(tRows[0].target_revenue) : 50000000;
    const targetUnits = tRows[0]?.target_unit_volume ? Number(tRows[0].target_unit_volume) : 2200;

    const runRate = targetRev * elapsedRatio;
    const pacing = runRate > 0 ? Math.round((rev / runRate) * 100) : 0;
    let status = 'CRITICAL_LAG';
    if (pacing >= 100) status = 'ON_TRACK';
    else if (pacing >= 85) status = 'MILD_LAG';

    const cleanCode = b.code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const snapId = `snap-${cleanCode}-20261028`;

    await conn.query(
      `INSERT INTO ho_sales_daily_pacing (
        id, snapshot_date, branch_id, branch_name, actual_revenue_mtd, target_revenue_mtd,
        pacing_percent, actual_units_mtd, target_units_mtd, gross_margin_mtd, status, key_growth_oem
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        snapId,
        snapshotDate,
        b.id,
        b.name,
        rev,
        targetRev,
        pacing,
        units,
        targetUnits,
        margin,
        status,
        units > 0 ? `POS Telemetry (${units} bills)` : 'Awaiting POS Bill'
      ]
    );

    console.log(`✅ Synced ${b.code} (${b.name}): rev=₹${rev}, units=${units}, date=${snapshotDate}, pacing=${pacing}%`);
  }

  const [pacing] = await conn.query('SELECT branch_name, actual_revenue_mtd, actual_units_mtd, snapshot_date FROM ho_sales_daily_pacing');
  console.log('Updated ho_sales_daily_pacing:', pacing);

  await conn.end();
}

syncPosActuals().catch(console.error);
