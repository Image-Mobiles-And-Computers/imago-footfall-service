import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection, pool } from './config/db';
import { authenticateJwt, requirePermission, AuthRequest } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4006;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Health Check probes
app.get('/health', async (req: Request, res: Response) => {
  try {
    const [rows]: any = await pool.query('SELECT 1 as healthy');
    res.json({
      status: 'UP',
      service: 'imago-footfall-service',
      port: PORT,
      database: 'imago_footfall_db',
      dbConnected: Boolean(rows[0]?.healthy),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'DOWN',
      service: 'imago-footfall-service',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Master Brand Endpoints
app.get('/api/footfall/brands', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM retail_brand_master WHERE is_active = TRUE ORDER BY display_order ASC, name ASC');
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Master Category Endpoints
app.get('/api/footfall/categories', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM retail_category_master WHERE is_active = TRUE ORDER BY display_order ASC, name ASC');
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Master Reason Taxonomy Endpoints
app.get('/api/footfall/taxonomies', async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query('SELECT * FROM retail_reason_taxonomies WHERE is_active = TRUE ORDER BY category ASC, display_order ASC');
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Master Product Search & Catalog Endpoints
app.get('/api/footfall/products', async (req: Request, res: Response) => {
  try {
    const { brand_id, category_id, search } = req.query;
    let query = 'SELECT * FROM retail_product_master WHERE is_active = TRUE';
    const params: any[] = [];

    if (brand_id) {
      query += ' AND brand_id = ?';
      params.push(brand_id);
    }
    if (category_id) {
      query += ' AND category_id = ?';
      params.push(category_id);
    }
    if (search) {
      query += ' AND (model_name LIKE ? OR brand_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY brand_name ASC, model_name ASC';
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🛍️  IMAGO Footfall & Conversion Service Active on Port ${PORT}`);
  console.log(`📡 Database: imago_footfall_db`);
  console.log(`=======================================================`);
  await testConnection();
});

export default app;
