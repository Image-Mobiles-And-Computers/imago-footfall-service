import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';
import { seedFootfallData } from '../../database/seeds/seed-footfall-taxonomies';

// ==============================================================================
// 1. BRAND MASTER CONTROLLER
// ==============================================================================

export const getBrands = async (req: Request, res: Response) => {
  try {
    const { include_inactive, tier } = req.query;
    let query = 'SELECT * FROM retail_brand_master';
    const conditions: string[] = [];
    const params: any[] = [];

    if (!include_inactive || include_inactive !== 'true') {
      conditions.push('is_active = TRUE');
    }
    if (tier) {
      conditions.push('tier = ?');
      params.push(tier);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY display_order ASC, name ASC';

    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch brands', error: error.message });
  }
};

export const getBrandById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM retail_brand_master WHERE id = ?', [id]);
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }
    const [prodCount]: any = await pool.query('SELECT COUNT(*) as count FROM retail_product_master WHERE brand_id = ? AND is_active = TRUE', [id]);
    res.json({ success: true, data: { ...rows[0], active_products_count: prodCount[0]?.count || 0 } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch brand', error: error.message });
  }
};

export const createBrand = async (req: Request, res: Response) => {
  try {
    const { code, name, tier, category_focus, logo_url, display_order } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Brand code and name are required' });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO retail_brand_master (id, code, name, tier, category_focus, logo_url, display_order, is_active)
       VALUES (?, UPPER(?), ?, ?, ?, ?, ?, TRUE)`,
      [id, code.trim(), name.trim(), tier || 'PREMIUM', category_focus || null, logo_url || null, display_order || 0]
    );

    const [created]: any = await pool.query('SELECT * FROM retail_brand_master WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'Brand created successfully', data: created[0] });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Brand code or name already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create brand', error: error.message });
  }
};

export const updateBrand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, tier, category_focus, logo_url, display_order, is_active } = req.body;

    const [existing]: any = await pool.query('SELECT * FROM retail_brand_master WHERE id = ?', [id]);
    if (!existing[0]) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }

    await pool.query(
      `UPDATE retail_brand_master 
       SET name = COALESCE(?, name),
           tier = COALESCE(?, tier),
           category_focus = COALESCE(?, category_focus),
           logo_url = COALESCE(?, logo_url),
           display_order = COALESCE(?, display_order),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name, tier, category_focus, logo_url, display_order, is_active, id]
    );

    // If brand name changed, cascade update denormalized brand_name in retail_product_master
    if (name && name !== existing[0].name) {
      await pool.query('UPDATE retail_product_master SET brand_name = ? WHERE brand_id = ?', [name, id]);
    }

    const [updated]: any = await pool.query('SELECT * FROM retail_brand_master WHERE id = ?', [id]);
    res.json({ success: true, message: 'Brand updated successfully', data: updated[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to update brand', error: error.message });
  }
};

export const deleteBrand = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [prods]: any = await pool.query('SELECT COUNT(*) as count FROM retail_product_master WHERE brand_id = ?', [id]);
    if (prods[0]?.count > 0) {
      // Soft-delete if products exist
      await pool.query('UPDATE retail_brand_master SET is_active = FALSE WHERE id = ?', [id]);
      return res.json({ success: true, message: 'Brand deactivated because it contains associated products' });
    }
    await pool.query('DELETE FROM retail_brand_master WHERE id = ?', [id]);
    res.json({ success: true, message: 'Brand deleted permanently' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to delete brand', error: error.message });
  }
};

// ==============================================================================
// 2. CATEGORY MASTER CONTROLLER
// ==============================================================================

export const getCategories = async (req: Request, res: Response) => {
  try {
    const { include_inactive } = req.query;
    let query = 'SELECT * FROM retail_category_master';
    if (!include_inactive || include_inactive !== 'true') {
      query += ' WHERE is_active = TRUE';
    }
    query += ' ORDER BY display_order ASC, name ASC';

    const [rows] = await pool.query(query);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch categories', error: error.message });
  }
};

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { code, name, icon, display_order } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Category code and name are required' });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO retail_category_master (id, code, name, icon, display_order, is_active)
       VALUES (?, UPPER(?), ?, ?, ?, TRUE)`,
      [id, code.trim(), name.trim(), icon || 'Tag', display_order || 0]
    );

    const [created]: any = await pool.query('SELECT * FROM retail_category_master WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'Category created successfully', data: created[0] });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Category code or name already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create category', error: error.message });
  }
};

export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, icon, display_order, is_active } = req.body;

    const [existing]: any = await pool.query('SELECT * FROM retail_category_master WHERE id = ?', [id]);
    if (!existing[0]) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }

    await pool.query(
      `UPDATE retail_category_master
       SET name = COALESCE(?, name),
           icon = COALESCE(?, icon),
           display_order = COALESCE(?, display_order),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name, icon, display_order, is_active, id]
    );

    if (name && name !== existing[0].name) {
      await pool.query('UPDATE retail_product_master SET category_name = ? WHERE category_id = ?', [name, id]);
    }

    const [updated]: any = await pool.query('SELECT * FROM retail_category_master WHERE id = ?', [id]);
    res.json({ success: true, message: 'Category updated successfully', data: updated[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to update category', error: error.message });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [prods]: any = await pool.query('SELECT COUNT(*) as count FROM retail_product_master WHERE category_id = ?', [id]);
    if (prods[0]?.count > 0) {
      await pool.query('UPDATE retail_category_master SET is_active = FALSE WHERE id = ?', [id]);
      return res.json({ success: true, message: 'Category deactivated because it contains associated products' });
    }
    await pool.query('DELETE FROM retail_category_master WHERE id = ?', [id]);
    res.json({ success: true, message: 'Category deleted permanently' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to delete category', error: error.message });
  }
};

// ==============================================================================
// 3. REASON TAXONOMIES CONTROLLER
// ==============================================================================

export const getTaxonomies = async (req: Request, res: Response) => {
  try {
    const { category, include_inactive } = req.query;
    let query = 'SELECT * FROM retail_reason_taxonomies';
    const conditions: string[] = [];
    const params: any[] = [];

    if (!include_inactive || include_inactive !== 'true') {
      conditions.push('is_active = TRUE');
    }
    if (category) {
      conditions.push('category = ?');
      params.push(category);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY category ASC, display_order ASC';

    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch taxonomies', error: error.message });
  }
};

export const createTaxonomy = async (req: Request, res: Response) => {
  try {
    const { category, code, label, requires_competitor_info, requires_sku_info, requires_price_diff, display_order } = req.body;
    if (!category || !code || !label) {
      return res.status(400).json({ success: false, message: 'Category, code, and label are required' });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO retail_reason_taxonomies (id, category, code, label, requires_competitor_info, requires_sku_info, requires_price_diff, display_order, is_active)
       VALUES (?, ?, UPPER(?), ?, ?, ?, ?, ?, TRUE)`,
      [
        id,
        category,
        code.trim(),
        label.trim(),
        Boolean(requires_competitor_info),
        Boolean(requires_sku_info),
        Boolean(requires_price_diff),
        display_order || 0
      ]
    );

    const [created]: any = await pool.query('SELECT * FROM retail_reason_taxonomies WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'Reason taxonomy created', data: created[0] });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Taxonomy code already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create taxonomy', error: error.message });
  }
};

export const updateTaxonomy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, category, requires_competitor_info, requires_sku_info, requires_price_diff, display_order, is_active } = req.body;

    await pool.query(
      `UPDATE retail_reason_taxonomies
       SET label = COALESCE(?, label),
           category = COALESCE(?, category),
           requires_competitor_info = COALESCE(?, requires_competitor_info),
           requires_sku_info = COALESCE(?, requires_sku_info),
           requires_price_diff = COALESCE(?, requires_price_diff),
           display_order = COALESCE(?, display_order),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [label, category, requires_competitor_info, requires_sku_info, requires_price_diff, display_order, is_active, id]
    );

    const [updated]: any = await pool.query('SELECT * FROM retail_reason_taxonomies WHERE id = ?', [id]);
    res.json({ success: true, message: 'Taxonomy updated successfully', data: updated[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to update taxonomy', error: error.message });
  }
};

export const deleteTaxonomy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE retail_reason_taxonomies SET is_active = FALSE WHERE id = ?', [id]);
    res.json({ success: true, message: 'Reason taxonomy deactivated' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to delete taxonomy', error: error.message });
  }
};

// ==============================================================================
// 4. PRODUCT MASTER CONTROLLER
// ==============================================================================

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { brand_id, category_id, search, include_inactive, limit = '100', offset = '0' } = req.query;
    let query = `
      SELECT p.*, b.logo_url as brand_logo, c.icon as category_icon
      FROM retail_product_master p
      JOIN retail_brand_master b ON p.brand_id = b.id
      JOIN retail_category_master c ON p.category_id = c.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (!include_inactive || include_inactive !== 'true') {
      conditions.push('p.is_active = TRUE');
    }
    if (brand_id) {
      conditions.push('p.brand_id = ?');
      params.push(brand_id);
    }
    if (category_id) {
      conditions.push('p.category_id = ?');
      params.push(category_id);
    }
    if (search) {
      conditions.push('(p.model_name LIKE ? OR p.brand_name LIKE ? OR p.default_variant LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY p.brand_name ASC, p.model_name ASC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch products', error: error.message });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(
      `SELECT p.*, b.name as brand_name, b.logo_url as brand_logo, c.name as category_name, c.icon as category_icon
       FROM retail_product_master p
       JOIN retail_brand_master b ON p.brand_id = b.id
       JOIN retail_category_master c ON p.category_id = c.id
       WHERE p.id = ?`,
      [id]
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch product', error: error.message });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { brand_id, category_id, model_name, default_variant, msrp } = req.body;
    if (!brand_id || !category_id || !model_name) {
      return res.status(400).json({ success: false, message: 'brand_id, category_id, and model_name are required' });
    }

    const [brandRows]: any = await pool.query('SELECT name FROM retail_brand_master WHERE id = ?', [brand_id]);
    if (!brandRows[0]) {
      return res.status(400).json({ success: false, message: 'Invalid brand_id' });
    }

    const [catRows]: any = await pool.query('SELECT name FROM retail_category_master WHERE id = ?', [category_id]);
    if (!catRows[0]) {
      return res.status(400).json({ success: false, message: 'Invalid category_id' });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO retail_product_master (id, brand_id, brand_name, category_id, category_name, model_name, default_variant, msrp, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [id, brand_id, brandRows[0].name, category_id, catRows[0].name, model_name.trim(), default_variant || null, msrp || 0.00]
    );

    const [created]: any = await pool.query('SELECT * FROM retail_product_master WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'Product created successfully', data: created[0] });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'This brand already has a model with this name' });
    }
    res.status(500).json({ success: false, message: 'Failed to create product', error: error.message });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { brand_id, category_id, model_name, default_variant, msrp, is_active } = req.body;

    const [existing]: any = await pool.query('SELECT * FROM retail_product_master WHERE id = ?', [id]);
    if (!existing[0]) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let brandName = existing[0].brand_name;
    if (brand_id && brand_id !== existing[0].brand_id) {
      const [brandRows]: any = await pool.query('SELECT name FROM retail_brand_master WHERE id = ?', [brand_id]);
      if (brandRows[0]) brandName = brandRows[0].name;
    }

    let categoryName = existing[0].category_name;
    if (category_id && category_id !== existing[0].category_id) {
      const [catRows]: any = await pool.query('SELECT name FROM retail_category_master WHERE id = ?', [category_id]);
      if (catRows[0]) categoryName = catRows[0].name;
    }

    await pool.query(
      `UPDATE retail_product_master
       SET brand_id = COALESCE(?, brand_id),
           brand_name = ?,
           category_id = COALESCE(?, category_id),
           category_name = ?,
           model_name = COALESCE(?, model_name),
           default_variant = COALESCE(?, default_variant),
           msrp = COALESCE(?, msrp),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [brand_id, brandName, category_id, categoryName, model_name, default_variant, msrp, is_active, id]
    );

    const [updated]: any = await pool.query('SELECT * FROM retail_product_master WHERE id = ?', [id]);
    res.json({ success: true, message: 'Product updated successfully', data: updated[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to update product', error: error.message });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Check if any loss record references it
    const [losses]: any = await pool.query('SELECT COUNT(*) as count FROM retail_lost_opportunities WHERE product_id = ?', [id]);
    if (losses[0]?.count > 0) {
      await pool.query('UPDATE retail_product_master SET is_active = FALSE WHERE id = ?', [id]);
      return res.json({ success: true, message: 'Product deactivated because it has associated lost-opportunity records' });
    }
    await pool.query('DELETE FROM retail_product_master WHERE id = ?', [id]);
    res.json({ success: true, message: 'Product deleted permanently' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to delete product', error: error.message });
  }
};

// ==============================================================================
// 5. SUPER ADMIN RESET / RE-SYNC CATALOG FROM JSON MASTER
// ==============================================================================

export const resetMasterCatalog = async (req: Request, res: Response) => {
  try {
    console.log('[Catalog Controller] Super Admin requested master seed reset/sync...');
    await seedFootfallData({ skipSample: true });
    res.json({ success: true, message: 'Master brands, categories, taxonomies, and products re-synced successfully from JSON definitions' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to reset master catalog', error: error.message });
  }
};

// ==============================================================================
// 6. ADD-ON & WARRANTY SERVICES MASTER CRUD
// ==============================================================================

export const getAddons = async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.include_inactive === 'true';
    const categoryFocus = req.query.category_focus as string;

    let query = 'SELECT * FROM retail_addon_services';
    const params: any[] = [];
    const conditions: string[] = [];

    if (!includeInactive) {
      conditions.push('is_active = TRUE');
    }

    if (categoryFocus && categoryFocus !== 'ALL') {
      conditions.push('(category_focus = ? OR category_focus = "ALL")');
      params.push(categoryFocus);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY display_order ASC, name ASC';

    const [rows]: any = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch add-on plans', error: error.message });
  }
};

export const getAddonById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query('SELECT * FROM retail_addon_services WHERE id = ?', [id]);
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: 'Add-on plan not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to fetch add-on plan', error: error.message });
  }
};

export const createAddon = async (req: Request, res: Response) => {
  try {
    const { code, name, category_focus, description, price, display_order, is_active } = req.body;

    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Code and Name are required' });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO retail_addon_services (id, code, name, category_focus, description, price, is_active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        code.trim().toUpperCase(),
        name.trim(),
        category_focus || 'ALL',
        description || null,
        price !== undefined ? parseFloat(price) : 0.00,
        is_active !== undefined ? Boolean(is_active) : true,
        display_order !== undefined ? parseInt(display_order, 10) : 0
      ]
    );

    const [created]: any = await pool.query('SELECT * FROM retail_addon_services WHERE id = ?', [id]);
    res.status(201).json({ success: true, message: 'Add-on plan created successfully', data: created[0] });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'An add-on plan with this code already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to create add-on plan', error: error.message });
  }
};

export const updateAddon = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { code, name, category_focus, description, price, is_active, display_order } = req.body;

    const [existing]: any = await pool.query('SELECT * FROM retail_addon_services WHERE id = ?', [id]);
    if (!existing[0]) {
      return res.status(404).json({ success: false, message: 'Add-on plan not found' });
    }

    await pool.query(
      `UPDATE retail_addon_services
       SET code = COALESCE(?, code),
           name = COALESCE(?, name),
           category_focus = COALESCE(?, category_focus),
           description = COALESCE(?, description),
           price = COALESCE(?, price),
           is_active = COALESCE(?, is_active),
           display_order = COALESCE(?, display_order)
       WHERE id = ?`,
      [
        code ? code.trim().toUpperCase() : null,
        name ? name.trim() : null,
        category_focus !== undefined ? category_focus : null,
        description !== undefined ? description : null,
        price !== undefined ? parseFloat(price) : null,
        is_active !== undefined ? Boolean(is_active) : null,
        display_order !== undefined ? parseInt(display_order, 10) : null,
        id
      ]
    );

    const [updated]: any = await pool.query('SELECT * FROM retail_addon_services WHERE id = ?', [id]);
    res.json({ success: true, message: 'Add-on plan updated successfully', data: updated[0] });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'An add-on plan with this code already exists' });
    }
    res.status(500).json({ success: false, message: 'Failed to update add-on plan', error: error.message });
  }
};

export const toggleAddonStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('UPDATE retail_addon_services SET is_active = NOT is_active WHERE id = ?', [id]);
    const [updated]: any = await pool.query('SELECT * FROM retail_addon_services WHERE id = ?', [id]);
    if (!updated[0]) {
      return res.status(404).json({ success: false, message: 'Add-on plan not found' });
    }
    res.json({ success: true, message: 'Status toggled successfully', data: updated[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to toggle status', error: error.message });
  }
};

export const deleteAddon = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM retail_addon_services WHERE id = ?', [id]);
    res.json({ success: true, message: 'Add-on plan deleted permanently' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Failed to delete add-on plan', error: error.message });
  }
};

