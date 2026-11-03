import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection, pool } from './config/db';
import catalogRoutes from './modules/catalog/catalog.routes';
import walkinRoutes from './modules/walkin/walkin.routes';
import webhookRoutes from './modules/webhook/pos-webhook.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import greetingRoutes from './modules/greeting/greeting.routes';
import kioskRoutes from './modules/kiosk/kiosk.routes';
import salesRoutes from './modules/sales-command/sales.routes';

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
app.use('/api/footfall', greetingRoutes);
app.use('/api/footfall', kioskRoutes);
app.use('/api', kioskRoutes);

// Head Office Commercial Sales Command (Domain 9)
app.use('/api/footfall/sales', salesRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/ho/sales', salesRoutes);


const server = app.listen(PORT, async () => {
  console.log(`=======================================================`);
  console.log(`🛍️  IMAGO Footfall & Conversion Service Active on Port ${PORT}`);
  console.log(`📡 Database: imago_footfall_db`);
  console.log(`=======================================================`);
  await testConnection();
});

export default app;
