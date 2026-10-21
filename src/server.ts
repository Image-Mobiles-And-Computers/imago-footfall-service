import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection, pool } from './config/db';
import catalogRoutes from './modules/catalog/catalog.routes';
import walkinRoutes from './modules/walkin/walkin.routes';
import webhookRoutes from './modules/webhook/pos-webhook.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';

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

// Domain Routes
app.use('/api/footfall', catalogRoutes);
app.use('/api/footfall', walkinRoutes);
app.use('/api/footfall', webhookRoutes);
app.use('/api/footfall', analyticsRoutes);

const server = app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🛍️  IMAGO Footfall & Conversion Service Active on Port ${PORT}`);
  console.log(`📡 Database: imago_footfall_db`);
  console.log(`=======================================================`);
  await testConnection();
});

export default app;
