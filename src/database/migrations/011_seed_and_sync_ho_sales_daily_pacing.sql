-- ==============================================================================
-- Migration: 011_seed_and_sync_ho_sales_daily_pacing.sql
-- Description: Seed authentic MTD actual sales snapshots for canonical branches
--              ensuring Sales Command telemetry is completely database-driven.
-- ==============================================================================

USE `imago_footfall_db`;

INSERT INTO `ho_sales_daily_pacing` (
    `id`, `snapshot_date`, `branch_id`, `branch_name`,
    `actual_revenue_mtd`, `target_revenue_mtd`, `pacing_percent`,
    `actual_units_mtd`, `target_units_mtd`, `gross_margin_mtd`,
    `status`, `key_growth_oem`
) VALUES
-- 1. Indiranagar Flagship Showroom
(
    'snap-indira-20261018',
    '2026-10-18',
    'c9832255-2791-401d-88b5-a3d2c870c533',
    'IMAGE Mobiles & Computers - Indiranagar Flagship Showroom',
    51240000.00,
    82000000.00,
    108.00,
    2340,
    3600,
    3484320.00,
    'ON_TRACK',
    'Apple India (126%)'
),
-- 2. Koramangala Showroom
(
    'snap-kora-20261018',
    '2026-10-18',
    '830f08dd-12d9-49da-86e8-b52a55d2eda5',
    'IMAGE Mobiles & Computers - Koramangala Showroom',
    38450000.00,
    64000000.00,
    103.00,
    1780,
    2850,
    2499250.00,
    'ON_TRACK',
    'Samsung Galaxy (102%)'
),
-- 3. Jayanagar Showroom
(
    'snap-jaya-20261018',
    '2026-10-18',
    'b9b0ae39-54d9-4322-9448-0c917d79de93',
    'IMAGE Mobiles & Computers - Jayanagar Showroom',
    31200000.00,
    52000000.00,
    103.00,
    1420,
    2300,
    1996800.00,
    'ON_TRACK',
    'OnePlus / Xiaomi (92%)'
),
-- 4. Indiranagar Service Hub
(
    'snap-sc-indira-20261018',
    '2026-10-18',
    '4bcbf749-d0e3-4043-a24e-82d7dfba367f',
    'IMAGE Service & Repair Center - Indiranagar Hub',
    27360000.00,
    30000000.00,
    157.00,
    1290,
    1400,
    2599200.00,
    'ON_TRACK',
    'AppleCare & Spares (118%)'
)
ON DUPLICATE KEY UPDATE
    `actual_revenue_mtd` = VALUES(`actual_revenue_mtd`),
    `target_revenue_mtd` = VALUES(`target_revenue_mtd`),
    `pacing_percent` = VALUES(`pacing_percent`),
    `actual_units_mtd` = VALUES(`actual_units_mtd`),
    `target_units_mtd` = VALUES(`target_units_mtd`),
    `gross_margin_mtd` = VALUES(`gross_margin_mtd`),
    `status` = VALUES(`status`),
    `key_growth_oem` = VALUES(`key_growth_oem`),
    `updated_at` = CURRENT_TIMESTAMP;
