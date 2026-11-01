-- ==============================================================================
-- IMAGO In-Store Sales Kiosk & 3D Interactive Comparison Schema
-- Migration: 005_sales_kiosk_3d_comparison_schema.sql
-- ==============================================================================

USE `imago_footfall_db`;

-- 1. Kiosk Hardware Registry (Fleet Managed by HO Sales)
CREATE TABLE IF NOT EXISTS `retail_kiosk_terminals` (
    `id` VARCHAR(36) PRIMARY KEY,
    `branch_id` VARCHAR(36) NOT NULL,
    `kiosk_code` VARCHAR(30) NOT NULL UNIQUE,       -- e.g. 'IND-KIOSK-01'
    `device_name` VARCHAR(100) NOT NULL,            -- 'Main Aisle 55-inch Touch Kiosk'
    `floor_zone` VARCHAR(50) NOT NULL,              -- 'Smartphones Zone A'
    `ip_address` VARCHAR(45) NULL,
    `screen_resolution` VARCHAR(20) DEFAULT '3840x2160',
    `ho_fleet_group` VARCHAR(50) DEFAULT 'ALL_STORES',
    `active_ho_campaign_id` VARCHAR(36) NULL,       -- Pushed promotional campaign
    `device_status` ENUM('ONLINE', 'OFFLINE', 'MAINTENANCE_LOCKED') DEFAULT 'ONLINE',
    `is_active` BOOLEAN DEFAULT TRUE,
    `last_heartbeat_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_kiosk_branch` (`branch_id`, `device_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Kiosk Interactive Touch Sessions
CREATE TABLE IF NOT EXISTS `retail_kiosk_sessions` (
    `id` VARCHAR(36) PRIMARY KEY,
    `kiosk_id` VARCHAR(36) NOT NULL,
    `branch_id` VARCHAR(36) NOT NULL,
    `session_started_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `session_ended_at` TIMESTAMP NULL,
    `dwell_duration_seconds` INT NULL,
    `customer_phone` VARCHAR(20) NULL,
    `walkin_session_id` VARCHAR(36) NULL,
    `primary_category_browsed` VARCHAR(50) NULL,
    `total_screen_touches` INT DEFAULT 0,
    INDEX `idx_kiosk_session_date` (`branch_id`, `session_started_at`),
    CONSTRAINT `fk_kiosk_session_terminal` FOREIGN KEY (`kiosk_id`) REFERENCES `retail_kiosk_terminals`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Side-by-Side Model Comparison Logs (Telemetry)
CREATE TABLE IF NOT EXISTS `retail_kiosk_comparisons` (
    `id` VARCHAR(36) PRIMARY KEY,
    `session_id` VARCHAR(36) NOT NULL,
    `model_a_sku` VARCHAR(100) NOT NULL,
    `model_b_sku` VARCHAR(100) NOT NULL,
    `model_c_sku` VARCHAR(100) NULL,
    `duration_seconds` INT NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_comp_models` (`model_a_sku`, `model_b_sku`),
    CONSTRAINT `fk_kiosk_comp_session` FOREIGN KEY (`session_id`) REFERENCES `retail_kiosk_sessions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. On-Demand Floor Paging Requests ("Request Live Demo")
CREATE TABLE IF NOT EXISTS `retail_kiosk_assistance_requests` (
    `id` VARCHAR(36) PRIMARY KEY,
    `session_id` VARCHAR(36) NOT NULL,
    `kiosk_id` VARCHAR(36) NOT NULL,
    `branch_id` VARCHAR(36) NOT NULL,
    `requested_sku` VARCHAR(100) NOT NULL,
    `brand_id` VARCHAR(36) NULL,
    `assigned_employee_id` VARCHAR(36) NULL,
    `requested_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `acknowledged_at` TIMESTAMP NULL,
    `arrived_at` TIMESTAMP NULL,
    `response_time_seconds` INT NULL,
    `status` ENUM('PENDING', 'ACKNOWLEDGED', 'FULFILLED', 'CANCELLED', 'TIMED_OUT') DEFAULT 'PENDING',
    INDEX `idx_assist_branch_status` (`branch_id`, `status`),
    CONSTRAINT `fk_assist_session` FOREIGN KEY (`session_id`) REFERENCES `retail_kiosk_sessions`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_assist_kiosk` FOREIGN KEY (`kiosk_id`) REFERENCES `retail_kiosk_terminals`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Digital Quotations Sent to WhatsApp / SMS
CREATE TABLE IF NOT EXISTS `retail_kiosk_quotations` (
    `id` VARCHAR(36) PRIMARY KEY,
    `session_id` VARCHAR(36) NOT NULL,
    `branch_id` VARCHAR(36) NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `quoted_skus` JSON NOT NULL,
    `down_payment_amount` DECIMAL(10, 2) NULL,
    `monthly_emi_amount` DECIMAL(10, 2) NULL,
    `finance_partner_name` VARCHAR(50) NULL,
    `sent_via` ENUM('WHATSAPP', 'SMS', 'EMAIL') DEFAULT 'WHATSAPP',
    `sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_quote_phone` (`customer_phone`),
    CONSTRAINT `fk_quote_session` FOREIGN KEY (`session_id`) REFERENCES `retail_kiosk_sessions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Head Office Sales Kiosk Promotional Campaigns
CREATE TABLE IF NOT EXISTS `retail_kiosk_ho_campaigns` (
    `id` VARCHAR(36) PRIMARY KEY,
    `campaign_title` VARCHAR(150) NOT NULL,
    `hero_banner_image_url` VARCHAR(255) NOT NULL,
    `video_attract_url` VARCHAR(255) NULL,
    `target_skus_json` JSON NULL,
    `target_branch_scope` ENUM('ALL_STORES', 'KARNATAKA_ONLY', 'TAMIL_NADU_ONLY', 'SPECIFIC_BRANCHES') NOT NULL DEFAULT 'ALL_STORES',
    `target_branch_ids_json` JSON NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_by_ho_user_id` VARCHAR(36) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Real-Time Remote Fleet Commands from Head Office
CREATE TABLE IF NOT EXISTS `retail_kiosk_remote_commands` (
    `id` VARCHAR(36) PRIMARY KEY,
    `kiosk_id` VARCHAR(36) NOT NULL,
    `command_type` ENUM('RELOAD_CONTENT_CACHE', 'RESTART_KIOSK_APP', 'LOCK_FOR_MAINTENANCE', 'UNLOCK_DEVICE', 'PLAY_HERO_TAKEOVER') NOT NULL,
    `payload_json` JSON NULL,
    `status` ENUM('PENDING', 'DISPATCHED', 'ACKNOWLEDGED_SUCCESS', 'FAILED') DEFAULT 'PENDING',
    `dispatched_by_ho_user_id` VARCHAR(36) NOT NULL,
    `dispatched_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `acknowledged_at` TIMESTAMP NULL,
    INDEX `idx_cmd_kiosk` (`kiosk_id`, `status`),
    CONSTRAINT `fk_cmd_kiosk` FOREIGN KEY (`kiosk_id`) REFERENCES `retail_kiosk_terminals`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. 3D Model Assets, Material PBR Shaders & AR QuickLook Registry
CREATE TABLE IF NOT EXISTS `retail_kiosk_3d_assets` (
    `id` VARCHAR(36) PRIMARY KEY,
    `sku` VARCHAR(100) NOT NULL UNIQUE,
    `model_name` VARCHAR(150) NOT NULL,
    `brand` VARCHAR(50) NOT NULL,
    `category` VARCHAR(50) NOT NULL DEFAULT 'Smartphones',
    `gltf_glb_url` VARCHAR(255) NOT NULL,
    `usdz_ar_url` VARCHAR(255) NOT NULL,
    `file_size_bytes` BIGINT NOT NULL,
    `polygon_count` INT DEFAULT 45000,
    `materials_pbr_config` JSON NOT NULL,
    `color_swatches_json` JSON NOT NULL,
    `default_camera_angle` JSON NULL,
    `is_active` BOOLEAN DEFAULT TRUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_3d_brand_cat` (`brand`, `category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Granular Product Technical Specifications & Benchmark Matrix
CREATE TABLE IF NOT EXISTS `retail_kiosk_product_specs` (
    `id` VARCHAR(36) PRIMARY KEY,
    `sku` VARCHAR(100) NOT NULL UNIQUE,
    `category` VARCHAR(50) NOT NULL DEFAULT 'Smartphones',
    `display_type` VARCHAR(100) NOT NULL,
    `display_size_inches` DECIMAL(4, 2) NOT NULL,
    `resolution` VARCHAR(50) NOT NULL,
    `ppi` INT NOT NULL,
    `peak_brightness_nits` INT NOT NULL,
    `refresh_rate_hz` VARCHAR(30) DEFAULT '1-120Hz LTPO',
    `glass_durability` VARCHAR(100) NOT NULL,
    `camera_main` VARCHAR(100) NOT NULL,
    `camera_telephoto` VARCHAR(100) NOT NULL,
    `camera_ultrawide` VARCHAR(100) NOT NULL,
    `video_recording_max` VARCHAR(100) NOT NULL,
    `camera_features` JSON NULL,
    `processor_soc` VARCHAR(100) NOT NULL,
    `geekbench_single_score` INT NOT NULL,
    `geekbench_multi_score` INT NOT NULL,
    `gpu_3dmark_extreme_score` INT NOT NULL,
    `ai_npu_tops` INT NOT NULL,
    `battery_capacity_mah` INT NOT NULL,
    `wired_charging_watts` INT NOT NULL,
    `wireless_charging_watts` INT NOT NULL,
    `reverse_wireless_supported` BOOLEAN DEFAULT TRUE,
    `rated_video_playback_hours` INT NOT NULL,
    `weight_grams` INT NOT NULL,
    `thickness_mm` DECIMAL(4, 2) NOT NULL,
    `chassis_material` VARCHAR(100) NOT NULL,
    `ip_rating` VARCHAR(100) DEFAULT 'IP68',
    `stylus_supported` BOOLEAN DEFAULT FALSE,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_spec_cat` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Showroom Salesperson Co-Pilot Assisted Selling Sessions
CREATE TABLE IF NOT EXISTS `retail_kiosk_copilot_sessions` (
    `id` VARCHAR(36) PRIMARY KEY,
    `kiosk_id` VARCHAR(36) NOT NULL,
    `branch_id` VARCHAR(36) NOT NULL,
    `employee_id` VARCHAR(36) NOT NULL,
    `customer_archetype` ENUM('CREATOR_VLOGGER', 'POWER_GAMER', 'EXECUTIVE_PRODUCTIVITY', 'VALUE_LONGEVITY') NOT NULL,
    `compared_skus` JSON NOT NULL,
    `pinned_points` JSON NULL,
    `objections_consulted` JSON NULL,
    `outcome` ENUM('CART_TRANSFERRED', 'QUOTE_SENT_WHATSAPP', 'CUSTOMER_BROWSING', 'WALKOUT') DEFAULT 'CUSTOMER_BROWSING',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_copilot_emp` (`employee_id`, `created_at`),
    CONSTRAINT `fk_copilot_kiosk` FOREIGN KEY (`kiosk_id`) REFERENCES `retail_kiosk_terminals`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Kiosk to POS Billing Direct Cart Transfers
CREATE TABLE IF NOT EXISTS `retail_kiosk_cart_transfers` (
    `id` VARCHAR(36) PRIMARY KEY,
    `transfer_token` VARCHAR(20) NOT NULL UNIQUE,   -- 'CART-8942'
    `kiosk_id` VARCHAR(36) NOT NULL,
    `branch_id` VARCHAR(36) NOT NULL,
    `employee_id` VARCHAR(36) NULL,
    `customer_phone` VARCHAR(20) NULL,
    `selected_sku` VARCHAR(100) NOT NULL,
    `selected_color` VARCHAR(50) NOT NULL,
    `selected_storage` VARCHAR(20) NOT NULL,
    `mrp_price` DECIMAL(10, 2) NOT NULL,
    `discount_amount` DECIMAL(10, 2) DEFAULT 0.00,
    `bank_cashback_amount` DECIMAL(10, 2) DEFAULT 0.00,
    `tradein_bonus_amount` DECIMAL(10, 2) DEFAULT 0.00,
    `effective_price` DECIMAL(10, 2) NOT NULL,
    `reserved_imei` VARCHAR(30) NULL,
    `status` ENUM('PENDING_AT_BILLING', 'BILLED_PAID', 'EXPIRED', 'CANCELLED') DEFAULT 'PENDING_AT_BILLING',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `expires_at` TIMESTAMP NULL,
    INDEX `idx_transfer_branch_status` (`branch_id`, `status`),
    CONSTRAINT `fk_cart_kiosk` FOREIGN KEY (`kiosk_id`) REFERENCES `retail_kiosk_terminals`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
