-- ==============================================================================
-- IMAGO Master Categories Flags & Authentic Showroom 3D/Visual Assets Linkage
-- Migration: 008_category_master_kiosk_and_catalog_flags.sql
-- ==============================================================================

USE `imago_footfall_db`;

-- 1. Add Kiosk and Catalog Permission Flags to retail_category_master
ALTER TABLE `retail_category_master`
  ADD COLUMN `is_allowed_in_kiosk` BOOLEAN NOT NULL DEFAULT FALSE AFTER `is_active`,
  ADD COLUMN `is_allowed_in_catalog` BOOLEAN NOT NULL DEFAULT TRUE AFTER `is_allowed_in_kiosk`,
  ADD INDEX `idx_cat_kiosk_allowed` (`is_allowed_in_kiosk`, `is_active`);

-- 2. Authorize Initial Categories
UPDATE `retail_category_master`
SET `is_allowed_in_kiosk` = TRUE, `is_allowed_in_catalog` = TRUE
WHERE `code` IN ('SMARTPHONES', 'LAPTOPS', 'TABLETS');

UPDATE `retail_category_master`
SET `is_allowed_in_kiosk` = FALSE, `is_allowed_in_catalog` = TRUE
WHERE `code` IN ('WEARABLES', 'AUDIO_ACC', 'SERVICE_REPAIR');

-- 3. Harmonize retail_kiosk_3d_assets Category Names with Category Master
UPDATE `retail_kiosk_3d_assets`
SET `category` = 'Laptops & Computing'
WHERE `category` = 'Laptops';

-- 4. Link Authentic 3D Models & Single-Device Transparent Visuals in retail_kiosk_3d_assets

-- 4.1 Apple iPhone 16 Pro Max
UPDATE `retail_kiosk_3d_assets`
SET 
  `gltf_glb_url` = '/models/glb/iphone_16_pro_max.glb',
  `usdz_ar_url` = '/models/usdz/iPhone_16_Pro_Max.usdz',
  `color_swatches_json` = JSON_ARRAY(
    JSON_OBJECT(
      'color_id', 'desert_titanium',
      'name', 'Desert Titanium',
      'hex', '#C5B49D',
      'badge', 'Most Popular',
      'in_stock', TRUE,
      'stock_count', 8,
      'hero_image_url', '/assets/devices/iphone-16-pro-max-desert.png',
      'frame_urls', JSON_ARRAY('/assets/devices/iphone-16-pro-max-desert.png')
    ),
    JSON_OBJECT(
      'color_id', 'natural_titanium',
      'name', 'Natural Titanium',
      'hex', '#8C8680',
      'badge', 'Limited Stock',
      'in_stock', TRUE,
      'stock_count', 5,
      'hero_image_url', '/assets/devices/iphone-16-pro-max-natural.png',
      'frame_urls', JSON_ARRAY('/assets/devices/iphone-16-pro-max-natural.png')
    ),
    JSON_OBJECT(
      'color_id', 'white_titanium',
      'name', 'White Titanium',
      'hex', '#E3E4E5',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 12,
      'hero_image_url', '/assets/devices/iphone-16-pro-max-white.png',
      'frame_urls', JSON_ARRAY('/assets/devices/iphone-16-pro-max-white.png')
    ),
    JSON_OBJECT(
      'color_id', 'black_titanium',
      'name', 'Black Titanium',
      'hex', '#3B3B3D',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 9,
      'hero_image_url', '/assets/devices/iphone-16-pro-max-black.png',
      'frame_urls', JSON_ARRAY('/assets/devices/iphone-16-pro-max-black.png')
    )
  )
WHERE `sku` = 'APPLE-IP16PM-256';

