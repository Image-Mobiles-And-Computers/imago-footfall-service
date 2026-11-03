-- ==============================================================================
-- IMAGO Head Office Sales Operations & Commercial Command Engine Schema
-- Migration: 009_head_office_sales_command_schema.sql
-- Domain 9: Real-time Quotas, Branch Pacing, Remote Deal Desk & OEM Contracts
-- ==============================================================================

USE `imago_footfall_db`;

-- 1. Head Office Sales Team Roster & Permission Scopes
CREATE TABLE IF NOT EXISTS `ho_sales_team_members` (
    `id` VARCHAR(36) PRIMARY KEY,
    `user_id` VARCHAR(36) NOT NULL UNIQUE,
    `full_name` VARCHAR(100) NOT NULL,
    `role` ENUM('VP_SALES', 'COMMERCIAL_OPS_MANAGER', 'REGIONAL_SALES_HEAD', 'DEAL_DESK_OFFICER') NOT NULL,
    `assigned_region` VARCHAR(50) DEFAULT 'ALL_REGIONS',
    `max_discount_approval_limit` DECIMAL(10, 2) NOT NULL DEFAULT 5000.00,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Monthly Target Quotas (Branch, Brand & Category)
CREATE TABLE IF NOT EXISTS `ho_sales_targets` (
    `id` VARCHAR(36) PRIMARY KEY,
    `fiscal_month` VARCHAR(7) NOT NULL,
    `branch_id` VARCHAR(36) NOT NULL,
    `branch_name` VARCHAR(100) NOT NULL,
    `branch_code` VARCHAR(20) NOT NULL,
    `brand_name` VARCHAR(50) NULL,
    `category_name` VARCHAR(50) NULL,
    `target_revenue` DECIMAL(14, 2) NOT NULL,
    `target_unit_volume` INT NOT NULL,
    `min_gross_margin_percent` DECIMAL(5, 2) NOT NULL DEFAULT 6.50,
    `care_attach_percent` DECIMAL(5, 2) NOT NULL DEFAULT 22.00,
    `created_by_ho_user_id` VARCHAR(36) NOT NULL DEFAULT 'SYSTEM',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_branch_month` (`fiscal_month`, `branch_id`),
    INDEX `idx_target_month` (`fiscal_month`, `branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Daily Target Pacing & Revenue Snapshot
CREATE TABLE IF NOT EXISTS `ho_sales_daily_pacing` (
    `id` VARCHAR(36) PRIMARY KEY,
    `snapshot_date` DATE NOT NULL,
    `branch_id` VARCHAR(36) NOT NULL,
    `branch_name` VARCHAR(100) NOT NULL,
    `actual_revenue_mtd` DECIMAL(14, 2) NOT NULL,
    `target_revenue_mtd` DECIMAL(14, 2) NOT NULL,
    `pacing_percent` DECIMAL(6, 2) NOT NULL,
    `actual_units_mtd` INT NOT NULL,
    `target_units_mtd` INT NOT NULL,
    `gross_margin_mtd` DECIMAL(14, 2) NOT NULL,
    `status` ENUM('ON_TRACK', 'MILD_LAG', 'CRITICAL_LAG') NOT NULL,
    `key_growth_oem` VARCHAR(100) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_date_branch` (`snapshot_date`, `branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Real-Time Remote Price Exception & Discount Approval Tickets
CREATE TABLE IF NOT EXISTS `ho_price_exception_requests` (
    `id` VARCHAR(36) PRIMARY KEY,
    `ticket_number` VARCHAR(50) NOT NULL UNIQUE,
    `branch_id` VARCHAR(36) NOT NULL,
    `branch_name` VARCHAR(100) NOT NULL,
    `terminal_id` VARCHAR(36) NOT NULL,
    `cashier_user_id` VARCHAR(36) NOT NULL,
    `cashier_name` VARCHAR(100) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `product_sku` VARCHAR(100) NOT NULL,
    `product_name` VARCHAR(150) NOT NULL,
    `mrp` DECIMAL(10, 2) NOT NULL,
    `landed_cost_fifo` DECIMAL(10, 2) NOT NULL,
    `standard_mop` DECIMAL(10, 2) NOT NULL,
    `requested_discount` DECIMAL(10, 2) NOT NULL,
    `discount_reason` VARCHAR(255) NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'COUNTER_OFFERED', 'REJECTED', 'EXPIRED_ESCALATED') DEFAULT 'PENDING',
    `approved_discount` DECIMAL(10, 2) NULL,
    `counter_bundle_notes` VARCHAR(255) NULL,
    `reviewed_by_user_id` VARCHAR(36) NULL,
    `reviewed_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `expires_at` TIMESTAMP NULL,
    INDEX `idx_ticket_status` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. OEM Brand Target Commitments & Backend Rebate Contracts
CREATE TABLE IF NOT EXISTS `ho_brand_oem_contracts` (
    `id` VARCHAR(36) PRIMARY KEY,
    `brand_name` VARCHAR(100) NOT NULL,
    `fiscal_quarter` VARCHAR(10) NOT NULL,
    `target_purchase_volume` DECIMAL(14, 2) NOT NULL,
    `rebate_percentage` DECIMAL(5, 2) NOT NULL,
    `min_achievement_percent` DECIMAL(5, 2) NOT NULL DEFAULT 95.00,
    `care_attach_target_percent` DECIMAL(5, 2) NOT NULL DEFAULT 22.00,
    `mdf_per_unit` DECIMAL(10, 2) NOT NULL DEFAULT 500.00,
    `promoter_min_units_threshold` INT NOT NULL DEFAULT 25,
    `promoter_subsidy_amount_per_rep` DECIMAL(10, 2) NOT NULL DEFAULT 28000.00,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Sales Spiffs, Contests & Incentive Campaigns
CREATE TABLE IF NOT EXISTS `ho_sales_incentive_campaigns` (
    `id` VARCHAR(36) PRIMARY KEY,
    `campaign_title` VARCHAR(150) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `target_brand_name` VARCHAR(50) NULL,
    `spiff_amount_per_unit` DECIMAL(10, 2) NOT NULL,
    `max_total_budget` DECIMAL(12, 2) NOT NULL,
    `spent_to_date` DECIMAL(12, 2) DEFAULT 0.00,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_by_ho_user_id` VARCHAR(36) NOT NULL DEFAULT 'SYSTEM',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Earned Spiff Payout Ledger (Sync to HR Payroll)
CREATE TABLE IF NOT EXISTS `ho_incentive_payout_ledger` (
    `id` VARCHAR(36) PRIMARY KEY,
    `campaign_id` VARCHAR(36) NOT NULL,
    `invoice_id` VARCHAR(36) NOT NULL,
    `employee_id` VARCHAR(36) NOT NULL,
    `employee_name` VARCHAR(100) NOT NULL,
    `earned_amount` DECIMAL(10, 2) NOT NULL,
    `earned_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `is_payroll_processed` BOOLEAN DEFAULT FALSE,
    `payroll_batch_id` VARCHAR(36) NULL,
    INDEX `idx_spiff_rep` (`employee_id`, `is_payroll_processed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Unified Fleet Broadcast Bundles (Kiosk & Greeting Pushes)
CREATE TABLE IF NOT EXISTS `ho_fleet_broadcast_bundles` (
    `id` VARCHAR(36) PRIMARY KEY,
    `bundle_name` VARCHAR(150) NOT NULL,
    `target_stores` ENUM('ALL_STORES', 'KARNATAKA_STORES', 'TAMIL_NADU_STORES', 'SPECIFIC_STORES') DEFAULT 'ALL_STORES',
    `kiosk_campaign_id` VARCHAR(36) NULL,
    `greeting_campaign_id` VARCHAR(36) NULL,
    `dispatched_by_ho_user_id` VARCHAR(36) NOT NULL DEFAULT 'SYSTEM',
    `dispatched_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `acknowledged_terminal_count` INT DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- INITIAL SEED DATA FOR CURRENT FISCAL MONTH (2026-10 / 2026-11)
-- ==============================================================================

-- Seed Default Showroom Quotas for 2026-10
INSERT INTO `ho_sales_targets` 
  (`id`, `fiscal_month`, `branch_id`, `branch_name`, `branch_code`, `brand_name`, `category_name`, `target_revenue`, `target_unit_volume`, `min_gross_margin_percent`, `care_attach_percent`)
VALUES
  ('tgt-blr-01-202610', '2026-10', 'br-blr-indiranagar', 'Indiranagar Flagship', 'KA-01', 'Apple', 'Smartphones', 31000000.00, 1450, 6.80, 24.00),
  ('tgt-blr-02-202610', '2026-10', 'br-blr-koramangala', 'Koramangala Tech Hub', 'KA-02', 'Samsung', 'Smartphones', 29000000.00, 1380, 6.50, 22.00),
  ('tgt-chn-01-202610', '2026-10', 'br-chn-annanagar', 'Anna Nagar High St', 'TN-01', 'OnePlus', 'Smartphones', 25000000.00, 1200, 6.20, 20.00),
  ('tgt-chn-02-202610', '2026-10', 'br-chn-tnagar', 'T. Nagar Commercial', 'TN-02', 'Apple', 'Smartphones', 36000000.00, 1680, 7.00, 25.00),
  ('tgt-hyd-01-202610', '2026-10', 'br-hyd-hitech', 'Hyderabad Cyber Gateway', 'TS-01', 'Vivo', 'Smartphones', 23000000.00, 1150, 6.40, 21.00)
ON DUPLICATE KEY UPDATE 
  `target_revenue` = VALUES(`target_revenue`),
  `target_unit_volume` = VALUES(`target_unit_volume`);

-- Seed Default OEM Rebate Contracts (2026-Q4)
INSERT INTO `ho_brand_oem_contracts`
  (`id`, `brand_name`, `fiscal_quarter`, `target_purchase_volume`, `rebate_percentage`, `min_achievement_percent`, `care_attach_target_percent`, `mdf_per_unit`, `promoter_min_units_threshold`, `promoter_subsidy_amount_per_rep`)
VALUES
  ('oem-apple-2026q4', 'Apple India Direct Tier-1', '2026-Q4', 350000000.00, 2.50, 95.00, 22.00, 500.00, 30, 35000.00),
  ('oem-samsung-2026q4', 'Samsung Electronics India', '2026-Q4', 280000000.00, 2.80, 92.00, 18.00, 400.00, 25, 28000.00),
  ('oem-oneplus-2026q4', 'OnePlus India Exclusive', '2026-Q4', 150000000.00, 2.20, 90.00, 15.00, 350.00, 22, 24000.00)
ON DUPLICATE KEY UPDATE
  `target_purchase_volume` = VALUES(`target_purchase_volume`);
