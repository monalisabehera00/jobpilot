import 'dotenv/config';
import { pool } from '../src/config/db.js';
import { sendDueReminders } from '../src/services/reminder.service.js';

// Runs the follow-up reminder job once, right now (handy for testing email settings)
try {
  console.log('Reminder run finished:', await sendDueReminders());
} catch (err) {
  console.error('Reminder run failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
