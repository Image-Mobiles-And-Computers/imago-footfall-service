import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../config/db';

export async function runMigrations(): Promise<void> {
  const connection = await pool.getConnection();

  try {
    console.log('[Footfall Migration] Checking migration status...');

    // 1. Create schema_migrations tracking table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`migration_name\` VARCHAR(255) NOT NULL UNIQUE,
        \`applied_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Fetch already executed migrations
    const [rows] = await connection.query('SELECT migration_name FROM `schema_migrations`');
    const applied = new Set((rows as any[]).map(r => r.migration_name));

    // 3. Read migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('[Footfall Migration] No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (!applied.has(file)) {
        console.log(`[Footfall Migration] Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        await connection.beginTransaction();
        try {
          // Strip comments and split by semicolon at line end
          const cleanedSql = sql.replace(/--.*$/gm, '');
          const statements = cleanedSql
            .split(/;\s*$/m)
            .map(s => s.trim())
            .filter(s => s.length > 0);

          for (const stmt of statements) {
            await connection.query(stmt);
          }

          await connection.query(
            'INSERT INTO `schema_migrations` (migration_name) VALUES (?)',
            [file]
          );

          await connection.commit();
          console.log(`[Footfall Migration] ✅ Successfully applied: ${file}`);
          count++;
        } catch (err) {
          await connection.rollback();
          console.error(`[Footfall Migration] ❌ Failed to apply ${file}:`, err);
          throw err;
        }
      }
    }

    if (count === 0) {
      console.log('[Footfall Migration] All migrations are already up to date.');
    } else {
      console.log(`[Footfall Migration] Successfully applied ${count} new migration(s).`);
    }
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('[Footfall Migration] Database migration complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Footfall Migration] Migration failed:', err);
      process.exit(1);
    });
}
