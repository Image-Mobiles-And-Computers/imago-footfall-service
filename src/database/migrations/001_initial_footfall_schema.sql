-- ==============================================================================
-- IMAGO Footfall & Retail Conversion Domain Schema
-- Migration: 001_initial_footfall_schema.sql
-- ==============================================================================

-- 1. Master Brand Lookup
CREATE TABLE IF NOT EXISTS `retail_brand_master` (
    `id` VARCHAR(36) PRIMARY KEY,
    `code` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(100) NOT NULL UNIQUE,
    `tier` ENUM('FLAGSHIP', 'PREMIUM', 'MASS_MARKET', 'BUDGET') NOT NULL DEFAULT 'PREMIUM',
    `category_focus` VARCHAR(100) NULL,
    `logo_url` VARCHAR(255) NULL,
    `display_order` INT DEFAULT 0,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_brand_active` (`is_active`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Master Category Lookup
CREATE TABLE IF NOT EXISTS `retail_category_master` (
    `id` VARCHAR(36) PRIMARY KEY,
    `code` VARCHAR(50) NOT NULL UNIQUE,
    `name` VARCHAR(100) NOT NULL UNIQUE,
    `icon` VARCHAR(50) NULL,
    `display_order` INT DEFAULT 0,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_cat_active` (`is_active`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Master Reason Taxonomy Lookup
CREATE TABLE IF NOT EXISTS `retail_reason_taxonomies` (
    `id` VARCHAR(36) PRIMARY KEY,
    `category` ENUM('PRICE_COMMERCIAL', 'INVENTORY_STOCK', 'CUSTOMER_INTENT', 'STORE_SERVICE') NOT NULL,
    `code` VARCHAR(50) NOT NULL UNIQUE,
    `label` VARCHAR(150) NOT NULL,
    `requires_competitor_info` BOOLEAN DEFAULT FALSE,
    `requires_sku_info` BOOLEAN DEFAULT FALSE,
    `requires_price_diff` BOOLEAN DEFAULT FALSE,
    `display_order` INT DEFAULT 0,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_tax_category` (`category`, `display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Master Product Taxonomy (Option 2 Decoupled Catalog)
CREATE TABLE IF NOT EXISTS `retail_product_master` (
    `id` VARCHAR(36) PRIMARY KEY,
    `brand_id` VARCHAR(36) NOT NULL,
    `brand_name` VARCHAR(100) NOT NULL,
    `category_id` VARCHAR(36) NOT NULL,
    `category_name` VARCHAR(100) NOT NULL,
    `model_name` VARCHAR(150) NOT NULL,
    `default_variant` VARCHAR(100) NULL,
    `msrp` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`brand_id`) REFERENCES `retail_brand_master`(`id`),
    FOREIGN KEY (`category_id`) REFERENCES `retail_category_master`(`id`),
    UNIQUE KEY `uk_brand_model` (`brand_id`, `model_name`),
    INDEX `idx_prod_search` (`brand_name`, `model_name`),
    INDEX `idx_prod_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Physical Store Walk-In Sessions
CREATE TABLE IF NOT EXISTS `retail_walkin_sessions` (
    `id` VARCHAR(36) PRIMARY KEY,
    `branch_id` VARCHAR(36) NOT NULL,
    `session_number` VARCHAR(64) NOT NULL UNIQUE,
    `customer_phone` VARCHAR(20) NULL,
    `customer_name` VARCHAR(100) NULL,
    `customer_type` ENUM('NEW', 'RETURNING', 'VIP', 'ANONYMOUS') DEFAULT 'ANONYMOUS',
    `primary_category_id` VARCHAR(36) NULL,
    `primary_category_name` VARCHAR(100) NULL,
    `assigned_employee_id` VARCHAR(36) NULL,
    `assigned_employee_name` VARCHAR(150) NULL,
    `greeter_employee_id` VARCHAR(36) NULL,
    `status` ENUM('ENTERED', 'ENGAGED', 'CHECKOUT_INITIATED', 'CONVERTED', 'LOST', 'SERVICE_ONLY') NOT NULL DEFAULT 'ENTERED',
    `entered_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `engaged_at` TIMESTAMP NULL,
    `exited_at` TIMESTAMP NULL,
    `dwell_duration_seconds` INT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_walkin_branch_date` (`branch_id`, `entered_at`),
    INDEX `idx_walkin_phone` (`customer_phone`),
    INDEX `idx_walkin_employee` (`assigned_employee_id`),
    INDEX `idx_walkin_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Converted Transactions Reconciliation
CREATE TABLE IF NOT EXISTS `retail_conversions` (
    `id` VARCHAR(36) PRIMARY KEY,
    `session_id` VARCHAR(36) NOT NULL UNIQUE,
    `branch_id` VARCHAR(36) NOT NULL,
    `invoice_number` VARCHAR(100) NOT NULL UNIQUE,
    `invoice_amount` DECIMAL(12, 2) NOT NULL,
    `payment_method` ENUM('CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'UPI', 'FINANCE_EMI', 'MIXED') NOT NULL DEFAULT 'UPI',
    `sales_employee_id` VARCHAR(36) NULL,
    `sales_employee_name` VARCHAR(150) NULL,
    `sold_skus` JSON NULL,
    `converted_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`session_id`) REFERENCES `retail_walkin_sessions`(`id`) ON DELETE CASCADE,
    INDEX `idx_conversion_branch` (`branch_id`, `converted_at`),
    INDEX `idx_conversion_employee` (`sales_employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Lost Opportunities & Non-Conversion Root-Cause Logs
CREATE TABLE IF NOT EXISTS `retail_lost_opportunities` (
    `id` VARCHAR(36) PRIMARY KEY,
    `session_id` VARCHAR(36) NOT NULL UNIQUE,
    `branch_id` VARCHAR(36) NOT NULL,
    `taxonomy_id` VARCHAR(36) NOT NULL,
    `product_id` VARCHAR(36) NULL,
    `brand_id` VARCHAR(36) NULL,
    `requested_sku` VARCHAR(150) NULL,
    `customer_budget` DECIMAL(12, 2) NULL,
    `quoted_price` DECIMAL(12, 2) NULL,
    `competitor_name` VARCHAR(100) NULL,
    `competitor_price` DECIMAL(12, 2) NULL,
    `notes` TEXT NULL,
    `logged_by_employee_id` VARCHAR(36) NOT NULL,
    `logged_by_employee_name` VARCHAR(150) NULL,
    `logged_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`session_id`) REFERENCES `retail_walkin_sessions`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`taxonomy_id`) REFERENCES `retail_reason_taxonomies`(`id`),
    FOREIGN KEY (`brand_id`) REFERENCES `retail_brand_master`(`id`),
    FOREIGN KEY (`product_id`) REFERENCES `retail_product_master`(`id`),
    INDEX `idx_lost_branch_date` (`branch_id`, `logged_at`),
    INDEX `idx_lost_taxonomy` (`taxonomy_id`),
    INDEX `idx_lost_brand` (`brand_id`),
    INDEX `idx_lost_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Session State Transition Audit Timeline
CREATE TABLE IF NOT EXISTS `retail_session_timeline` (
    `id` VARCHAR(36) PRIMARY KEY,
    `session_id` VARCHAR(36) NOT NULL,
    `from_status` VARCHAR(50) NULL,
    `to_status` VARCHAR(50) NOT NULL,
    `triggered_by_user_id` VARCHAR(36) NULL,
    `notes` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`session_id`) REFERENCES `retail_walkin_sessions`(`id`) ON DELETE CASCADE,
    INDEX `idx_timeline_session` (`session_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
