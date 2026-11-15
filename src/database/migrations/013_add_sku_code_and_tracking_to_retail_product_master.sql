-- ==============================================================================
-- Migration: 013_add_sku_code_and_tracking_to_retail_product_master.sql
-- Purpose: Add SKU Code, Tracking Type, HSN Code, GST Rate, and Target Cost Price
--          to retail_product_master to unify Catalog Governance with Inventory,
--          Central WMS, and POS.
-- ==============================================================================

USE imago_footfall_db;

-- Safe procedure to add columns if missing
DROP PROCEDURE IF EXISTS upgrade_retail_product_master_schema;
DELIMITER $$
CREATE PROCEDURE upgrade_retail_product_master_schema()
BEGIN
  IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='imago_footfall_db' AND TABLE_NAME='retail_product_master' AND COLUMN_NAME='sku_code') THEN
    ALTER TABLE retail_product_master ADD COLUMN sku_code VARCHAR(100) NULL AFTER model_name;
  END IF;

  IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='imago_footfall_db' AND TABLE_NAME='retail_product_master' AND COLUMN_NAME='tracking_type') THEN
    ALTER TABLE retail_product_master ADD COLUMN tracking_type ENUM('SERIALIZED_IMEI', 'SERIALIZED_SN', 'BATCH_QUANTITY') NOT NULL DEFAULT 'SERIALIZED_IMEI' AFTER default_variant;
  END IF;

  IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='imago_footfall_db' AND TABLE_NAME='retail_product_master' AND COLUMN_NAME='hsn_code') THEN
    ALTER TABLE retail_product_master ADD COLUMN hsn_code VARCHAR(20) NOT NULL DEFAULT '85171300' AFTER tracking_type;
  END IF;

  IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='imago_footfall_db' AND TABLE_NAME='retail_product_master' AND COLUMN_NAME='gst_rate_pct') THEN
    ALTER TABLE retail_product_master ADD COLUMN gst_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 18.00 AFTER hsn_code;
  END IF;

  IF NOT EXISTS (SELECT * FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='imago_footfall_db' AND TABLE_NAME='retail_product_master' AND COLUMN_NAME='cost_price') THEN
    ALTER TABLE retail_product_master ADD COLUMN cost_price DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER msrp;
  END IF;

  IF NOT EXISTS (SELECT * FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='imago_footfall_db' AND TABLE_NAME='retail_product_master' AND INDEX_NAME='uq_retail_product_sku') THEN
    CREATE UNIQUE INDEX uq_retail_product_sku ON retail_product_master (sku_code);
  END IF;
END$$
DELIMITER ;

CALL upgrade_retail_product_master_schema();
DROP PROCEDURE IF EXISTS upgrade_retail_product_master_schema;
