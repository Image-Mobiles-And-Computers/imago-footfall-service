import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';
import { ComparisonEngine, SpecData } from './comparison.engine';

export interface ProductCatalogItem {
  sku: string;
  modelName: string;
  brand: string;
  category: string;
  tagline?: string;
  highlights?: string[];
  mrpPrice: number;
  discountAmount: number;
  bankCashbackAmount: number;
  tradeinBonusAmount: number;
  effectivePrice: number;
  monthlyEmiAmount: number;
  gltfGlbUrl: string;
  usdzArUrl: string;
  colorSwatches: Array<{
    color_id: string;
    name: string;
    hex: string;
    albedo_color?: number;
    in_stock: boolean;
    stock_count: number;
    badge?: string;
    heroImageUrl?: string;
    frameUrls?: string[];
  }>;
  materialsPbrConfig?: any;
  defaultCameraAngle?: any;
  storageVariants: Array<{
    tier?: string;
    storage?: string;
    mrpPrice?: number;
    price?: number;
    effectivePrice?: number;
    popular?: boolean;
  }>;
  specs: SpecData;
  isActive?: boolean;
}

export class KioskService {
  /**
   * Helper to format a raw DB join row into a ProductCatalogItem
   */
  private static mapRowToProduct(r: any): ProductCatalogItem {
    const isLaptop = r.category === 'Laptops' || r.category === 'Laptops & Computing';
    const mrp = Number(r.mrp_price) > 0 
      ? Number(r.mrp_price) 
      : (isLaptop ? (r.sku.includes('APPLE') ? 249900 : 219900) : (r.sku.includes('APPLE') ? 144900 : 134900));
    
    const discount = Number(r.discount_amount) > 0 
      ? Number(r.discount_amount) 
      : (isLaptop ? 12000 : 8000);
      
    const bankCashback = Number(r.bank_cashback_amount) > 0 ? Number(r.bank_cashback_amount) : 6000;
    const tradeinBonus = Number(r.tradein_bonus_amount) > 0 ? Number(r.tradein_bonus_amount) : 8000;
    const effectivePrice = Math.max(0, mrp - discount - bankCashback - tradeinBonus);
    const monthlyEmi = Math.round(effectivePrice / 24);

    let swatches: any[] = [];
    try {
      const parsed = typeof r.color_swatches_json === 'string' ? JSON.parse(r.color_swatches_json) : (r.color_swatches_json || []);
      swatches = (Array.isArray(parsed) ? parsed : []).map((s: any) => ({
        color_id: s.color_id || s.colorId || 'default',
        name: s.name || 'Showroom Finish',
        hex: s.hex || '#64748b',
        albedo_color: s.albedo_color || s.albedoColor,
        in_stock: s.in_stock !== undefined ? Boolean(s.in_stock) : true,
        stock_count: Number(s.stock_count || s.stockCount || 5),
        badge: s.badge || '',
        heroImageUrl: s.hero_image_url || s.heroImageUrl || '',
        frameUrls: Array.isArray(s.frame_urls) ? s.frame_urls : (Array.isArray(s.frameUrls) ? s.frameUrls : [])
      }));
    } catch {
      swatches = [];
    }

    let storageVariants: any[] = [];
    try {
      storageVariants = typeof r.storage_variants_json === 'string' ? JSON.parse(r.storage_variants_json) : (r.storage_variants_json || []);
    } catch {
      storageVariants = [];
    }

    if (storageVariants.length === 0) {
      storageVariants = isLaptop
        ? [
            { tier: '512GB SSD', storage: '512 GB', mrpPrice: mrp, price: mrp, effectivePrice, popular: false },
            { tier: '1TB SSD', storage: '1 TB', mrpPrice: mrp + 20000, price: mrp + 20000, effectivePrice: effectivePrice + 20000, popular: true },
            { tier: '2TB SSD', storage: '2 TB', mrpPrice: mrp + 60000, price: mrp + 60000, effectivePrice: effectivePrice + 60000, popular: false }
          ]
        : [
            { tier: '256GB', storage: '256 GB', mrpPrice: mrp, price: mrp, effectivePrice, popular: false },
            { tier: '512GB', storage: '512 GB', mrpPrice: mrp + 15000, price: mrp + 15000, effectivePrice: effectivePrice + 15000, popular: true },
            { tier: '1TB', storage: '1 TB', mrpPrice: mrp + 35000, price: mrp + 35000, effectivePrice: effectivePrice + 35000, popular: false }
          ];
    }

    let highlights: string[] = [];
    try {
      highlights = typeof r.highlights_json === 'string' ? JSON.parse(r.highlights_json) : (r.highlights_json || []);
    } catch {
      highlights = [];
    }
    if (highlights.length === 0) {
      highlights = [
        `${r.processor_soc || 'High-performance processor'} with advanced AI`,
        `${r.display_size_inches || 6.7}" ${r.display_type || 'OLED Display'} (${r.refresh_rate_hz || '120Hz'})`,
        `${r.camera_main || 'Pro Triple Camera'} with 4K HDR Recording`
      ];
    }

    let materialsPbrConfig = null;
    try {
      materialsPbrConfig = typeof r.materials_pbr_config === 'string' 
        ? JSON.parse(r.materials_pbr_config) 
        : (r.materials_pbr_config || null);
    } catch {
      materialsPbrConfig = null;
    }

    let defaultCameraAngle = null;
    try {
      defaultCameraAngle = typeof r.default_camera_angle === 'string' 
        ? JSON.parse(r.default_camera_angle) 
        : (r.default_camera_angle || null);
    } catch {
      defaultCameraAngle = null;
    }

    return {
      sku: r.sku,
      modelName: r.model_name,
      brand: r.brand,
      category: r.category,
      tagline: r.tagline || (isLaptop ? 'Next-Gen Silicon & Pro Display' : 'Titanium Flagship & Pro Visuals'),
      highlights,
      mrpPrice: mrp,
      discountAmount: discount,
      bankCashbackAmount: bankCashback,
      tradeinBonusAmount: tradeinBonus,
      effectivePrice,
      monthlyEmiAmount: monthlyEmi,
      gltfGlbUrl: r.gltf_glb_url || '',
      usdzArUrl: r.usdz_ar_url || '',
      colorSwatches: swatches,
      materialsPbrConfig,
      defaultCameraAngle,
      storageVariants,
      isActive: Boolean(r.is_active),
      specs: {
        sku: r.sku,
        category: r.category,
        display_type: r.display_type || 'OLED',
        display_size_inches: Number(r.display_size_inches || 6.7),
        resolution: r.resolution || '2800x1260',
        ppi: Number(r.ppi || 460),
        peak_brightness_nits: Number(r.peak_brightness_nits || 2000),
        refresh_rate_hz: r.refresh_rate_hz || '120Hz',
        glass_durability: r.glass_durability || 'Corning Gorilla Armor',
        camera_main: r.camera_main || '50MP OIS',
        camera_telephoto: r.camera_telephoto || '12MP 5x Zoom',
        camera_ultrawide: r.camera_ultrawide || '12MP Ultrawide',
        video_recording_max: r.video_recording_max || '4K 60fps',
        camera_features: r.camera_features,
        processor_soc: r.processor_soc || 'Flagship SoC',
        geekbench_single_score: Number(r.geekbench_single_score || 3000),
        geekbench_multi_score: Number(r.geekbench_multi_score || 8500),
        gpu_3dmark_extreme_score: Number(r.gpu_3dmark_extreme_score || 5500),
        ai_npu_tops: Number(r.ai_npu_tops || 45),
        battery_capacity_mah: Number(r.battery_capacity_mah || 5000),
        wired_charging_watts: Number(r.wired_charging_watts || 45),
        wireless_charging_watts: Number(r.wireless_charging_watts || 15),
        reverse_wireless_supported: Boolean(r.reverse_wireless_supported),
        rated_video_playback_hours: Number(r.rated_video_playback_hours || 24),
        weight_grams: Number(r.weight_grams || 220),
        thickness_mm: Number(r.thickness_mm || 8.2),
        chassis_material: r.chassis_material || 'Grade 5 Titanium',
        ip_rating: r.ip_rating || 'IP68',
        stylus_supported: Boolean(r.stylus_supported)
      }
    };
  }

