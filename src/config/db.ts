import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'IMAGE@Local!2026',
  database: process.env.DB_NAME || 'imago_footfall_db',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '20', 10),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

export async function testConnection(): Promise<void> {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.query('SELECT VERSION() as version');
    const version = (rows as any[])[0]?.version;
    console.log(`[Footfall DB] Connected to MySQL successfully. Server Version: ${version}`);
    connection.release();
  } catch (error) {
    console.error('[Footfall DB] Error connecting to MySQL:', error);
    process.exit(1);
  }
}
