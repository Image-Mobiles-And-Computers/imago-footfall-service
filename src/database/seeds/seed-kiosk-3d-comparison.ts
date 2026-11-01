import { pool } from '../../config/db';

export async function seedKiosk3DComparison(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    console.log('[Kiosk Seed] Seeding In-Store 3D Sales Kiosk master data...');
    await connection.beginTransaction();

    const indiranagarId = 'c9832255-2791-401d-88b5-a3d2c870c533';
    const koramangalaId = '830f08dd-12d9-49da-86e8-b52a55d2eda5';
    const jayanagarId   = 'b9b0ae39-54d9-4322-9448-0c917d79de93';

    // 1. Seed Kiosk Hardware Terminals
    const terminals = [
      {
        id: 'kiosk-ind-01',
        branch_id: indiranagarId,
        kiosk_code: 'IND-KIOSK-01',
        device_name: 'Main Entrance Flagship 55-inch 4K Touch Kiosk',
        floor_zone: 'Smartphones Arena A',
        ip_address: '192.168.10.41',
        screen_resolution: '3840x2160',
        ho_fleet_group: 'FLAGSHIP_STORES',
        active_ho_campaign_id: 'ho-kiosk-camp-clash',
        device_status: 'ONLINE',
        is_active: 1
      },
      {
        id: 'kiosk-ind-02',
        branch_id: indiranagarId,
        kiosk_code: 'IND-KIOSK-02',
        device_name: '1st Floor Computing 55-inch Touch Kiosk',
        floor_zone: 'Laptops & Creator Hub B',
        ip_address: '192.168.10.42',
        screen_resolution: '3840x2160',
        ho_fleet_group: 'FLAGSHIP_STORES',
        active_ho_campaign_id: 'ho-kiosk-camp-m4',
        device_status: 'ONLINE',
        is_active: 1
      },
      {
        id: 'kiosk-kor-01',
        branch_id: koramangalaId,
        kiosk_code: 'KOR-KIOSK-01',
        device_name: 'Koramangala Aisle 43-inch Touch Kiosk',
        floor_zone: 'Smartphones Zone A',
        ip_address: '192.168.12.35',
        screen_resolution: '3840x2160',
        ho_fleet_group: 'TIER1_METRO',
        active_ho_campaign_id: 'ho-kiosk-camp-clash',
        device_status: 'ONLINE',
        is_active: 1
      }
    ];

    for (const t of terminals) {
      await connection.query(`
        INSERT INTO retail_kiosk_terminals (
          id, branch_id, kiosk_code, device_name, floor_zone, ip_address,
          screen_resolution, ho_fleet_group, active_ho_campaign_id, device_status, is_active, last_heartbeat_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          device_name = VALUES(device_name),
          floor_zone = VALUES(floor_zone),
          active_ho_campaign_id = VALUES(active_ho_campaign_id),
          device_status = VALUES(device_status),
          last_heartbeat_at = NOW()
      `, [
        t.id, t.branch_id, t.kiosk_code, t.device_name, t.floor_zone, t.ip_address,
        t.screen_resolution, t.ho_fleet_group, t.active_ho_campaign_id, t.device_status, t.is_active
      ]);
    }

    // 2. Seed HO Campaigns for Kiosks
    const campaigns = [
      {
        id: 'ho-kiosk-camp-clash',
        campaign_title: 'Titanium Titans: Apple iPhone 16 Pro Max vs Samsung Galaxy S26 Ultra',
        hero_banner_image_url: 'https://images.unsplash.com/photo-1616469829941-c7200edec809?w=1920&q=80',
        video_attract_url: 'https://assets.mixkit.co/videos/preview/mixkit-futuristic-digital-screen-graphics-animation-41485-large.mp4',
        target_skus_json: JSON.stringify(['APPLE-IP16PM-256', 'SAMSUNG-S26U-256']),
        target_branch_scope: 'ALL_STORES',
        start_date: '2026-10-01',
        end_date: '2026-12-31',
        is_active: 1,
        created_by_ho_user_id: 'usr-ho-sales-director'
      },
      {
        id: 'ho-kiosk-camp-m4',
        campaign_title: 'Next-Gen Silicon Arena: MacBook Pro 16 M4 vs Dell XPS 16 Core Ultra 9',
        hero_banner_image_url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1920&q=80',
        video_attract_url: 'https://assets.mixkit.co/videos/preview/mixkit-set-of-plateaus-seen-from-the-sky-in-a-sunset-26070-large.mp4',
        target_skus_json: JSON.stringify(['APPLE-MBP16-M4-512', 'DELL-XPS16-9640']),
        target_branch_scope: 'ALL_STORES',
        start_date: '2026-10-15',
        end_date: '2026-12-31',
        is_active: 1,
        created_by_ho_user_id: 'usr-ho-sales-director'
      }
    ];

    for (const c of campaigns) {
      await connection.query(`
        INSERT INTO retail_kiosk_ho_campaigns (
          id, campaign_title, hero_banner_image_url, video_attract_url, target_skus_json,
          target_branch_scope, start_date, end_date, is_active, created_by_ho_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          campaign_title = VALUES(campaign_title),
          hero_banner_image_url = VALUES(hero_banner_image_url),
          video_attract_url = VALUES(video_attract_url),
          target_skus_json = VALUES(target_skus_json),
          is_active = VALUES(is_active)
      `, [
        c.id, c.campaign_title, c.hero_banner_image_url, c.video_attract_url, c.target_skus_json,
        c.target_branch_scope, c.start_date, c.end_date, c.is_active, c.created_by_ho_user_id
      ]);
    }

    // 3. Seed 3D Assets & Color Swatches
    const assets3D = [
      {
        id: 'asset-3d-ip16pm',
        sku: 'APPLE-IP16PM-256',
        model_name: 'Apple iPhone 16 Pro Max',
        brand: 'Apple',
        category: 'Smartphones',
        gltf_glb_url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb', // Fallback standard demo GLB or high-res mesh
        usdz_ar_url: 'https://modelviewer.dev/shared-assets/models/Astronaut.usdz',
        file_size_bytes: 4210000,
        polygon_count: 42500,
        materials_pbr_config: JSON.stringify({
          roughness: 0.28,
          metalness: 0.85,
          clearcoat: 0.9,
          envMapIntensity: 1.5,
          ior: 1.54,
          transmission: 0.05
        }),
        color_swatches_json: JSON.stringify([
          {
            color_id: 'desert_titanium',
            name: 'Desert Titanium',
            hex: '#C5B49D',
            albedo_color: 0xC5B49D,
            in_stock: true,
            stock_count: 8,
            badge: 'Most Popular'
          },
          {
            color_id: 'natural_titanium',
            name: 'Natural Titanium',
            hex: '#8C8680',
            albedo_color: 0x8C8680,
            in_stock: true,
            stock_count: 5,
            badge: 'Limited Stock'
          },
          {
            color_id: 'white_titanium',
            name: 'White Titanium',
            hex: '#E3E4E5',
            albedo_color: 0xE3E4E5,
            in_stock: true,
            stock_count: 12,
            badge: 'In Stock'
          },
          {
            color_id: 'black_titanium',
            name: 'Black Titanium',
            hex: '#3B3B3D',
            albedo_color: 0x3B3B3D,
            in_stock: true,
            stock_count: 9,
            badge: 'In Stock'
          }
        ]),
        default_camera_angle: JSON.stringify({ x: 0, y: 0.5, z: 2.2, fov: 35, target: [0, 0, 0] }),
        is_active: 1
      },
      {
        id: 'asset-3d-s26u',
        sku: 'SAMSUNG-S26U-256',
        model_name: 'Samsung Galaxy S26 Ultra',
        brand: 'Samsung',
        category: 'Smartphones',
        gltf_glb_url: 'https://modelviewer.dev/shared-assets/models/NeilArmstrong.glb',
        usdz_ar_url: 'https://modelviewer.dev/shared-assets/models/NeilArmstrong.usdz',
        file_size_bytes: 4890000,
        polygon_count: 44200,
        materials_pbr_config: JSON.stringify({
          roughness: 0.22,
          metalness: 0.92,
          clearcoat: 0.95,
          envMapIntensity: 1.7,
          ior: 1.60,
          transmission: 0.02
        }),
        color_swatches_json: JSON.stringify([
          {
            color_id: 'silver_shadow',
            name: 'Titanium Silver Shadow',
            hex: '#9AA0A6',
            albedo_color: 0x9AA0A6,
            in_stock: true,
            stock_count: 6,
            badge: 'Flagship Finish'
          },
          {
            color_id: 'titanium_gray',
            name: 'Titanium Gray',
            hex: '#6B6B6D',
            albedo_color: 0x6B6B6D,
            in_stock: true,
            stock_count: 4,
            badge: 'Only 4 Left'
          },
          {
            color_id: 'titanium_black',
            name: 'Titanium Black',
            hex: '#2E2E30',
            albedo_color: 0x2E2E30,
            in_stock: true,
            stock_count: 11,
            badge: 'In Stock'
          },
          {
            color_id: 'titanium_yellow',
            name: 'Titanium Yellow',
            hex: '#E5DFD3',
            albedo_color: 0xE5DFD3,
            in_stock: true,
            stock_count: 3,
            badge: 'Exclusive'
          }
        ]),
        default_camera_angle: JSON.stringify({ x: 0, y: 0.5, z: 2.2, fov: 35, target: [0, 0, 0] }),
        is_active: 1
      },
      {
        id: 'asset-3d-mbp16-m4',
        sku: 'APPLE-MBP16-M4-512',
        model_name: 'Apple MacBook Pro 16" (M4 Pro)',
        brand: 'Apple',
        category: 'Laptops',
        gltf_glb_url: 'https://modelviewer.dev/shared-assets/models/Astronaut.glb',
        usdz_ar_url: 'https://modelviewer.dev/shared-assets/models/Astronaut.usdz',
        file_size_bytes: 5200000,
        polygon_count: 41000,
        materials_pbr_config: JSON.stringify({
          roughness: 0.35,
          metalness: 0.88,
          clearcoat: 0.5,
          envMapIntensity: 1.4
        }),
        color_swatches_json: JSON.stringify([
          {
            color_id: 'space_black',
            name: 'Space Black',
            hex: '#2E2E30',
            albedo_color: 0x2E2E30,
            in_stock: true,
            stock_count: 4,
            badge: 'Signature Pro'
          },
          {
            color_id: 'silver',
            name: 'Silver',
            hex: '#E3E4E5',
            albedo_color: 0xE3E4E5,
            in_stock: true,
            stock_count: 6,
            badge: 'In Stock'
          }
        ]),
        default_camera_angle: JSON.stringify({ x: 0, y: 0.6, z: 2.6, fov: 40, target: [0, 0, 0] }),
        is_active: 1
      },
      {
        id: 'asset-3d-xps16',
        sku: 'DELL-XPS16-9640',
        model_name: 'Dell XPS 16 (Core Ultra 9)',
        brand: 'Dell',
        category: 'Laptops',
        gltf_glb_url: 'https://modelviewer.dev/shared-assets/models/NeilArmstrong.glb',
        usdz_ar_url: 'https://modelviewer.dev/shared-assets/models/NeilArmstrong.usdz',
        file_size_bytes: 4950000,
        polygon_count: 43000,
        materials_pbr_config: JSON.stringify({
          roughness: 0.30,
          metalness: 0.90,
          clearcoat: 0.6,
          envMapIntensity: 1.5
        }),
        color_swatches_json: JSON.stringify([
          {
            color_id: 'platinum_silver',
            name: 'Platinum Silver',
            hex: '#D1D5DB',
            albedo_color: 0xD1D5DB,
            in_stock: true,
            stock_count: 3,
            badge: 'In Stock'
          },
          {
            color_id: 'graphite',
            name: 'Graphite',
            hex: '#374151',
            albedo_color: 0x374151,
            in_stock: true,
            stock_count: 5,
            badge: 'In Stock'
          }
        ]),
        default_camera_angle: JSON.stringify({ x: 0, y: 0.6, z: 2.6, fov: 40, target: [0, 0, 0] }),
        is_active: 1
      }
    ];

    for (const a of assets3D) {
      await connection.query(`
        INSERT INTO retail_kiosk_3d_assets (
          id, sku, model_name, brand, category, gltf_glb_url, usdz_ar_url,
          file_size_bytes, polygon_count, materials_pbr_config, color_swatches_json,
          default_camera_angle, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          model_name = VALUES(model_name),
          brand = VALUES(brand),
          category = VALUES(category),
          materials_pbr_config = VALUES(materials_pbr_config),
          color_swatches_json = VALUES(color_swatches_json),
          polygon_count = VALUES(polygon_count),
          is_active = VALUES(is_active)
      `, [
        a.id, a.sku, a.model_name, a.brand, a.category, a.gltf_glb_url, a.usdz_ar_url,
        a.file_size_bytes, a.polygon_count, a.materials_pbr_config, a.color_swatches_json,
        a.default_camera_angle, a.is_active
      ]);
    }

    // 4. Seed Granular Product Specifications & Benchmark Scores
    const specs = [
      {
        id: 'spec-ip16pm',
        sku: 'APPLE-IP16PM-256',
        category: 'Smartphones',
        display_type: 'Super Retina XDR OLED ProMotion',
        display_size_inches: 6.90,
        resolution: '2868 x 1320',
        ppi: 460,
        peak_brightness_nits: 2000,
        refresh_rate_hz: '1-120Hz LTPO',
        glass_durability: 'Latest Ceramic Shield (2x Stronger)',
        camera_main: '48MP Fusion f/1.78 2nd-Gen Sensor-Shift',
        camera_telephoto: '5x Tetraprism 12MP 120mm f/2.8',
        camera_ultrawide: '48MP f/2.2 Hybrid Focus Pixels',
        video_recording_max: '4K@120fps Dolby Vision, ProRes Log',
        camera_features: JSON.stringify(['Dedicated Camera Control Button', 'Spatial Video & Audio', 'Studio Quality 4-Mic Array', 'ACF Tone Mapping']),
        processor_soc: 'Apple A18 Pro (3nm N3E, 6-Core CPU + 6-Core GPU)',
        geekbench_single_score: 3450,
        geekbench_multi_score: 8750,
        gpu_3dmark_extreme_score: 4980,
        ai_npu_tops: 38,
        battery_capacity_mah: 4685,
        wired_charging_watts: 30,
        wireless_charging_watts: 25,
        reverse_wireless_supported: 0,
        rated_video_playback_hours: 33,
        weight_grams: 227,
        thickness_mm: 8.25,
        chassis_material: 'Grade 5 Titanium Frame + Matte Back',
        ip_rating: 'IP68 (6m up to 30 min)',
        stylus_supported: 0
      },
      {
        id: 'spec-s26u',
        sku: 'SAMSUNG-S26U-256',
        category: 'Smartphones',
        display_type: 'Dynamic AMOLED 2X Vision Booster',
        display_size_inches: 6.90,
        resolution: '3120 x 1440 QHD+',
        ppi: 505,
        peak_brightness_nits: 2600,
        refresh_rate_hz: '1-120Hz LTPO',
        glass_durability: 'Corning Gorilla Armor (-75% Reflection)',
        camera_main: '200MP ISOCELL HP2SX f/1.7 OIS',
        camera_telephoto: '5x Periscope 50MP + 3x Optical 10MP (100x Space Zoom)',
        camera_ultrawide: '50MP f/2.0 Dual Pixel AF',
        video_recording_max: '8K@30fps, 4K@120fps HDR10+',
        camera_features: JSON.stringify(['ProVisual AI Engine', '100x Space Zoom', 'Super HDR Preview', 'Audio Zoom Directional']),
        processor_soc: 'Snapdragon 8 Elite / Gen 5 for Galaxy (3nm Oryon)',
        geekbench_single_score: 3210,
        geekbench_multi_score: 10450,
        gpu_3dmark_extreme_score: 5540,
        ai_npu_tops: 52,
        battery_capacity_mah: 5000,
        wired_charging_watts: 45,
        wireless_charging_watts: 15,
        reverse_wireless_supported: 1,
        rated_video_playback_hours: 30,
        weight_grams: 232,
        thickness_mm: 8.60,
        chassis_material: 'Grade 5 Titanium + Corning Armor',
        ip_rating: 'IP68 (1.5m up to 30 min)',
        stylus_supported: 1
      },
      {
        id: 'spec-mbp16-m4',
        sku: 'APPLE-MBP16-M4-512',
        category: 'Laptops',
        display_type: 'Liquid Retina XDR Mini-LED',
        display_size_inches: 16.20,
        resolution: '3456 x 2234',
        ppi: 254,
        peak_brightness_nits: 1600,
        refresh_rate_hz: '120Hz ProMotion',
        glass_durability: 'Optional Nano-Texture Glass',
        camera_main: '12MP Center Stage Camera with Desk View',
        camera_telephoto: 'N/A (Webcam Integration)',
        camera_ultrawide: '1080p Ultra-Wide Lens',
        video_recording_max: '1080p HD Center Stage 60fps',
        camera_features: JSON.stringify(['Center Stage Tracking', 'Studio-quality 3-mic array', 'Six-speaker sound system with force-cancelling woofers']),
        processor_soc: 'Apple M4 Pro (14-Core CPU + 20-Core GPU, 3nm)',
        geekbench_single_score: 3920,
        geekbench_multi_score: 22800,
        gpu_3dmark_extreme_score: 14200,
        ai_npu_tops: 38,
        battery_capacity_mah: 9960,
        wired_charging_watts: 140,
        wireless_charging_watts: 0,
        reverse_wireless_supported: 0,
        rated_video_playback_hours: 24,
        weight_grams: 2140,
        thickness_mm: 16.80,
        chassis_material: '100% Recycled Aluminum Unibody',
        ip_rating: 'Indoor Office Grade',
        stylus_supported: 0
      },
      {
        id: 'spec-xps16',
        sku: 'DELL-XPS16-9640',
        category: 'Laptops',
        display_type: '4K+ OLED InfinityEdge Touch',
        display_size_inches: 16.30,
        resolution: '3840 x 2400',
        ppi: 277,
        peak_brightness_nits: 500,
        refresh_rate_hz: '48-120Hz Variable',
        glass_durability: 'Corning Gorilla Glass Victus',
        camera_main: '1080p FHD RGB + IR Camera with Windows Hello',
        camera_telephoto: 'N/A',
        camera_ultrawide: 'N/A',
        video_recording_max: '1080p@30fps FHD',
        camera_features: JSON.stringify(['Windows Hello Facial Recognition', 'ExpressSign-in 2.0 Presence Detection', 'Quad-speaker design with Waves MaxxAudio']),
        processor_soc: 'Intel Core Ultra 9 185H (16-Core, 5.1GHz Turbo) + NVIDIA RTX 4070',
        geekbench_single_score: 2540,
        geekbench_multi_score: 15200,
        gpu_3dmark_extreme_score: 11800,
        ai_npu_tops: 34,
        battery_capacity_mah: 8500,
        wired_charging_watts: 130,
        wireless_charging_watts: 0,
        reverse_wireless_supported: 0,
        rated_video_playback_hours: 14,
        weight_grams: 2200,
        thickness_mm: 18.70,
        chassis_material: 'CNC Machined Aluminum + Glass Touchpad',
        ip_rating: 'Indoor Office Grade',
        stylus_supported: 1
      }
    ];

    for (const s of specs) {
      await connection.query(`
        INSERT INTO retail_kiosk_product_specs (
          id, sku, category, display_type, display_size_inches, resolution, ppi,
          peak_brightness_nits, refresh_rate_hz, glass_durability, camera_main,
          camera_telephoto, camera_ultrawide, video_recording_max, camera_features,
          processor_soc, geekbench_single_score, geekbench_multi_score,
          gpu_3dmark_extreme_score, ai_npu_tops, battery_capacity_mah, wired_charging_watts,
          wireless_charging_watts, reverse_wireless_supported, rated_video_playback_hours,
          weight_grams, thickness_mm, chassis_material, ip_rating, stylus_supported
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?
        )
        ON DUPLICATE KEY UPDATE
          display_type = VALUES(display_type),
          display_size_inches = VALUES(display_size_inches),
          peak_brightness_nits = VALUES(peak_brightness_nits),
          camera_main = VALUES(camera_main),
          processor_soc = VALUES(processor_soc),
          geekbench_single_score = VALUES(geekbench_single_score),
          geekbench_multi_score = VALUES(geekbench_multi_score),
          gpu_3dmark_extreme_score = VALUES(gpu_3dmark_extreme_score),
          ai_npu_tops = VALUES(ai_npu_tops),
          battery_capacity_mah = VALUES(battery_capacity_mah),
          weight_grams = VALUES(weight_grams),
          thickness_mm = VALUES(thickness_mm),
          chassis_material = VALUES(chassis_material),
          updated_at = NOW()
      `, [
        s.id, s.sku, s.category, s.display_type, s.display_size_inches, s.resolution, s.ppi,
        s.peak_brightness_nits, s.refresh_rate_hz, s.glass_durability, s.camera_main,
        s.camera_telephoto, s.camera_ultrawide, s.video_recording_max, s.camera_features,
        s.processor_soc, s.geekbench_single_score, s.geekbench_multi_score,
        s.gpu_3dmark_extreme_score, s.ai_npu_tops, s.battery_capacity_mah, s.wired_charging_watts,
        s.wireless_charging_watts, s.reverse_wireless_supported, s.rated_video_playback_hours,
        s.weight_grams, s.thickness_mm, s.chassis_material, s.ip_rating, s.stylus_supported
      ]);
    }

    await connection.commit();
    console.log('[Kiosk Seed] Successfully seeded Kiosk Terminals, HO Campaigns, 3D Assets, and Specs Matrix.');
  } catch (err) {
    await connection.rollback();
    console.error('[Kiosk Seed] Error seeding kiosk data:', err);
    throw err;
  } finally {
    connection.release();
  }
}

// Auto-run if executed directly
if (require.main === module) {
  seedKiosk3DComparison()
    .then(() => {
      console.log('Kiosk seed finished successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Kiosk seed failed:', err);
      process.exit(1);
    });
}