  /**
   * Fetch active kiosk catalog with 3D models, swatches, and specs
   */
  public static async getCatalog(category?: string): Promise<ProductCatalogItem[]> {
    let query = `
      SELECT 
        a.sku,
        a.model_name,
        a.brand,
        a.category,
        a.gltf_glb_url,
        a.usdz_ar_url,
        a.materials_pbr_config,
        a.color_swatches_json,
        a.default_camera_angle,
        a.mrp_price,
        a.discount_amount,
        a.bank_cashback_amount,
        a.tradein_bonus_amount,
        a.tagline,
        a.storage_variants_json,
        a.highlights_json,
        a.is_active,
        s.*,
        a.category AS category
      FROM retail_kiosk_3d_assets a
      LEFT JOIN retail_kiosk_product_specs s ON a.sku = s.sku
      WHERE a.is_active = TRUE
    `;
    const params: any[] = [];
    if (category) {
      query += ' AND a.category = ?';
      params.push(category);
    }
    query += ' ORDER BY a.brand ASC, a.model_name ASC';

    const [rows]: any = await pool.query(query, params);
    return rows.map((r: any) => this.mapRowToProduct(r));
  }

  /**
   * Fetch all products for Admin / Governance (including inactive) with search and filters
   */
  public static async getAllProducts(filter?: {
    category?: string;
    brand?: string;
    search?: string;
    includeInactive?: boolean;
  }): Promise<ProductCatalogItem[]> {
    let query = `
      SELECT 
        a.sku,
        a.model_name,
        a.brand,
        a.category,
        a.gltf_glb_url,
        a.usdz_ar_url,
        a.materials_pbr_config,
        a.color_swatches_json,
        a.default_camera_angle,
        a.mrp_price,
        a.discount_amount,
        a.bank_cashback_amount,
        a.tradein_bonus_amount,
        a.tagline,
        a.storage_variants_json,
        a.highlights_json,
        a.is_active,
        s.*,
        a.category AS category
      FROM retail_kiosk_3d_assets a
      LEFT JOIN retail_kiosk_product_specs s ON a.sku = s.sku
      WHERE 1=1
    `;
    const params: any[] = [];

    if (!filter?.includeInactive) {
      query += ' AND a.is_active = TRUE';
    }

    if (filter?.category && filter.category !== 'ALL') {
      query += ' AND a.category = ?';
      params.push(filter.category);
    }

    if (filter?.brand && filter.brand !== 'ALL') {
      query += ' AND a.brand = ?';
      params.push(filter.brand);
    }

    if (filter?.search) {
      query += ' AND (a.model_name LIKE ? OR a.sku LIKE ? OR a.brand LIKE ?)';
      const term = `%${filter.search}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY a.brand ASC, a.model_name ASC';

    const [rows]: any = await pool.query(query, params);
    return rows.map((r: any) => this.mapRowToProduct(r));
  }

  /**
   * Fetch single product by SKU
   */
  public static async getProductBySku(sku: string): Promise<ProductCatalogItem | null> {
    const query = `
      SELECT 
        a.sku,
        a.model_name,
        a.brand,
        a.category,
        a.gltf_glb_url,
        a.usdz_ar_url,
        a.materials_pbr_config,
        a.color_swatches_json,
        a.default_camera_angle,
        a.mrp_price,
        a.discount_amount,
        a.bank_cashback_amount,
        a.tradein_bonus_amount,
        a.tagline,
        a.storage_variants_json,
        a.highlights_json,
        a.is_active,
        s.*
      FROM retail_kiosk_3d_assets a
      LEFT JOIN retail_kiosk_product_specs s ON a.sku = s.sku
      WHERE a.sku = ?
      LIMIT 1
    `;
    const [rows]: any = await pool.query(query, [sku]);
    if (!rows || rows.length === 0) return null;
    return this.mapRowToProduct(rows[0]);
  }

  /**
   * Create new product in both retail_kiosk_3d_assets and retail_kiosk_product_specs
   */
  public static async createProduct(data: any): Promise<ProductCatalogItem> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const assetId = uuidv4();
      const specId = uuidv4();
      const sku = (data.sku || `IMAGO-${Date.now()}`).toUpperCase().trim();

      const colorSwatchesJson = JSON.stringify(data.colorSwatches || data.color_swatches_json || [
        { color_id: 'default_black', name: 'Phantom Black', hex: '#1e293b', in_stock: true, stock_count: 5, badge: 'In Stock' }
      ]);
      const storageVariantsJson = JSON.stringify(data.storageVariants || data.storage_variants_json || [
        { tier: '256GB', storage: '256 GB', mrpPrice: data.mrpPrice || 99999, price: data.mrpPrice || 99999, popular: true }
      ]);
      const highlightsJson = JSON.stringify(data.highlights || data.highlights_json || [
        'Premium Aluminum & Glass Architecture',
        'All-Day High Capacity Battery',
        'High-Resolution Pro Retina Display'
      ]);
      const materialsPbr = JSON.stringify(data.materials_pbr_config || {
        roughness: 0.3,
        metalness: 0.85,
        clearcoat: 0.8,
        envMapIntensity: 1.5
      });

      await connection.query(`
        INSERT INTO retail_kiosk_3d_assets (
          id, sku, model_name, brand, category, gltf_glb_url, usdz_ar_url, file_size_bytes,
          polygon_count, materials_pbr_config, color_swatches_json, is_active,
          mrp_price, discount_amount, bank_cashback_amount, tradein_bonus_amount, tagline,
          storage_variants_json, highlights_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        assetId,
        sku,
        data.modelName || data.model_name || 'New Flagship Device',
        data.brand || 'Generic',
        data.category || 'Smartphones',
        data.gltfGlbUrl || data.gltf_glb_url || '',
        data.usdzArUrl || data.usdz_ar_url || '',
        Number(data.file_size_bytes || 4000000),
        Number(data.polygon_count || 45000),
        materialsPbr,
        colorSwatchesJson,
        data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
        Number(data.mrpPrice || data.mrp_price || 99999),
        Number(data.discountAmount || data.discount_amount || 0),
        Number(data.bankCashbackAmount || data.bank_cashback_amount || 0),
        Number(data.tradeinBonusAmount || data.tradein_bonus_amount || 0),
        data.tagline || 'Next-Generation Mobile Innovation',
        storageVariantsJson,
        highlightsJson
      ]);

      const specs = data.specs || {};
      await connection.query(`
        INSERT INTO retail_kiosk_product_specs (
          id, sku, category, display_type, display_size_inches, resolution, ppi,
          peak_brightness_nits, refresh_rate_hz, glass_durability, camera_main,
          camera_telephoto, camera_ultrawide, video_recording_max, camera_features,
          processor_soc, geekbench_single_score, geekbench_multi_score,
          gpu_3dmark_extreme_score, ai_npu_tops, battery_capacity_mah,
          wired_charging_watts, wireless_charging_watts, reverse_wireless_supported,
          rated_video_playback_hours, weight_grams, thickness_mm, chassis_material,
          ip_rating, stylus_supported
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        specId,
        sku,
        data.category || 'Smartphones',
        specs.display_type || 'LTPO AMOLED',
        Number(specs.display_size_inches || 6.7),
        specs.resolution || '2800x1260',
        Number(specs.ppi || 460),
        Number(specs.peak_brightness_nits || 2600),
        specs.refresh_rate_hz || '120Hz Adapt',
        specs.glass_durability || 'Corning Gorilla Armor',
        specs.camera_main || '50MP OIS',
        specs.camera_telephoto || '12MP 5x Optical',
        specs.camera_ultrawide || '12MP Macro',
        specs.video_recording_max || '4K 60fps',
        JSON.stringify(specs.camera_features || ['Night Mode', 'Pro RAW', 'Action Mode']),
        specs.processor_soc || 'Snapdragon 8 Gen 4 / A18 Pro',
        Number(specs.geekbench_single_score || 3200),
        Number(specs.geekbench_multi_score || 9500),
        Number(specs.gpu_3dmark_extreme_score || 6200),
        Number(specs.ai_npu_tops || 45),
        Number(specs.battery_capacity_mah || 5000),
        Number(specs.wired_charging_watts || 45),
        Number(specs.wireless_charging_watts || 15),
        specs.reverse_wireless_supported ? 1 : 0,
        Number(specs.rated_video_playback_hours || 24),
        Number(specs.weight_grams || 220),
        Number(specs.thickness_mm || 8.2),
        specs.chassis_material || 'Grade 5 Titanium',
        specs.ip_rating || 'IP68',
        specs.stylus_supported ? 1 : 0
      ]);

      await connection.commit();
      const created = await this.getProductBySku(sku);
      return created!;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Update existing product details in both tables
   */
  public static async updateProduct(sku: string, data: any): Promise<ProductCatalogItem> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Update 3D Asset & Commercial table
      const assetSets: string[] = [];
      const assetParams: any[] = [];

      if (data.modelName !== undefined || data.model_name !== undefined) {
        assetSets.push('model_name = ?');
        assetParams.push(data.modelName || data.model_name);
      }
      if (data.brand !== undefined) {
        assetSets.push('brand = ?');
        assetParams.push(data.brand);
      }
      if (data.category !== undefined) {
        assetSets.push('category = ?');
        assetParams.push(data.category);
      }
      if (data.tagline !== undefined) {
        assetSets.push('tagline = ?');
        assetParams.push(data.tagline);
      }
      if (data.mrpPrice !== undefined || data.mrp_price !== undefined) {
        assetSets.push('mrp_price = ?');
        assetParams.push(Number(data.mrpPrice || data.mrp_price));
      }
      if (data.discountAmount !== undefined || data.discount_amount !== undefined) {
        assetSets.push('discount_amount = ?');
        assetParams.push(Number(data.discountAmount || data.discount_amount));
      }
      if (data.bankCashbackAmount !== undefined || data.bank_cashback_amount !== undefined) {
        assetSets.push('bank_cashback_amount = ?');
        assetParams.push(Number(data.bankCashbackAmount || data.bank_cashback_amount));
      }
      if (data.tradeinBonusAmount !== undefined || data.tradein_bonus_amount !== undefined) {
        assetSets.push('tradein_bonus_amount = ?');
        assetParams.push(Number(data.tradeinBonusAmount || data.tradein_bonus_amount));
      }
      if (data.gltfGlbUrl !== undefined || data.gltf_glb_url !== undefined) {
        assetSets.push('gltf_glb_url = ?');
        assetParams.push(data.gltfGlbUrl || data.gltf_glb_url);
      }
      if (data.usdzArUrl !== undefined || data.usdz_ar_url !== undefined) {
        assetSets.push('usdz_ar_url = ?');
        assetParams.push(data.usdzArUrl || data.usdz_ar_url);
      }
      if (data.colorSwatches !== undefined || data.color_swatches_json !== undefined) {
        assetSets.push('color_swatches_json = ?');
        assetParams.push(JSON.stringify(data.colorSwatches || data.color_swatches_json));
      }
      if (data.storageVariants !== undefined || data.storage_variants_json !== undefined) {
        assetSets.push('storage_variants_json = ?');
        assetParams.push(JSON.stringify(data.storageVariants || data.storage_variants_json));
      }
      if (data.highlights !== undefined || data.highlights_json !== undefined) {
        assetSets.push('highlights_json = ?');
        assetParams.push(JSON.stringify(data.highlights || data.highlights_json));
      }
      if (data.isActive !== undefined || data.is_active !== undefined) {
        assetSets.push('is_active = ?');
        assetParams.push(data.isActive !== undefined ? (data.isActive ? 1 : 0) : (data.is_active ? 1 : 0));
      }

      if (assetSets.length > 0) {
        assetParams.push(sku);
        await connection.query(`
          UPDATE retail_kiosk_3d_assets
          SET ${assetSets.join(', ')}
          WHERE sku = ?
        `, assetParams);
      }

      // 2. Update Technical Specs if specs object provided
      const specs = data.specs;
      if (specs && typeof specs === 'object') {
        const specSets: string[] = [];
        const specParams: any[] = [];

        if (specs.display_type !== undefined) { specSets.push('display_type = ?'); specParams.push(specs.display_type); }
        if (specs.display_size_inches !== undefined) { specSets.push('display_size_inches = ?'); specParams.push(Number(specs.display_size_inches)); }
        if (specs.resolution !== undefined) { specSets.push('resolution = ?'); specParams.push(specs.resolution); }
        if (specs.ppi !== undefined) { specSets.push('ppi = ?'); specParams.push(Number(specs.ppi)); }
        if (specs.peak_brightness_nits !== undefined) { specSets.push('peak_brightness_nits = ?'); specParams.push(Number(specs.peak_brightness_nits)); }
        if (specs.refresh_rate_hz !== undefined) { specSets.push('refresh_rate_hz = ?'); specParams.push(specs.refresh_rate_hz); }
        if (specs.glass_durability !== undefined) { specSets.push('glass_durability = ?'); specParams.push(specs.glass_durability); }
        if (specs.camera_main !== undefined) { specSets.push('camera_main = ?'); specParams.push(specs.camera_main); }
        if (specs.camera_telephoto !== undefined) { specSets.push('camera_telephoto = ?'); specParams.push(specs.camera_telephoto); }
        if (specs.camera_ultrawide !== undefined) { specSets.push('camera_ultrawide = ?'); specParams.push(specs.camera_ultrawide); }
        if (specs.video_recording_max !== undefined) { specSets.push('video_recording_max = ?'); specParams.push(specs.video_recording_max); }
        if (specs.camera_features !== undefined) { specSets.push('camera_features = ?'); specParams.push(JSON.stringify(specs.camera_features)); }
        if (specs.processor_soc !== undefined) { specSets.push('processor_soc = ?'); specParams.push(specs.processor_soc); }
        if (specs.geekbench_single_score !== undefined) { specSets.push('geekbench_single_score = ?'); specParams.push(Number(specs.geekbench_single_score)); }
        if (specs.geekbench_multi_score !== undefined) { specSets.push('geekbench_multi_score = ?'); specParams.push(Number(specs.geekbench_multi_score)); }
        if (specs.gpu_3dmark_extreme_score !== undefined) { specSets.push('gpu_3dmark_extreme_score = ?'); specParams.push(Number(specs.gpu_3dmark_extreme_score)); }
        if (specs.ai_npu_tops !== undefined) { specSets.push('ai_npu_tops = ?'); specParams.push(Number(specs.ai_npu_tops)); }
        if (specs.battery_capacity_mah !== undefined) { specSets.push('battery_capacity_mah = ?'); specParams.push(Number(specs.battery_capacity_mah)); }
        if (specs.wired_charging_watts !== undefined) { specSets.push('wired_charging_watts = ?'); specParams.push(Number(specs.wired_charging_watts)); }
        if (specs.wireless_charging_watts !== undefined) { specSets.push('wireless_charging_watts = ?'); specParams.push(Number(specs.wireless_charging_watts)); }
        if (specs.reverse_wireless_supported !== undefined) { specSets.push('reverse_wireless_supported = ?'); specParams.push(specs.reverse_wireless_supported ? 1 : 0); }
        if (specs.rated_video_playback_hours !== undefined) { specSets.push('rated_video_playback_hours = ?'); specParams.push(Number(specs.rated_video_playback_hours)); }
        if (specs.weight_grams !== undefined) { specSets.push('weight_grams = ?'); specParams.push(Number(specs.weight_grams)); }
        if (specs.thickness_mm !== undefined) { specSets.push('thickness_mm = ?'); specParams.push(Number(specs.thickness_mm)); }
        if (specs.chassis_material !== undefined) { specSets.push('chassis_material = ?'); specParams.push(specs.chassis_material); }
        if (specs.ip_rating !== undefined) { specSets.push('ip_rating = ?'); specParams.push(specs.ip_rating); }
        if (specs.stylus_supported !== undefined) { specSets.push('stylus_supported = ?'); specParams.push(specs.stylus_supported ? 1 : 0); }

        if (specSets.length > 0) {
          specParams.push(sku);
          await connection.query(`
            UPDATE retail_kiosk_product_specs
            SET ${specSets.join(', ')}
            WHERE sku = ?
          `, specParams);
        }
      }

      await connection.commit();
      const updated = await this.getProductBySku(sku);
      if (!updated) {
        throw new Error(`Product with SKU ${sku} not found`);
      }
      return updated;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete or deactivate product
   */
  public static async deleteProduct(sku: string, hardDelete: boolean = false): Promise<boolean> {
    if (hardDelete) {
      await pool.query('DELETE FROM retail_kiosk_product_specs WHERE sku = ?', [sku]);
      const [res]: any = await pool.query('DELETE FROM retail_kiosk_3d_assets WHERE sku = ?', [sku]);
      return res.affectedRows > 0;
    } else {
      const [res]: any = await pool.query('UPDATE retail_kiosk_3d_assets SET is_active = FALSE WHERE sku = ?', [sku]);
      return res.affectedRows > 0;
    }
  }

  /**
   * Compare two SKUs and calculate dynamic differentials
   */
  public static async compareModels(skuA: string, skuB: string): Promise<any> {
    const catalog = await this.getCatalog();
    const modelA = catalog.find(m => m.sku === skuA);
    const modelB = catalog.find(m => m.sku === skuB);

    if (!modelA || !modelB) {
      throw new Error(`One or both models (${skuA}, ${skuB}) not found in kiosk catalog.`);
    }

    const comparison = ComparisonEngine.computeDifferentials(modelA.specs, modelB.specs);

    return {
      modelA,
      modelB,
      differentials: comparison.dimensions,
      verdict: comparison.executiveVerdict
    };
  }

  /**
   * Record kiosk terminal heartbeat
   */
  public static async recordHeartbeat(kioskCode: string, ipAddress?: string): Promise<boolean> {
    const [res]: any = await pool.query(`
      UPDATE retail_kiosk_terminals
      SET 
        device_status = 'ONLINE',
        last_heartbeat_at = NOW(),
        ip_address = COALESCE(?, ip_address)
      WHERE kiosk_code = ? OR id = ?
    `, [ipAddress || null, kioskCode, kioskCode]);
    return res.affectedRows > 0;
  }

  /**
   * Start a touch session on the kiosk
   */
  public static async startSession(kioskId: string, branchId: string, walkinSessionId?: string): Promise<string> {
    const sessionId = uuidv4();
    await pool.query(`
      INSERT INTO retail_kiosk_sessions (
        id, kiosk_id, branch_id, walkin_session_id, session_started_at, total_screen_touches
      ) VALUES (?, ?, ?, ?, NOW(), 1)
    `, [sessionId, kioskId, branchId, walkinSessionId || null]);
    return sessionId;
  }

  /**
   * Update touch session dwell and screen touches
   */
  public static async updateSession(sessionId: string, data: {
    dwellSeconds?: number;
    customerPhone?: string;
    categoryBrowsed?: string;
    touchIncrement?: number;
  }): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];

    if (data.dwellSeconds !== undefined) {
      sets.push('dwell_duration_seconds = ?');
      params.push(data.dwellSeconds);
    }
    if (data.customerPhone) {
      sets.push('customer_phone = ?');
      params.push(data.customerPhone);
    }
    if (data.categoryBrowsed) {
      sets.push('primary_category_browsed = ?');
      params.push(data.categoryBrowsed);
    }
    if (data.touchIncrement) {
      sets.push('total_screen_touches = total_screen_touches + ?');
      params.push(data.touchIncrement);
    }

    if (sets.length > 0) {
      params.push(sessionId);
      await pool.query(`
        UPDATE retail_kiosk_sessions
        SET ${sets.join(', ')}
        WHERE id = ?
      `, params);
    }
  }

  /**
   * Log comparison telemetry event
   */
  public static async logComparisonTelemetry(sessionId: string, skuA: string, skuB: string, durationSeconds: number): Promise<void> {
    const id = uuidv4();
    await pool.query(`
      INSERT INTO retail_kiosk_comparisons (
        id, session_id, model_a_sku, model_b_sku, duration_seconds
      ) VALUES (?, ?, ?, ?, ?)
    `, [id, sessionId, skuA, skuB, durationSeconds]);
  }

  /**
   * Request live product demo / on-demand floor associate paging
   */
  public static async requestAssistance(payload: {
    sessionId: string;
    kioskId: string;
    branchId: string;
    requestedSku: string;
    brandId?: string;
  }): Promise<{
    id: string;
    assignedAssociateName: string;
    etaSeconds: number;
    status: string;
  }> {
    const id = uuidv4();

    // Query on-duty floor staff or brand promoter in imago-footfall-service / imago-hr-service
    const [staffRows]: any = await pool.query(`
      SELECT 
        s.employee_id, 
        s.staff_name, 
        s.current_presence_status, 
        s.assigned_brand_name
      FROM retail_staff_floor_status s
      WHERE s.branch_id = ? AND s.current_presence_status IN ('READY_FOR_NEXT', 'CONSULTING_CUSTOMER')
      ORDER BY (s.current_presence_status = 'READY_FOR_NEXT') DESC
      LIMIT 1
    `, [payload.branchId]);

    const assignedStaff = staffRows && staffRows.length > 0
      ? staffRows[0]
      : { employee_id: 'emp-rahul-01', staff_name: 'Rahul Sharma (Samsung Specialist)' };

    await pool.query(`
      INSERT INTO retail_kiosk_assistance_requests (
        id, session_id, kiosk_id, branch_id, requested_sku, brand_id,
        assigned_employee_id, status, requested_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())
    `, [
      id,
      payload.sessionId,
      payload.kioskId,
      payload.branchId,
      payload.requestedSku,
      payload.brandId || null,
      assignedStaff.employee_id
    ]);

    return {
      id,
      assignedAssociateName: assignedStaff.staff_name,
      etaSeconds: 45,
      status: 'PENDING'
    };
  }

  /**
   * Send Omnichannel Quotation to customer WhatsApp
   */
  public static async sendWhatsAppQuotation(payload: {
    sessionId: string;
    branchId: string;
    customerPhone: string;
    quotedSkus: any[];
    downPaymentAmount?: number;
    monthlyEmiAmount?: number;
    financePartnerName?: string;
  }): Promise<string> {
    const quoteId = uuidv4();
    await pool.query(`
      INSERT INTO retail_kiosk_quotations (
        id, session_id, branch_id, customer_phone, quoted_skus,
        down_payment_amount, monthly_emi_amount, finance_partner_name, sent_via
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'WHATSAPP')
    `, [
      quoteId,
      payload.sessionId,
      payload.branchId,
      payload.customerPhone,
      JSON.stringify(payload.quotedSkus),
      payload.downPaymentAmount || 0,
      payload.monthlyEmiAmount || 0,
      payload.financePartnerName || 'Bajaj Finserv'
    ]);
    return quoteId;
  }

  /**
   * Get active HO campaigns for kiosks
   */
  public static async getHoCampaigns(): Promise<any[]> {
    const [rows]: any = await pool.query(`
      SELECT * FROM retail_kiosk_ho_campaigns
      WHERE is_active = TRUE AND end_date >= CURDATE()
      ORDER BY created_at DESC
    `);
    return rows;
  }

  /**
   * Dispatch remote fleet command
   */
  public static async dispatchRemoteCommand(kioskId: string, commandType: string, payload?: any, hoUserId: string = 'usr-ho-sales-director'): Promise<string> {
    const cmdId = uuidv4();
    await pool.query(`
      INSERT INTO retail_kiosk_remote_commands (
        id, kiosk_id, command_type, payload_json, status, dispatched_by_ho_user_id
      ) VALUES (?, ?, ?, ?, 'PENDING', ?)
    `, [
      cmdId,
      kioskId,
      commandType,
      payload ? JSON.stringify(payload) : null,
      hoUserId
    ]);
    return cmdId;
  }

  /**
   * Get all terminals overview for HO fleet management
   */
  public static async getFleetOverview(branchId?: string): Promise<any[]> {
    let query = `
      SELECT 
        t.*,
        c.campaign_title as active_campaign_title,
        TIMESTAMPDIFF(SECOND, t.last_heartbeat_at, NOW()) as seconds_since_heartbeat
      FROM retail_kiosk_terminals t
      LEFT JOIN retail_kiosk_ho_campaigns c ON t.active_ho_campaign_id = c.id
    `;
    const params: any[] = [];
    if (branchId) {
      query += ' WHERE t.branch_id = ?';
      params.push(branchId);
    }
    query += ' ORDER BY t.kiosk_code ASC';

    const [rows]: any = await pool.query(query, params);
    return rows.map((r: any) => ({
      ...r,
      is_live: r.seconds_since_heartbeat !== null && r.seconds_since_heartbeat <= 90
    }));
  }

  /**
   * Get dynamic authorized categories for showroom kiosk
   */
  public static async getKioskCategories(): Promise<any[]> {
    const [rows]: any = await pool.query(`
      SELECT id, code, name, icon, display_order as displayOrder
      FROM retail_category_master
      WHERE is_active = TRUE AND is_allowed_in_kiosk = TRUE
      ORDER BY display_order ASC, name ASC
    `);
    return rows || [];
  }
}

