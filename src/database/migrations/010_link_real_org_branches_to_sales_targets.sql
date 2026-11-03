-- ==============================================================================
-- IMAGO Head Office Sales Operations Schema
-- Migration: 010_link_real_org_branches_to_sales_targets.sql
-- Link canonical branch UUIDs from imago_org_db.branches to ho_sales_targets
-- ==============================================================================

USE `imago_footfall_db`;

-- 1. Remove old mock/placeholder branch records
DELETE FROM `ho_sales_targets` WHERE `branch_id` IN ('br-chn-tnagar', 'br-chn-annanagar', 'br-hyd-hitech', 'br-blr-indiranagar', 'br-blr-koramangala');

-- 2. Seed Real Canonical Showrooms for October 2026
-- Total Network Target: ₹22.80 Cr across Bangalore Showrooms & Service Hub
INSERT INTO `ho_sales_targets` 
  (`id`, `fiscal_month`, `branch_id`, `branch_name`, `branch_code`, `brand_name`, `category_name`, `target_revenue`, `target_unit_volume`, `min_gross_margin_percent`, `care_attach_percent`, `created_by_ho_user_id`)
VALUES
  (
    'tgt-indira-202610',
    '2026-10',
    'c9832255-2791-401d-88b5-a3d2c870c533',
    'Indiranagar Flagship Showroom',
    'BR-SH-INDIRA',
    'Apple',
    'Smartphones',
    82000000.00,
    3600,
    6.80,
    26.00,
    'SYSTEM'
  ),
  (
    'tgt-kora-202610',
    '2026-10',
    '830f08dd-12d9-49da-86e8-b52a55d2eda5',
    'Koramangala Tech Showroom',
    'BR-SH-KORA',
    'Samsung',
    'Smartphones',
    64000000.00,
    2850,
    6.50,
    24.00,
    'SYSTEM'
  ),
  (
    'tgt-jaya-202610',
    '2026-10',
    'b9b0ae39-54d9-4322-9448-0c917d79de93',
    'Jayanagar Retail Showroom',
    'BR-SH-JAYA',
    'OnePlus',
    'Smartphones',
    52000000.00,
    2300,
    6.40,
    22.00,
    'SYSTEM'
  ),
  (
    'tgt-serv-202610',
    '2026-10',
    '4bcbf749-d0e3-4043-a24e-82d7dfba367f',
    'Indiranagar Service & Repair Hub',
    'BR-SC-INDIRA',
    'AppleCare / Spares',
    'Service & Repairs',
    30000000.00,
    1400,
    9.50,
    35.00,
    'SYSTEM'
  )
ON DUPLICATE KEY UPDATE 
  `target_revenue` = VALUES(`target_revenue`),
  `target_unit_volume` = VALUES(`target_unit_volume`),
  `branch_name` = VALUES(`branch_name`),
  `branch_code` = VALUES(`branch_code`);
