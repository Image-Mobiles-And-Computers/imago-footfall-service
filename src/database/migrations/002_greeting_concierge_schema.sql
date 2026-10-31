-- ==============================================================================
-- IMAGO Footfall & Retail Conversion Domain Schema
-- Migration: 002_greeting_concierge_schema.sql
-- Store Greeting Table & Front-Desk Concierge Sub-Module
-- ==============================================================================

-- 1. Greeting Desk Terminals (Hardware registry per branch & HO Fleet Sync)
CREATE TABLE IF NOT EXISTS `retail_greeting_terminals` (
    `id` VARCHAR(36) PRIMARY KEY,
    `branch_id` VARCHAR(36) NOT NULL,
    `terminal_code` VARCHAR(30) NOT NULL UNIQUE,
    `device_name` VARCHAR(100) NOT NULL,
    `ip_address` VARCHAR(45) NULL,
    `ho_fleet_group` VARCHAR(50) DEFAULT 'ALL_BRANCHES',
    `active_ho_campaign_id` VARCHAR(36) NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_term_branch` (`branch_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Real-Time Staff Floor Presence State (Cached in Redis/Footfall DB)
CREATE TABLE IF NOT EXISTS `retail_staff_floor_status` (
    `employee_id` VARCHAR(36) PRIMARY KEY,
    `branch_id` VARCHAR(36) NOT NULL,
    `current_status` ENUM('AVAILABLE', 'ENGAGED', 'ON_BREAK', 'LOGGED_OUT') DEFAULT 'LOGGED_OUT',
    `current_walkin_session_id` VARCHAR(36) NULL,
    `floor_zone` VARCHAR(50) NULL,
    `status_updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_floor_branch_status` (`branch_id`, `current_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Greeting Intake Log (Entrance interactions)
CREATE TABLE IF NOT EXISTS `retail_greeting_logs` (
    `id` VARCHAR(36) PRIMARY KEY,
    `branch_id` VARCHAR(36) NOT NULL,
    `terminal_id` VARCHAR(36) NOT NULL,
    `greeter_employee_id` VARCHAR(36) NOT NULL,
    `walkin_session_id` VARCHAR(36) NOT NULL UNIQUE,
    `customer_phone` VARCHAR(20) NULL,
    `customer_name` VARCHAR(100) NULL,
    `is_vip_customer` BOOLEAN DEFAULT FALSE,
    `primary_category_id` VARCHAR(36) NOT NULL,
    `requested_brand_id` VARCHAR(36) NULL,
    `assigned_employee_id` VARCHAR(36) NOT NULL,
    `routing_type` ENUM('DIRECT_PROMOTER', 'ROUND_ROBIN', 'CUSTOMER_REQUEST', 'QUEUE_TOKEN', 'HO_CAMPAIGN_PRIORITY') NOT NULL,
    `greeted_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `handoff_completed_at` TIMESTAMP NULL,
    INDEX `idx_greet_branch_date` (`branch_id`, `greeted_at`),
    INDEX `idx_greet_customer_phone` (`customer_phone`),
    FOREIGN KEY (`terminal_id`) REFERENCES `retail_greeting_terminals`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Queue Tokens for Peak Hours
CREATE TABLE IF NOT EXISTS `retail_queue_tokens` (
    `id` VARCHAR(36) PRIMARY KEY,
    `branch_id` VARCHAR(36) NOT NULL,
    `token_number` VARCHAR(20) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `customer_name` VARCHAR(100) NULL,
    `requested_brand_id` VARCHAR(36) NULL,
    `category_id` VARCHAR(36) NOT NULL,
    `status` ENUM('WAITING', 'CALLED', 'ENGAGED', 'CANCELLED', 'NO_SHOW') DEFAULT 'WAITING',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `called_at` TIMESTAMP NULL,
    `served_at` TIMESTAMP NULL,
    `assigned_employee_id` VARCHAR(36) NULL,
    INDEX `idx_token_status` (`branch_id`, `status`),
    INDEX `idx_token_phone` (`customer_phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Head Office Sales Greeting Campaigns & Presets
CREATE TABLE IF NOT EXISTS `retail_greeting_ho_campaigns` (
    `id` VARCHAR(36) PRIMARY KEY,
    `campaign_name` VARCHAR(150) NOT NULL,
    `welcome_headline` VARCHAR(255) NOT NULL,
    `intake_questions_json` JSON NULL,
    `target_brand_priority_id` VARCHAR(36) NULL,
    `target_branch_scope` ENUM('ALL_STORES', 'KARNATAKA_ONLY', 'TAMIL_NADU_ONLY', 'SPECIFIC_BRANCHES') NOT NULL DEFAULT 'ALL_STORES',
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_by_ho_user_id` VARCHAR(36) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_campaign_active` (`is_active`, `start_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
