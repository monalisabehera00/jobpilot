import { jest } from '@jest/globals';
import { pool } from '../src/config/db.js';
import { sendEmail, setEmailTransport } from '../src/services/email.service.js';
import { startReminderJob } from '../src/services/reminder.service.js';

const mail = { to: 'someone@example.com', subject: 'Hello', text: 'Body text', html: '<p>Body text</p>' };
const savedEnv = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnv };
  setEmailTransport(null);
  jest.restoreAllMocks();
});

afterAll(async () => {
  await pool.end();
});

describe('sendEmail', () => {
  it('"log" mode builds the email with Nodemailer and prints it', async () => {
    process.env.MAIL_TRANSPORT = 'log';
    process.env.MAIL_FROM = 'JobPilot <test@jobpilot.local>';
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    const info = await sendEmail(mail);

    expect(JSON.parse(info.message)).toMatchObject({ subject: 'Hello', text: 'Body text' });
    expect(log.mock.calls.join('\n')).toContain('Subject: Hello');
  });

  it('"smtp" mode requires SMTP_HOST', async () => {
    process.env.MAIL_TRANSPORT = 'smtp';
    delete process.env.SMTP_HOST;
    await expect(sendEmail(mail)).rejects.toThrow('SMTP_HOST');
  });

  it('rejects an unknown transport', async () => {
    process.env.MAIL_TRANSPORT = 'pigeon';
    await expect(sendEmail(mail)).rejects.toThrow('not supported');
  });
});

describe('startReminderJob', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('does nothing when disabled', () => {
    process.env.REMINDERS_ENABLED = 'false';
    expect(startReminderJob()).toBeNull();
  });

  it('refuses an invalid cron expression', () => {
    process.env.REMINDER_CRON = 'every morning';
    expect(startReminderJob()).toBeNull();
  });

  it('refuses an invalid time zone', () => {
    process.env.REMINDER_TIMEZONE = 'Mars/Olympus';
    expect(startReminderJob()).toBeNull();
  });

  it('schedules the job with valid settings', async () => {
    process.env.REMINDER_CRON = '0 8 * * *';
    process.env.REMINDER_TIMEZONE = 'Asia/Kolkata';

    const task = startReminderJob();

    expect(task).not.toBeNull();
    await task.destroy();
  });
});
