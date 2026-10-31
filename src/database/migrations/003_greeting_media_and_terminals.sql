-- ==============================================================================
-- IMAGO Footfall & Retail Conversion Domain Schema
-- Migration: 003_greeting_media_and_terminals.sql
-- Rich Media Campaigns, Terminal Fleet Heartbeats & Dynamic Branch Master Scoping
-- ==============================================================================

USE `imago_footfall_db`;

-- 1. Enhance retail_greeting_ho_campaigns with rich media and granular branch targeting
ALTER TABLE `retail_greeting_ho_campaigns`
  ADD COLUMN `media_type` ENUM('IMAGE', 'VIDEO', 'CAROUSEL') NOT NULL DEFAULT 'IMAGE' AFTER `welcome_headline`,
  ADD COLUMN `media_url` VARCHAR(500) NULL AFTER `media_type`,
  ADD COLUMN `banner_image_url` VARCHAR(500) NULL AFTER `media_url`,
  ADD COLUMN `thumbnail_url` VARCHAR(500) NULL AFTER `banner_image_url`,
  ADD COLUMN `target_branch_ids_json` JSON NULL AFTER `target_branch_scope`,
  MODIFY COLUMN `target_branch_scope` VARCHAR(100) NOT NULL DEFAULT 'ALL_STORES';

-- 2. Enhance retail_greeting_terminals with zone, device model, and real-time heartbeat telemetry
ALTER TABLE `retail_greeting_terminals`
  ADD COLUMN `floor_zone` VARCHAR(100) NOT NULL DEFAULT 'Main Showroom Entrance' AFTER `device_name`,
  ADD COLUMN `device_model` VARCHAR(100) DEFAULT 'Apple iPad 10.9-inch' AFTER `floor_zone`,
  ADD COLUMN `paired_setup_pin` VARCHAR(10) DEFAULT '4006' AFTER `ho_fleet_group`,
  ADD COLUMN `active_greeter_id` VARCHAR(36) NULL AFTER `active_ho_campaign_id`,
  ADD COLUMN `last_heartbeat_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `is_active`;

-- 3. Update existing seed terminals with floor zones and models
UPDATE `retail_greeting_terminals` 
SET `floor_zone` = 'Main Showroom Entrance', `device_model` = 'Apple iPad 10.9-inch'
WHERE `terminal_code` = 'IND-GREET-01';

UPDATE `retail_greeting_terminals` 
SET `floor_zone` = '1st Floor Computing & Laptops Arena', `device_model` = 'Apple iPad Air 11-inch'
WHERE `terminal_code` = 'IND-GREET-02';

UPDATE `retail_greeting_terminals` 
SET `floor_zone` = 'Service & Trade-In Reception Desk', `device_model` = 'Samsung Galaxy Tab S9'
WHERE `terminal_code` = 'IND-GREET-03';
