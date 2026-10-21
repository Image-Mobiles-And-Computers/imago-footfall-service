import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../../config/db';
import { v4 as uuidv4 } from 'uuid';

export interface SeedOptions {
  fresh?: boolean;
  brandsOnly?: boolean;
  categoriesOnly?: boolean;
  taxonomiesOnly?: boolean;
  productsOnly?: boolean;
  sampleDataOnly?: boolean;
  skipSample?: boolean;
}

export async function seedBrands(connection: any): Promise<number> {
  const filePath = path.join(__dirname, 'data', 'brands.json');
  if (!fs.existsSync(filePath)) {
    console.warn('[Footfall Seeder] brands.json not found.');
    return 0;
  }
  const brands = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  for (const b of brands) {
    await connection.query(
      `INSERT INTO retail_brand_master (id, code, name, tier, category_focus, logo_url, display_order, is_active)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE 
         name = VALUES(name),
         tier = VALUES(tier),
         category_focus = VALUES(category_focus),
         logo_url = VALUES(logo_url),
         display_order = VALUES(display_order)`,
      [b.code, b.name, b.tier || 'PREMIUM', b.category_focus || null, b.logo_url || null, b.display_order || 0]
    );
  }
  console.log(`[Footfall Seeder] ✅ Seeded/Updated ${brands.length} brands in retail_brand_master.`);
  return brands.length;
}

export async function seedCategories(connection: any): Promise<number> {
  const filePath = path.join(__dirname, 'data', 'categories.json');
  if (!fs.existsSync(filePath)) {
    console.warn('[Footfall Seeder] categories.json not found.');
    return 0;
  }
  const categories = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  for (const c of categories) {
    await connection.query(
      `INSERT INTO retail_category_master (id, code, name, icon, display_order, is_active)
       VALUES (UUID(), ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE 
         name = VALUES(name),
         icon = VALUES(icon),
         display_order = VALUES(display_order)`,
      [c.code, c.name, c.icon || null, c.display_order || 0]
    );
  }
  console.log(`[Footfall Seeder] ✅ Seeded/Updated ${categories.length} categories in retail_category_master.`);
  return categories.length;
}

export async function seedTaxonomies(connection: any): Promise<number> {
  const filePath = path.join(__dirname, 'data', 'taxonomies.json');
  if (!fs.existsSync(filePath)) {
    console.warn('[Footfall Seeder] taxonomies.json not found.');
    return 0;
  }
  const taxonomies = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  for (const t of taxonomies) {
    await connection.query(
      `INSERT INTO retail_reason_taxonomies (id, category, code, label, requires_competitor_info, requires_sku_info, requires_price_diff, display_order, is_active)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE 
         label = VALUES(label),
         category = VALUES(category),
         requires_competitor_info = VALUES(requires_competitor_info),
         requires_sku_info = VALUES(requires_sku_info),
         requires_price_diff = VALUES(requires_price_diff),
         display_order = VALUES(display_order)`,
      [t.category, t.code, t.label, Boolean(t.requires_competitor_info), Boolean(t.requires_sku_info), Boolean(t.requires_price_diff), t.display_order || 0]
    );
  }
  console.log(`[Footfall Seeder] ✅ Seeded/Updated ${taxonomies.length} reason taxonomies in retail_reason_taxonomies.`);
  return taxonomies.length;
}

