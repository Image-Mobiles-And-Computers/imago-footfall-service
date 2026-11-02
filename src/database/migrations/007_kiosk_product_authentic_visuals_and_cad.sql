-- ==============================================================================
-- IMAGO In-Store Sales Kiosk: Authentic High-Res Visuals & Tailored CAD Geometry
-- Migration: 007_kiosk_product_authentic_visuals_and_cad.sql
-- ==============================================================================

USE `imago_footfall_db`;

-- 1. Apple iPhone 16 Pro Max
UPDATE `retail_kiosk_3d_assets`
SET 
  `materials_pbr_config` = JSON_OBJECT(
    'cad_geometry_type', 'APPLE_IPHONE_16_PRO_MAX',
    'chassis_silhouette', 'CONTOURED_CURVED_TITANIUM',
    'corner_radius', 0.22,
    'camera_module_architecture', 'RAISED_TRIANGULAR_PLATEAU',
    'screen_notch_type', 'DYNAMIC_ISLAND_PILL',
    'special_controls', JSON_ARRAY('CAMERA_CONTROL_BUTTON', 'ACTION_BUTTON'),
    'chassis_material', 'Grade 5 Titanium Brushed',
    'ior', 1.54,
    'clearcoat', 0.9,
    'metalness', 0.85,
    'roughness', 0.28,
    'transmission', 0.05,
    'envMapIntensity', 1.5
  ),
  `color_swatches_json` = JSON_ARRAY(
    JSON_OBJECT(
      'color_id', 'desert_titanium',
      'name', 'Desert Titanium',
      'hex', '#C5B49D',
      'badge', 'Most Popular',
      'in_stock', TRUE,
      'stock_count', 8,
      'hero_image_url', 'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121032-iphone-16-pro-max.png',
      'frame_urls', JSON_ARRAY(
        'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121032-iphone-16-pro-max.png',
        'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121032-iphone-16-pro-max.png'
      )
    ),
    JSON_OBJECT(
      'color_id', 'natural_titanium',
      'name', 'Natural Titanium',
      'hex', '#8C8680',
      'badge', 'Limited Stock',
      'in_stock', TRUE,
      'stock_count', 5,
      'hero_image_url', 'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121032-iphone-16-pro-max.png',
      'frame_urls', JSON_ARRAY(
        'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121032-iphone-16-pro-max.png'
      )
    ),
    JSON_OBJECT(
      'color_id', 'white_titanium',
      'name', 'White Titanium',
      'hex', '#E3E4E5',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 12,
      'hero_image_url', 'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121032-iphone-16-pro-max.png',
      'frame_urls', JSON_ARRAY(
        'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121032-iphone-16-pro-max.png'
      )
    ),
    JSON_OBJECT(
      'color_id', 'black_titanium',
      'name', 'Black Titanium',
      'hex', '#3B3B3D',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 9,
      'hero_image_url', 'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121032-iphone-16-pro-max.png',
      'frame_urls', JSON_ARRAY(
        'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/121032-iphone-16-pro-max.png'
      )
    )
  ),
  `default_camera_angle` = JSON_OBJECT('x', 0, 'y', 0.45, 'z', 2.3, 'fov', 35)
WHERE `sku` = 'APPLE-IP16PM-256';

-- 2. Samsung Galaxy S26 Ultra
UPDATE `retail_kiosk_3d_assets`
SET 
  `materials_pbr_config` = JSON_OBJECT(
    'cad_geometry_type', 'SAMSUNG_ULTRA_S26',
    'chassis_silhouette', 'BOX_SHARP_CORNERS',
    'corner_radius', 0.02,
    'camera_module_architecture', 'QUAD_FLOATING_METALLIC_RINGS',
    'screen_notch_type', 'MINIMAL_PUNCH_HOLE',
    'chassis_material', 'Grade 5 Titanium Armor',
    'has_s_pen', TRUE,
    'ior', 1.6,
    'clearcoat', 0.95,
    'metalness', 0.92,
    'roughness', 0.22,
    'transmission', 0.02,
    'envMapIntensity', 1.7
  ),
  `color_swatches_json` = JSON_ARRAY(
    JSON_OBJECT(
      'color_id', 'silver_shadow',
      'name', 'Titanium Silver Shadow',
      'hex', '#9AA0A6',
      'badge', 'Flagship Finish',
      'in_stock', TRUE,
      'stock_count', 6,
      'hero_image_url', 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png',
      'frame_urls', JSON_ARRAY(
        'https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png',
        'https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png'
      )
    ),
    JSON_OBJECT(
      'color_id', 'titanium_gray',
      'name', 'Titanium Gray',
      'hex', '#6B6B6D',
      'badge', 'Only 4 Left',
      'in_stock', TRUE,
      'stock_count', 4,
      'hero_image_url', 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png',
      'frame_urls', JSON_ARRAY(
        'https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png'
      )
    ),
    JSON_OBJECT(
      'color_id', 'titanium_black',
      'name', 'Titanium Black',
      'hex', '#2E2E30',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 11,
      'hero_image_url', 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png',
      'frame_urls', JSON_ARRAY(
        'https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png'
      )
    ),
    JSON_OBJECT(
      'color_id', 'titanium_yellow',
      'name', 'Titanium Yellow',
      'hex', '#E5DFD3',
      'badge', 'Exclusive',
      'in_stock', TRUE,
      'stock_count', 3,
      'hero_image_url', 'https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png',
      'frame_urls', JSON_ARRAY(
        'https://upload.wikimedia.org/wikipedia/commons/e/ed/Samsung_S24_Ultra_Phone.png'
      )
    )
  ),
  `default_camera_angle` = JSON_OBJECT('x', 0, 'y', 0.45, 'z', 2.3, 'fov', 35)
