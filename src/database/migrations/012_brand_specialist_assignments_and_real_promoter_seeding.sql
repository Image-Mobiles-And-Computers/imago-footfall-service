-- ==============================================================================
-- IMAGO Head Office Sales Operations & Commercial Command Engine
-- Migration: 012_brand_specialist_assignments_and_real_promoter_seeding.sql
-- Create retail_brand_specialist_assignments table, populate authentic staff,
-- and re-link POS conversion records to real employee UUIDs.
-- ==============================================================================

USE `imago_footfall_db`;

-- 1. Create Brand Specialist & Promoter Assignments Master
CREATE TABLE IF NOT EXISTS `retail_brand_specialist_assignments` (
  `id` VARCHAR(36) PRIMARY KEY,
  `employee_id` VARCHAR(36) NOT NULL,
  `employee_code` VARCHAR(50) NULL,
  `employee_name` VARCHAR(150) NOT NULL,
  `branch_id` VARCHAR(36) NOT NULL,
  `branch_name` VARCHAR(150) NOT NULL,
  `brand_id` VARCHAR(36) NOT NULL,
  `brand_name` VARCHAR(100) NOT NULL,
  `specialist_type` ENUM('BRAND_PROMOTER', 'IN_HOUSE_SPECIALIST', 'GENERAL_ASSOCIATE') DEFAULT 'BRAND_PROMOTER',
  `monthly_target_units` INT NOT NULL DEFAULT 25,
  `monthly_subsidy_amount` DECIMAL(12,2) NOT NULL DEFAULT 28000.00,
  `is_paging_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_spec_emp` (`employee_id`),
  INDEX `idx_spec_brand` (`brand_id`),
  INDEX `idx_spec_branch` (`branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Add brand specialization columns to floor status table
ALTER TABLE `retail_staff_floor_status`
  ADD COLUMN `assigned_brand_id` VARCHAR(36) NULL AFTER `floor_zone`,
  ADD COLUMN `assigned_brand_name` VARCHAR(100) NULL AFTER `assigned_brand_id`;

-- 3. Seed Official Specialist / Promoter Assignments for Real Employees
INSERT INTO `retail_brand_specialist_assignments` 
  (`id`, `employee_id`, `employee_code`, `employee_name`, `branch_id`, `branch_name`, `brand_id`, `brand_name`, `specialist_type`, `monthly_target_units`, `monthly_subsidy_amount`, `is_paging_enabled`, `is_active`)
VALUES
  (
    'spec-kavitha-sam',
    '2a4026d7-0e2c-45e6-852c-3fab3e2e39ab',
    'IMG-203',
    'Kavitha Shetty',
    '830f08dd-12d9-49da-86e8-b52a55d2eda5',
    'Koramangala Tech Showroom',
    '4d6225fa-cd2e-11f1-88c3-fb786697c513',
    'Samsung',
    'BRAND_PROMOTER',
    25,
    28000.00,
    1,
    1
  ),
  (
    'spec-divya-sam',
    'b744f123-bad2-4ca9-9858-931c94e9c27d',
    'IMG-304',
    'Divya Subramaniam',
    'b9b0ae39-54d9-4322-9448-0c917d79de93',
    'Jayanagar Retail Showroom',
    '4d6225fa-cd2e-11f1-88c3-fb786697c513',
    'Samsung',
    'BRAND_PROMOTER',
    25,
    28000.00,
    1,
    1
  ),
  (
    'spec-arun-sam',
    'ab16af43-1f08-435b-89d7-92ed2b518a88',
    'IMG-102',
    'Arun Krishnamurthy',
    'c9832255-2791-401d-88b5-a3d2c870c533',
    'Indiranagar Flagship Showroom',
    '4d6225fa-cd2e-11f1-88c3-fb786697c513',
    'Samsung',
    'BRAND_PROMOTER',
    25,
    28000.00,
    1,
    1
  ),
  (
    'spec-priya-apl',
    '1c425672-716d-4dcd-a1a3-f1ef3cd4bfc2',
    'IMG-101',
    'Priya Sundaram',
    'c9832255-2791-401d-88b5-a3d2c870c533',
    'Indiranagar Flagship Showroom',
    '4d620db8-cd2e-11f1-88c3-fb786697c513',
    'Apple',
    'IN_HOUSE_SPECIALIST',
    30,
    35000.00,
    1,
    1
  ),
  (
    'spec-pooja-apl',
    '342ceba3-02ca-4bc5-a938-30549a6b93b5',
    'IMG-302',
    'Pooja Hegde',
    'b9b0ae39-54d9-4322-9448-0c917d79de93',
    'Jayanagar Retail Showroom',
    '4d620db8-cd2e-11f1-88c3-fb786697c513',
    'Apple',
    'IN_HOUSE_SPECIALIST',
    30,
    35000.00,
    1,
    1
  ),
  (
    'spec-arjun-op',
    'a6c01edb-190c-4d92-b4ad-76b54650d183',
    'IMG-204',
    'Arjun Bhat',
    '830f08dd-12d9-49da-86e8-b52a55d2eda5',
    'Koramangala Tech Showroom',
    '4d623554-cd2e-11f1-88c3-fb786697c513',
    'OnePlus',
    'BRAND_PROMOTER',
    22,
    24000.00,
    1,
    1
  ),
  (
    'spec-sneha-sony',
    '82b0edfb-949f-4397-8646-e82963750f13',
    'IMG-201',
    'Sneha Pillai',
    '830f08dd-12d9-49da-86e8-b52a55d2eda5',
    'Koramangala Tech Showroom',
    '4d62a53e-cd2e-11f1-88c3-fb786697c513',
    'Sony',
    'IN_HOUSE_SPECIALIST',
    20,
    20000.00,
    1,
    1
  )
ON DUPLICATE KEY UPDATE
  `employee_name` = VALUES(`employee_name`),
  `brand_name` = VALUES(`brand_name`),
  `monthly_target_units` = VALUES(`monthly_target_units`),
  `monthly_subsidy_amount` = VALUES(`monthly_subsidy_amount`),
  `is_paging_enabled` = VALUES(`is_paging_enabled`),
  `is_active` = VALUES(`is_active`);

-- 4. Re-link POS Conversions to Real Employee UUIDs and Real Brand IDs
UPDATE `retail_conversions`
SET `sales_employee_id` = '2a4026d7-0e2c-45e6-852c-3fab3e2e39ab',
    `sales_employee_name` = 'Kavitha Shetty',
    `brand_id` = '4d6225fa-cd2e-11f1-88c3-fb786697c513',
    `brand_name` = 'Samsung'
WHERE `sales_employee_name` = 'Kavitha Shetty' OR `sales_employee_id` = 'usr-kavitha';

UPDATE `retail_conversions`
SET `sales_employee_id` = 'b744f123-bad2-4ca9-9858-931c94e9c27d',
    `sales_employee_name` = 'Divya Subramaniam',
    `brand_id` = '4d6225fa-cd2e-11f1-88c3-fb786697c513',
    `brand_name` = 'Samsung'
WHERE `sales_employee_name` = 'Divya Subramaniam' OR `sales_employee_id` = 'usr-divya';

UPDATE `retail_conversions`
SET `sales_employee_id` = '1c425672-716d-4dcd-a1a3-f1ef3cd4bfc2',
    `sales_employee_name` = 'Priya Sundaram',
    `brand_id` = '4d620db8-cd2e-11f1-88c3-fb786697c513',
    `brand_name` = 'Apple'
WHERE `sales_employee_name` = 'Priya Sundaram' OR (`sales_employee_name` = 'Rahul Sharma' AND (`brand_name` LIKE '%Apple%' OR `product_sku` LIKE 'APL%'));

UPDATE `retail_conversions`
SET `sales_employee_id` = 'a6c01edb-190c-4d92-b4ad-76b54650d183',
    `sales_employee_name` = 'Arjun Bhat',
    `brand_id` = '4d623554-cd2e-11f1-88c3-fb786697c513',
    `brand_name` = 'OnePlus'
WHERE `sales_employee_name` = 'Arjun Bhat' OR `sales_employee_id` = 'usr-arjun';

UPDATE `retail_conversions`
SET `sales_employee_id` = 'ab16af43-1f08-435b-89d7-92ed2b518a88',
    `sales_employee_name` = 'Arun Krishnamurthy',
    `brand_id` = '4d6225fa-cd2e-11f1-88c3-fb786697c513',
    `brand_name` = 'Samsung'
WHERE `sales_employee_name` = 'Arun Krishnamurthy' OR `sales_employee_id` = 'usr-arun';