-- 4.2 Samsung Galaxy S26 Ultra
UPDATE `retail_kiosk_3d_assets`
SET 
  `gltf_glb_url` = '/models/glb/samsung_galaxy_s22_ultra.glb',
  `usdz_ar_url` = '/models/usdz/Samsung_Galaxy_S22_Ultra.usdz',
  `color_swatches_json` = JSON_ARRAY(
    JSON_OBJECT(
      'color_id', 'silver_shadow',
      'name', 'Titanium Silver Shadow',
      'hex', '#9AA0A6',
      'badge', 'Flagship Finish',
      'in_stock', TRUE,
      'stock_count', 6,
      'hero_image_url', '/assets/devices/samsung-s26-ultra-silver.png',
      'frame_urls', JSON_ARRAY('/assets/devices/samsung-s26-ultra-silver.png')
    ),
    JSON_OBJECT(
      'color_id', 'titanium_gray',
      'name', 'Titanium Gray',
      'hex', '#6B6B6D',
      'badge', 'Only 4 Left',
      'in_stock', TRUE,
      'stock_count', 4,
      'hero_image_url', '/assets/devices/samsung-s26-ultra-gray.png',
      'frame_urls', JSON_ARRAY('/assets/devices/samsung-s26-ultra-gray.png')
    ),
    JSON_OBJECT(
      'color_id', 'titanium_black',
      'name', 'Titanium Black',
      'hex', '#2E2E30',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 11,
      'hero_image_url', '/assets/devices/samsung-s26-ultra-black.png',
      'frame_urls', JSON_ARRAY('/assets/devices/samsung-s26-ultra-black.png')
    ),
    JSON_OBJECT(
      'color_id', 'titanium_yellow',
      'name', 'Titanium Yellow',
      'hex', '#E5DFD3',
      'badge', 'Exclusive',
      'in_stock', TRUE,
      'stock_count', 3,
      'hero_image_url', '/assets/devices/samsung-s26-ultra-yellow.png',
      'frame_urls', JSON_ARRAY('/assets/devices/samsung-s26-ultra-yellow.png')
    )
  )
WHERE `sku` = 'SAMSUNG-S26U-256';

-- 4.3 Apple MacBook Pro 16" (M4 Pro)
UPDATE `retail_kiosk_3d_assets`
SET 
  `category` = 'Laptops & Computing',
  `gltf_glb_url` = '/models/glb/apple_macbook_pro_16_inch_2021.glb',
  `usdz_ar_url` = '/models/usdz/Apple_MacBook_Pro_16_inch_2021.usdz',
  `color_swatches_json` = JSON_ARRAY(
    JSON_OBJECT(
      'color_id', 'space_black',
      'name', 'Space Black',
      'hex', '#2E2E30',
      'badge', 'Signature Pro',
      'in_stock', TRUE,
      'stock_count', 4,
      'hero_image_url', '/assets/devices/mbp-16-spaceblack.png',
      'frame_urls', JSON_ARRAY('/assets/devices/mbp-16-spaceblack.png')
    ),
    JSON_OBJECT(
      'color_id', 'silver',
      'name', 'Silver',
      'hex', '#E3E4E5',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 6,
      'hero_image_url', '/assets/devices/mbp-16-silver.png',
      'frame_urls', JSON_ARRAY('/assets/devices/mbp-16-silver.png')
    )
  )
WHERE `sku` = 'APPLE-MBP16-M4-512';

-- 4.4 Dell XPS 16 (Core Ultra 9)
UPDATE `retail_kiosk_3d_assets`
SET 
  `category` = 'Laptops & Computing',
  `gltf_glb_url` = '/models/glb/laptop_dell_xps.glb',
  `usdz_ar_url` = '/models/usdz/Laptop_Dell_XPS.usdz',
  `color_swatches_json` = JSON_ARRAY(
    JSON_OBJECT(
      'color_id', 'platinum_silver',
      'name', 'Platinum Silver',
      'hex', '#D1D5DB',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'hero_image_url', '/assets/devices/dell-xps-16-silver.png',
      'stock_count', 3,
      'frame_urls', JSON_ARRAY('/assets/devices/dell-xps-16-silver.png')
    ),
    JSON_OBJECT(
      'color_id', 'graphite',
      'name', 'Graphite',
      'hex', '#374151',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 5,
      'hero_image_url', '/assets/devices/dell-xps-16-graphite.png',
      'frame_urls', JSON_ARRAY('/assets/devices/dell-xps-16-graphite.png')
    )
  )
WHERE `sku` = 'DELL-XPS16-9640';
