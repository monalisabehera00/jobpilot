import 'dotenv/config';
import { pool } from '../src/config/db.js';

// Brings a database created from an older db/schema.sql up to date. Safe to run repeatedly.
const migrations = [
  {
    name: 'job_applications.reminder_sent_for',
    table: 'job_applications',
    column: 'reminder_sent_for',
    sql: 'ALTER TABLE job_applications ADD COLUMN reminder_sent_for DATE NULL AFTER next_follow_up_on',
  },
];

try {
  for (const m of migrations) {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [m.table, m.column]
    );
    if (rows.length) {
      console.log(`✓ ${m.name} already exists`);
    } else {
      await pool.query(m.sql);
      console.log(`+ added ${m.name}`);
    }
  }
  console.log(`Database "${process.env.DB_NAME}" is up to date.`);
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