export async function seedProducts(connection: any): Promise<number> {
  const filePath = path.join(__dirname, 'data', 'products.json');
  if (!fs.existsSync(filePath)) {
    console.warn('[Footfall Seeder] products.json not found.');
    return 0;
  }
  const products = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  // Pre-load brand and category maps for fast lookup
  const [brands]: any = await connection.query('SELECT id, code, name FROM retail_brand_master');
  const [categories]: any = await connection.query('SELECT id, code, name FROM retail_category_master');

  const brandMap = new Map<string, { id: string; name: string }>();
  for (const b of brands) {
    brandMap.set(b.code, { id: b.id, name: b.name });
  }

  const categoryMap = new Map<string, { id: string; name: string }>();
  for (const c of categories) {
    categoryMap.set(c.code, { id: c.id, name: c.name });
  }

  let count = 0;
  for (const p of products) {
    const brand = brandMap.get(p.brand_code);
    const category = categoryMap.get(p.category_code);

    if (!brand) {
      console.warn(`[Footfall Seeder] Skipping product "${p.model_name}": unknown brand_code "${p.brand_code}"`);
      continue;
    }
    if (!category) {
      console.warn(`[Footfall Seeder] Skipping product "${p.model_name}": unknown category_code "${p.category_code}"`);
      continue;
    }

    await connection.query(
      `INSERT INTO retail_product_master (id, brand_id, brand_name, category_id, category_name, model_name, default_variant, msrp, is_active)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, TRUE)
       ON DUPLICATE KEY UPDATE
         brand_name = VALUES(brand_name),
         category_id = VALUES(category_id),
         category_name = VALUES(category_name),
         default_variant = VALUES(default_variant),
         msrp = VALUES(msrp),
         is_active = TRUE`,
      [brand.id, brand.name, category.id, category.name, p.model_name, p.default_variant || null, p.msrp || 0.00]
    );
    count++;
  }

  console.log(`[Footfall Seeder] ✅ Seeded/Updated ${count} master catalog products in retail_product_master.`);
  return count;
}