WHERE `sku` = 'SAMSUNG-S26U-256';

-- 3. Apple MacBook Pro 16" (M4 Pro)
UPDATE `retail_kiosk_3d_assets`
SET 
  `materials_pbr_config` = JSON_OBJECT(
    'cad_geometry_type', 'APPLE_MACBOOK_PRO_16',
    'chassis_silhouette', 'UNIBODY_ALUMINUM_CLAMSHELL',
    'hinge_angle_deg', 115,
    'keyboard_deck_type', 'RECESSED_BLACK_MAGIC_KEYBOARD',
    'screen_notch_type', 'LIQUID_RETINA_XDR_NOTCH',
    'trackpad_type', 'FORCE_TOUCH_HAPTIC',
    'chassis_material', 'Anodized Space Black Aluminum',
    'clearcoat', 0.5,
    'metalness', 0.88,
    'roughness', 0.35,
    'envMapIntensity', 1.4
  ),
  `color_swatches_json` = JSON_ARRAY(
    JSON_OBJECT(
      'color_id', 'space_black',
      'name', 'Space Black',
      'hex', '#2E2E30',
      'badge', 'Signature Pro',
      'in_stock', TRUE,
      'stock_count', 4,
      'hero_image_url', 'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/mbp16-2024.png',
      'frame_urls', JSON_ARRAY(
        'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/mbp16-2024.png',
        'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/mbp16-2024.png'
      )
    ),
    JSON_OBJECT(
      'color_id', 'silver',
      'name', 'Silver',
      'hex', '#E3E4E5',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 6,
      'hero_image_url', 'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/mbp16-2024.png',
      'frame_urls', JSON_ARRAY(
        'https://cdsassets.apple.com/live/7WUAS350/images/tech-specs/mbp16-2024.png'
      )
    )
  ),
  `default_camera_angle` = JSON_OBJECT('x', 0, 'y', 0.6, 'z', 2.8, 'fov', 40)
WHERE `sku` = 'APPLE-MBP16-M4-512';

-- 4. Dell XPS 16 (Core Ultra 9)
UPDATE `retail_kiosk_3d_assets`
SET 
  `materials_pbr_config` = JSON_OBJECT(
    'cad_geometry_type', 'DELL_XPS_16',
    'chassis_silhouette', 'WEDGE_CNC_ALUMINUM',
    'hinge_angle_deg', 110,
    'keyboard_deck_type', 'ZERO_LATTICE_CAPACITIVE_ROW',
    'screen_notch_type', 'INFINITY_EDGE_4_SIDED',
    'trackpad_type', 'SEAMLESS_GLASS_HAPTIC',
    'chassis_material', 'CNC Machined Platinum Aluminum',
    'clearcoat', 0.6,
    'metalness', 0.9,
    'roughness', 0.3,
    'envMapIntensity', 1.5
  ),
  `color_swatches_json` = JSON_ARRAY(
    JSON_OBJECT(
      'color_id', 'platinum_silver',
      'name', 'Platinum Silver',
      'hex', '#D1D5DB',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 3,
      'hero_image_url', 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/xps-notebooks/16-9640/media-gallery/silver/touch/notebook-laptop-xps-16-9640-t-silver-gallery-2.psd?fmt=png-alpha&pscan=auto&scl=1&hei=800&wid=1200&qlt=100,1&resMode=sharp2&chrss=full',
      'frame_urls', JSON_ARRAY(
        'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/xps-notebooks/16-9640/media-gallery/silver/touch/notebook-laptop-xps-16-9640-t-silver-gallery-2.psd?fmt=png-alpha&pscan=auto&scl=1&hei=800&wid=1200&qlt=100,1&resMode=sharp2&chrss=full',
        'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/xps-notebooks/16-9640/media-gallery/silver/touch/notebook-laptop-xps-16-9640-t-silver-gallery-2.psd?fmt=png-alpha&pscan=auto&scl=1&hei=800&wid=1200&qlt=100,1&resMode=sharp2&chrss=full'
      )
    ),
    JSON_OBJECT(
      'color_id', 'graphite',
      'name', 'Graphite',
      'hex', '#374151',
      'badge', 'In Stock',
      'in_stock', TRUE,
      'stock_count', 5,
      'hero_image_url', 'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/xps-notebooks/16-9640/media-gallery/silver/touch/notebook-laptop-xps-16-9640-t-silver-gallery-2.psd?fmt=png-alpha&pscan=auto&scl=1&hei=800&wid=1200&qlt=100,1&resMode=sharp2&chrss=full',
      'frame_urls', JSON_ARRAY(
        'https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-client-products/notebooks/xps-notebooks/16-9640/media-gallery/silver/touch/notebook-laptop-xps-16-9640-t-silver-gallery-2.psd?fmt=png-alpha&pscan=auto&scl=1&hei=800&wid=1200&qlt=100,1&resMode=sharp2&chrss=full'
      )
    )
  ),
  `default_camera_angle` = JSON_OBJECT('x', 0, 'y', 0.6, 'z', 2.8, 'fov', 40)
WHERE `sku` = 'DELL-XPS16-9640';
