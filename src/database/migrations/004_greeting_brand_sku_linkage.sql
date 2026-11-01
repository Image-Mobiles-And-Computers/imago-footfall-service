-- ==============================================================================
-- IMAGO Footfall & Retail Conversion Domain Schema
-- Migration: 004_greeting_brand_sku_linkage.sql
-- Direct Linkage of Walk-In Sessions, Greeting Logs & Queue Tokens to 
-- Master Brand (`retail_brand_master`) and SKU/Product (`retail_product_master`)
-- ==============================================================================

USE `imago_footfall_db`;

-- 1. Link retail_walkin_sessions to retail_brand_master and retail_product_master
ALTER TABLE `retail_walkin_sessions`
  ADD COLUMN `requested_brand_id` VARCHAR(36) NULL AFTER `primary_category_name`,
  ADD COLUMN `requested_brand_name` VARCHAR(100) NULL AFTER `requested_brand_id`,
  ADD COLUMN `requested_product_id` VARCHAR(36) NULL AFTER `requested_brand_name`,
  ADD COLUMN `requested_product_name` VARCHAR(150) NULL AFTER `requested_product_id`,
  ADD CONSTRAINT `fk_walkin_brand_master` FOREIGN KEY (`requested_brand_id`) REFERENCES `retail_brand_master`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_walkin_product_master` FOREIGN KEY (`requested_product_id`) REFERENCES `retail_product_master`(`id`) ON DELETE SET NULL;

-- 2. Link retail_greeting_logs to retail_product_master and retail_brand_master
ALTER TABLE `retail_greeting_logs`
  ADD COLUMN `requested_brand_name` VARCHAR(100) NULL AFTER `requested_brand_id`,
  ADD COLUMN `requested_product_id` VARCHAR(36) NULL AFTER `requested_brand_name`,
  ADD COLUMN `requested_product_name` VARCHAR(150) NULL AFTER `requested_product_id`,
  ADD CONSTRAINT `fk_greet_brand_master` FOREIGN KEY (`requested_brand_id`) REFERENCES `retail_brand_master`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_greet_product_master` FOREIGN KEY (`requested_product_id`) REFERENCES `retail_product_master`(`id`) ON DELETE SET NULL;

-- 3. Link retail_queue_tokens to retail_product_master and retail_brand_master
ALTER TABLE `retail_queue_tokens`
  ADD COLUMN `requested_brand_name` VARCHAR(100) NULL AFTER `requested_brand_id`,
  ADD COLUMN `requested_product_id` VARCHAR(36) NULL AFTER `requested_brand_name`,
  ADD COLUMN `requested_product_name` VARCHAR(150) NULL AFTER `requested_product_id`,
  ADD CONSTRAINT `fk_queue_brand_master` FOREIGN KEY (`requested_brand_id`) REFERENCES `retail_brand_master`(`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_queue_product_master` FOREIGN KEY (`requested_product_id`) REFERENCES `retail_product_master`(`id`) ON DELETE SET NULL;
