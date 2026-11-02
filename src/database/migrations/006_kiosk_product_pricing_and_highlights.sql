-- ==============================================================================
-- IMAGO In-Store Sales Kiosk: Product Pricing & Highlights Schema Extension
-- Migration: 006_kiosk_product_pricing_and_highlights.sql
-- ==============================================================================

USE `imago_footfall_db`;

-- Add commercial pricing, highlights and storage variant fields to retail_kiosk_3d_assets
ALTER TABLE `retail_kiosk_3d_assets`
  ADD COLUMN IF NOT EXISTS `mrp_price` DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `discount_amount` DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `bank_cashback_amount` DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `tradein_bonus_amount` DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `tagline` VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `storage_variants_json` JSON NULL,
  ADD COLUMN IF NOT EXISTS `highlights_json` JSON NULL;
