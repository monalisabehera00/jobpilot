import cron from 'node-cron';
import { pool } from '../config/db.js';
import { sendEmail } from './email.service.js';

const DEFAULT_SCHEDULE = '0 8 * * *'; // every day at 08:00
const MAX_PER_RUN = 1000;

// "YYYY-MM-DD" for today in the given IANA time zone (or the server's own zone)
export function todayIn(timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function buildEmail(user, applications, today) {
  const boardUrl = `${process.env.CLIENT_URL || 'http://localhost:4200'}/board`;
  const describe = (a) => {
    const when = a.next_follow_up_on < today ? `was due ${a.next_follow_up_on}` : 'is due today';
    return { title: `${a.job_title} at ${a.company_name}`, detail: `${a.status}, follow-up ${when}` };
  };
  const items = applications.map(describe);
  const count = applications.length;

  return {
    to: user.email,
    subject: `JobPilot: follow up on ${count} job application${count === 1 ? '' : 's'}`,
    text: [
      `Hi ${user.name},`,
      '',
      `It's time to follow up on ${count === 1 ? 'this application' : 'these applications'}:`,
      ...items.map((i) => `- ${i.title} (${i.detail})`),
      '',
      `Open your board: ${boardUrl}`,
    ].join('\n'),
    html: `<p>Hi ${escapeHtml(user.name)},</p>
<p>It's time to follow up on ${count === 1 ? 'this application' : 'these applications'}:</p>
<ul>${items.map((i) => `<li><strong>${escapeHtml(i.title)}</strong> (${escapeHtml(i.detail)})</li>`).join('')}</ul>
<p><a href="${escapeHtml(boardUrl)}">Open your JobPilot board</a></p>`,
  };
}

// Emails each user one summary of their open applications whose follow-up date has arrived.
// An application is reminded once per follow-up date: setting a new date re-arms it.
export async function sendDueReminders({ today = todayIn(process.env.REMINDER_TIMEZONE) } = {}) {
  const [rows] = await pool.execute(
    `SELECT ja.id, ja.user_id, ja.company_name, ja.job_title, ja.status, ja.next_follow_up_on,
            u.name AS user_name, u.email AS user_email
     FROM job_applications ja
     JOIN users u ON u.id = ja.user_id
     WHERE ja.next_follow_up_on <= ?
       AND ja.status NOT IN ('Offer', 'Rejected')
       AND (ja.reminder_sent_for IS NULL OR ja.reminder_sent_for <> ja.next_follow_up_on)
     ORDER BY ja.user_id, ja.next_follow_up_on, ja.id
     LIMIT ${MAX_PER_RUN}`,
    [today]
  );

  const byUser = new Map();
  for (const row of rows) {
    if (!byUser.has(row.user_id)) {
      byUser.set(row.user_id, { user: { name: row.user_name, email: row.user_email }, applications: [] });
    }
    byUser.get(row.user_id).applications.push(row);
  }

  const summary = { usersEmailed: 0, applicationsReminded: 0, failures: 0 };
  for (const [userId, { user, applications }] of byUser) {
    try {
      await sendEmail(buildEmail(user, applications, today));
    } catch (err) {
      // Left unmarked, so the next run tries this user again
      summary.failures++;
      console.error(`Reminder email to user ${userId} failed:`, err.message);
      continue;
    }

    for (const app of applications) {
      // Only marks the date that was emailed; "updated_at = updated_at" keeps the board order unchanged
      await pool.execute(
        `UPDATE job_applications SET reminder_sent_for = ?, updated_at = updated_at
         WHERE id = ? AND user_id = ? AND next_follow_up_on = ?`,
        [app.next_follow_up_on, app.id, userId, app.next_follow_up_on]
      );
    }
    summary.usersEmailed++;
    summary.applicationsReminded += applications.length;
  }
  return summary;
}

export function startReminderJob() {
  if (process.env.REMINDERS_ENABLED === 'false') {
    console.log('Follow-up reminders are disabled (REMINDERS_ENABLED=false).');
    return null;
  }

  const schedule = process.env.REMINDER_CRON || DEFAULT_SCHEDULE;
  const timezone = process.env.REMINDER_TIMEZONE || undefined;
  if (!cron.validate(schedule)) {
    console.error(`REMINDER_CRON "${schedule}" is not a valid cron expression; reminders are off.`);
    return null;
  }
  try {
    todayIn(timezone);
  } catch {
    console.error(`REMINDER_TIMEZONE "${timezone}" is not a valid time zone; reminders are off.`);
    return null;
  }

  const task = cron.schedule(
    schedule,
    async () => {
      try {
        const result = await sendDueReminders();
        console.log('Follow-up reminders sent:', result);
      } catch (err) {
        console.error('Follow-up reminder job failed:', err);
      }
    },
    { timezone, noOverlap: true }
  );
  console.log(`Follow-up reminders scheduled: "${schedule}"${timezone ? ` (${timezone})` : ''}`);
  return task;
}