export async function seedSampleSessions(connection: any): Promise<number> {
  const [branches]: any = await connection.query(`SELECT id, name, code FROM imago_org_db.branches LIMIT 4`);
  const indiranagarBranch = branches.find((b: any) => b.name?.includes('Indiranagar')) || branches[0];
  const koramangalaBranch = branches.find((b: any) => b.name?.includes('Koramangala')) || branches[1] || branches[0];

  if (!indiranagarBranch) {
    console.warn('[Footfall Seeder] No branch found in imago_org_db. Skipping sample sessions.');
    return 0;
  }

  const [staffUsers]: any = await connection.query(
    `SELECT id, full_name, employee_code, email FROM imago_iam_db.users WHERE is_active = TRUE LIMIT 10`
  );

  const defaultStaff = staffUsers[0] || { id: uuidv4(), full_name: 'Rajesh Sharma', employee_code: 'EMP-001' };
  const secondStaff = staffUsers[1] || { id: uuidv4(), full_name: 'Priya Sundaram', employee_code: 'EMP-002' };

  const today = new Date().toISOString().slice(0, 10);
  console.log(`[Footfall Seeder] Generating realistic retail walk-ins, conversions, and lost opportunities for ${today}...`);

  // Fetch sample products for realistic loss and conversion references
  const [iphoneRows]: any = await connection.query(`SELECT id, brand_id, model_name, msrp FROM retail_product_master WHERE model_name LIKE '%iPhone 16 Pro 128GB%' LIMIT 1`);
  const [macbookRows]: any = await connection.query(`SELECT id, brand_id, model_name, msrp FROM retail_product_master WHERE model_name LIKE '%MacBook Air 13"%' LIMIT 1`);
  const [s24UltraRows]: any = await connection.query(`SELECT id, brand_id, model_name, msrp FROM retail_product_master WHERE model_name LIKE '%Galaxy S24 Ultra%' LIMIT 1`);
  const [watchRows]: any = await connection.query(`SELECT id, brand_id, model_name, msrp FROM retail_product_master WHERE model_name LIKE '%Watch Series 10%' LIMIT 1`);

  const [stockTaxRows]: any = await connection.query(`SELECT id FROM retail_reason_taxonomies WHERE code = 'STOCK_MODEL_UNAVAILABLE' LIMIT 1`);
  const [priceTaxRows]: any = await connection.query(`SELECT id FROM retail_reason_taxonomies WHERE code = 'PRICE_ONLINE_COMPETITOR' LIMIT 1`);
  const [intentTaxRows]: any = await connection.query(`SELECT id FROM retail_reason_taxonomies WHERE code = 'INTENT_WINDOW_SHOPPING' LIMIT 1`);

  const sampleWalkins = [
    // Converted 1
    {
      id: uuidv4(),
      branch_id: indiranagarBranch.id,
      session_number: `WIN-${today.replace(/-/g, '')}-IND-001`,
      customer_phone: '9845012345',
      customer_name: 'Arjun Venkatesh',
      customer_type: 'RETURNING',
      category: 'Smartphones',
      staff_id: defaultStaff.id,
      staff_name: defaultStaff.full_name,
      status: 'CONVERTED',
      dwell: 1680,
      entered_offset: 120,
      conversion: {
        inv: `INV-${today.replace(/-/g, '')}-0082`,
        amt: 119900.00,
        method: 'CREDIT_CARD',
        skus: [{ name: iphoneRows[0]?.model_name || 'iPhone 16 Pro 128GB', qty: 1, price: 119900 }]
      }
    },
    // Converted 2
    {
      id: uuidv4(),
      branch_id: indiranagarBranch.id,
      session_number: `WIN-${today.replace(/-/g, '')}-IND-002`,
      customer_phone: '9880198765',
      customer_name: 'Meera Nambiar',
      customer_type: 'NEW',
      category: 'Laptops & Computing',
      staff_id: secondStaff.id,
      staff_name: secondStaff.full_name,
      status: 'CONVERTED',
      dwell: 2100,
      entered_offset: 95,
      conversion: {
        inv: `INV-${today.replace(/-/g, '')}-0083`,
        amt: 114900.00,
        method: 'UPI',
        skus: [{ name: macbookRows[0]?.model_name || 'MacBook Air 13" M3 256GB', qty: 1, price: 114900 }]
      }
    },
    // Lost 1: S24 Ultra stockout
    {
      id: uuidv4(),
      branch_id: indiranagarBranch.id,
      session_number: `WIN-${today.replace(/-/g, '')}-IND-003`,
      customer_phone: '9900554433',
      customer_name: 'Rohan Deshmukh',
      customer_type: 'NEW',
      category: 'Smartphones',
      staff_id: defaultStaff.id,
      staff_name: defaultStaff.full_name,
      status: 'LOST',
      dwell: 850,
      entered_offset: 55,
      loss: {
        tax_id: stockTaxRows[0]?.id,
        prod_id: s24UltraRows[0]?.id,
        brand_id: s24UltraRows[0]?.brand_id,
        sku: s24UltraRows[0]?.model_name || 'Samsung Galaxy S24 Ultra 256GB Titanium Gray',
        budget: 130000,
        quoted: 129999,
        notes: 'Customer specifically requested Titanium Gray for immediate gifting. Out of stock at Indiranagar.'
      }
    },
    // Lost 2: Competitor online price difference
    {
      id: uuidv4(),
      branch_id: indiranagarBranch.id,
      session_number: `WIN-${today.replace(/-/g, '')}-IND-004`,
      customer_phone: '9811223344',
      customer_name: 'Sneha Hegde',
      customer_type: 'NEW',
      category: 'Smartphones',
      staff_id: secondStaff.id,
      staff_name: secondStaff.full_name,
      status: 'LOST',
      dwell: 720,
      entered_offset: 40,
      loss: {
        tax_id: priceTaxRows[0]?.id,
        prod_id: iphoneRows[0]?.id,
        brand_id: iphoneRows[0]?.brand_id,
        sku: 'Apple iPhone 16 128GB Ultramarine Blue',
        budget: 75000,
        quoted: 79900,
        comp_name: 'Flipkart Big Billion Days',
        comp_price: 74999,
        notes: 'Bank card discount online was ₹4,900 cheaper. Store matching margin not approved.'
      }
    },
    // Lost 3: Just Browsing
    {
      id: uuidv4(),
      branch_id: indiranagarBranch.id,
      session_number: `WIN-${today.replace(/-/g, '')}-IND-005`,
      customer_phone: '9988776655',
      customer_name: 'Anil Kulkarni',
      customer_type: 'ANONYMOUS',
      category: 'Smartwatches & Wearables',
      staff_id: defaultStaff.id,
      staff_name: defaultStaff.full_name,
      status: 'LOST',
      dwell: 480,
      entered_offset: 30,
      loss: {
        tax_id: intentTaxRows[0]?.id,
        prod_id: watchRows[0]?.id,
        brand_id: watchRows[0]?.brand_id,
        sku: watchRows[0]?.model_name || 'Apple Watch Series 10 42mm GPS',
        notes: 'Customer tried on display model. Comparing sizes with current series.'
      }
    },
    // Active 1: Floor session engaged
    {
      id: uuidv4(),
      branch_id: indiranagarBranch.id,
      session_number: `WIN-${today.replace(/-/g, '')}-IND-006`,
      customer_phone: '9731998811',
      customer_name: 'Kavita Pillai',
      customer_type: 'NEW',
      category: 'Smartphones',
      staff_id: defaultStaff.id,
      staff_name: defaultStaff.full_name,
      status: 'ENGAGED',
      dwell: null,
      entered_offset: 14
    },
    // Active 2: Unassisted customer alert (> 6 minutes in ENTERED status without staff!)
    {
      id: uuidv4(),
      branch_id: indiranagarBranch.id,
      session_number: `WIN-${today.replace(/-/g, '')}-IND-007`,
      customer_phone: null,
      customer_name: 'Walk-In Guest (Indiranagar)',
      customer_type: 'ANONYMOUS',
      category: 'Laptops & Computing',
      staff_id: null,
      staff_name: null,
      status: 'ENTERED',
      dwell: null,
      entered_offset: 7
    }
  ];

  for (const s of sampleWalkins) {
    await connection.query(
      `INSERT INTO retail_walkin_sessions (
        id, branch_id, session_number, customer_phone, customer_name, customer_type,
        primary_category_name, assigned_employee_id, assigned_employee_name,
        status, entered_at, dwell_duration_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE), ?)
      ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [
        s.id,
        s.branch_id,
        s.session_number,
        s.customer_phone,
        s.customer_name,
        s.customer_type,
        s.category,
        s.staff_id,
        s.staff_name,
        s.status,
        s.entered_offset,
        s.dwell
      ]
    );

    if (s.conversion) {
      await connection.query(
        `INSERT INTO retail_conversions (
          id, session_id, branch_id, invoice_number, invoice_amount, payment_method,
          sales_employee_id, sales_employee_name, sold_skus, converted_at
        ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE))
        ON DUPLICATE KEY UPDATE invoice_amount = VALUES(invoice_amount)`,
        [
          s.id,
          s.branch_id,
          s.conversion.inv,
          s.conversion.amt,
          s.conversion.method,
          s.staff_id,
          s.staff_name,
          JSON.stringify(s.conversion.skus),
          s.entered_offset - Math.floor(s.dwell / 60)
        ]
      );
    }

    if (s.loss && s.loss.tax_id) {
      await connection.query(
        `INSERT INTO retail_lost_opportunities (
          id, session_id, branch_id, taxonomy_id, product_id, brand_id, requested_sku,
          customer_budget, quoted_price, competitor_name, competitor_price,
          notes, logged_by_employee_id, logged_by_employee_name, logged_at
        ) VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE))
        ON DUPLICATE KEY UPDATE requested_sku = VALUES(requested_sku)`,
        [
          s.id,
          s.branch_id,
          s.loss.tax_id,
          s.loss.prod_id || null,
          s.loss.brand_id || null,
          s.loss.sku || null,
          s.loss.budget || null,
          s.loss.quoted || null,
          s.loss.comp_name || null,
          s.loss.comp_price || null,
          s.loss.notes || null,
          s.staff_id || defaultStaff.id,
          s.staff_name || defaultStaff.full_name,
          s.entered_offset - Math.floor((s.dwell || 300) / 60)
        ]
      );
    }
  }

  console.log(`[Footfall Seeder] ✅ Seeded ${sampleWalkins.length} realistic walk-in sessions for today.`);
  return sampleWalkins.length;
}

export async function seedFootfallData(options: SeedOptions = {}): Promise<void> {
  const connection = await pool.getConnection();

  try {
    console.log(`[Footfall Seeder] Starting execution with options:`, options);
    await connection.beginTransaction();

    if (options.fresh) {
      console.log('[Footfall Seeder] ⚠️ Cleaning existing tables for fresh re-seed...');
      await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
      await connection.query('TRUNCATE TABLE retail_conversions;');
      await connection.query('TRUNCATE TABLE retail_lost_opportunities;');
      await connection.query('TRUNCATE TABLE retail_session_timeline;');
      await connection.query('TRUNCATE TABLE retail_walkin_sessions;');
      await connection.query('TRUNCATE TABLE retail_product_master;');
      await connection.query('TRUNCATE TABLE retail_reason_taxonomies;');
      await connection.query('TRUNCATE TABLE retail_category_master;');
      await connection.query('TRUNCATE TABLE retail_brand_master;');
      await connection.query('SET FOREIGN_KEY_CHECKS = 1;');
      console.log('[Footfall Seeder] Tables truncated cleanly.');
    }

    if (options.brandsOnly) {
      await seedBrands(connection);
    } else if (options.categoriesOnly) {
      await seedCategories(connection);
    } else if (options.taxonomiesOnly) {
      await seedTaxonomies(connection);
    } else if (options.productsOnly) {
      await seedBrands(connection);
      await seedCategories(connection);
      await seedProducts(connection);
    } else if (options.sampleDataOnly) {
      await seedSampleSessions(connection);
    } else {
      // Default: Seed all master catalogs and sample data
      await seedBrands(connection);
      await seedCategories(connection);
      await seedTaxonomies(connection);
      await seedProducts(connection);

      if (!options.skipSample) {
        await seedSampleSessions(connection);
      }
    }

    await connection.commit();
    console.log('[Footfall Seeder] ✅ All operations completed successfully.');
  } catch (error) {
    await connection.rollback();
    console.error('[Footfall Seeder] ❌ Seeding failed:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// CLI Argument Parser
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: SeedOptions = {};

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
IMAGO Footfall & Retail Conversion Seed Manager
Usage: npx tsx src/database/seeds/seed-footfall-taxonomies.ts [options]

Options:
  --fresh, --clean       Truncate all footfall tables and re-seed from scratch
  --brands-only          Seed or update only the Brand Master catalog (brands.json)
  --categories-only      Seed or update only the Category Master catalog (categories.json)
  --taxonomies-only      Seed or update only the Non-Conversion Reason Taxonomies (taxonomies.json)
  --products-only        Seed or update only the Master Products Catalog (products.json)
  --sample-data-only     Generate simulated floor sessions, conversions & walkouts for today
  --skip-sample          Seed all master catalogs but omit sample walk-in sessions
  --help, -h             Show this help screen
    `);
    process.exit(0);
  }

  if (args.includes('--fresh') || args.includes('--clean')) options.fresh = true;
  if (args.includes('--brands-only')) options.brandsOnly = true;
  if (args.includes('--categories-only')) options.categoriesOnly = true;
  if (args.includes('--taxonomies-only')) options.taxonomiesOnly = true;
  if (args.includes('--products-only')) options.productsOnly = true;
  if (args.includes('--sample-data-only')) options.sampleDataOnly = true;
  if (args.includes('--skip-sample')) options.skipSample = true;

  seedFootfallData(options)
    .then(() => {
      console.log('[Footfall Seeder] Execution finished cleanly.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Footfall Seeder] Execution terminated with error:', err);
      process.exit(1);
    });
}
