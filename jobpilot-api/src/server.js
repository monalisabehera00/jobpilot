import 'dotenv/config'; // must be the first import so env vars load before anything else
import app from './app.js';
import { pool } from './config/db.js';
import { startReminderJob } from './services/reminder.service.js';

const PORT = process.env.PORT || 5000;

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is missing or shorter than 32 characters. Set it in .env');
  process.exit(1);
}

// AI matching is optional: the rest of the API works without it, so warn instead of exiting
const llmProvider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
if (!['anthropic', 'mock'].includes(llmProvider)) {
  console.warn(`LLM_PROVIDER "${llmProvider}" is not supported; use "anthropic" or "mock".`);
} else if (llmProvider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
  console.warn('ANTHROPIC_API_KEY is not set; AI match analysis will return 503. Set it, or use LLM_PROVIDER=mock.');
}

try {
  await pool.query('SELECT 1');
  console.log('Connected to MySQL');
} catch (err) {
  console.error('Could not connect to MySQL:', err.message);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`JobPilot API running on http://localhost:${PORT}`);
  console.log(`API docs at http://localhost:${PORT}/api/docs`);
});

// Started here rather than in app.js so tests can import the app without a background job
startReminderJob();
