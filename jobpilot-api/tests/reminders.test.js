import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { setEmailTransport } from '../src/services/email.service.js';
import { sendDueReminders, todayIn } from '../src/services/reminder.service.js';

const api = request(app);
const TODAY = '2026-10-04';
let tokenA;
let tokenB;
let sent;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function registerUser(email, name) {
  const res = await api.post('/api/auth/register').send({ name, email, password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token;
}

async function createApplication(token, fields) {
  const res = await api
    .post('/api/applications')
    .set(auth(token))
    .send({ companyName: 'Acme', jobTitle: 'Engineer', ...fields });
  expect(res.status).toBe(201);
  return res.body;
}

const emailTo = (address) => sent.filter((m) => m.to === address);

beforeAll(async () => {
  tokenA = await registerUser('remind-a@example.com', 'Alice');
  tokenB = await registerUser('remind-b@example.com', 'Bob');
});

beforeEach(async () => {
  await pool.query('DELETE FROM job_applications');
  sent = [];
  setEmailTransport({ sendMail: async (mail) => sent.push(mail) });
});

afterAll(async () => {
  setEmailTransport(null);
  await pool.end();
});

describe('sendDueReminders', () => {
  it('emails each user only their own due, open applications', async () => {
    await createApplication(tokenA, { companyName: 'Globex', nextFollowUpOn: TODAY });
    await createApplication(tokenA, { companyName: 'Initech', nextFollowUpOn: '2026-10-01' });
    await createApplication(tokenA, { companyName: 'Future Co', nextFollowUpOn: '2026-10-05' });
    await createApplication(tokenA, { companyName: 'Offer Co', nextFollowUpOn: TODAY, status: 'Offer' });
    await createApplication(tokenA, { companyName: 'Rejected Co', nextFollowUpOn: TODAY, status: 'Rejected' });
    await createApplication(tokenA, { companyName: 'No Date Co' });
    await createApplication(tokenB, { companyName: 'Umbrella', nextFollowUpOn: TODAY });

    const summary = await sendDueReminders({ today: TODAY });

    expect(summary).toEqual({ usersEmailed: 2, applicationsReminded: 3, failures: 0 });

    const [alice] = emailTo('remind-a@example.com');
    expect(alice.subject).toBe('JobPilot: follow up on 2 job applications');
    expect(alice.text).toContain('Engineer at Globex (Wishlist, follow-up is due today)');
    expect(alice.text).toContain('Engineer at Initech (Wishlist, follow-up was due 2026-10-01)');
    expect(alice.text).not.toMatch(/Future Co|Offer Co|Rejected Co|No Date Co|Umbrella/);

    const [bob] = emailTo('remind-b@example.com');
    expect(bob.subject).toBe('JobPilot: follow up on 1 job application');
    expect(bob.text).toContain('Umbrella');
    expect(bob.text).not.toMatch(/Globex|Initech/);
  });

  it('reminds once per follow-up date, and again when a new date is set', async () => {
    const application = await createApplication(tokenA, { nextFollowUpOn: TODAY });

    await sendDueReminders({ today: TODAY });
    expect(sent).toHaveLength(1);

    await sendDueReminders({ today: TODAY });
    expect(sent).toHaveLength(1);

    await api.put(`/api/applications/${application.id}`).set(auth(tokenA)).send({ nextFollowUpOn: '2026-10-06' });
    await sendDueReminders({ today: '2026-10-06' });
    expect(sent).toHaveLength(2);
  });

  it('does not change updated_at when marking reminders as sent', async () => {
    const application = await createApplication(tokenA, { nextFollowUpOn: TODAY });
    await pool.execute('UPDATE job_applications SET updated_at = ? WHERE id = ?', [
      '2026-01-01 00:00:00',
      application.id,
    ]);

    await sendDueReminders({ today: TODAY });

    const [[row]] = await pool.execute(
      'SELECT updated_at, reminder_sent_for FROM job_applications WHERE id = ?',
      [application.id]
    );
    expect(row).toEqual({ updated_at: '2026-01-01 00:00:00', reminder_sent_for: TODAY });
  });

  it('retries a user on the next run when their email fails', async () => {
    await createApplication(tokenA, { nextFollowUpOn: TODAY });
    await createApplication(tokenB, { nextFollowUpOn: TODAY });

    setEmailTransport({
      sendMail: async (mail) => {
        if (mail.to === 'remind-a@example.com') throw new Error('SMTP down');
        sent.push(mail);
      },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const first = await sendDueReminders({ today: TODAY });
    errorSpy.mockRestore();

    expect(first).toEqual({ usersEmailed: 1, applicationsReminded: 1, failures: 1 });

    setEmailTransport({ sendMail: async (mail) => sent.push(mail) });
    const second = await sendDueReminders({ today: TODAY });

    expect(second).toEqual({ usersEmailed: 1, applicationsReminded: 1, failures: 0 });
    expect(sent.map((m) => m.to)).toEqual(['remind-b@example.com', 'remind-a@example.com']);
  });

  it('escapes user-entered text in the HTML email', async () => {
    await createApplication(tokenA, { companyName: '<script>alert(1)</script>', nextFollowUpOn: TODAY });

    await sendDueReminders({ today: TODAY });

    const [mail] = sent;
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('sends nothing when nothing is due', async () => {
    await createApplication(tokenA, { nextFollowUpOn: '2026-12-01' });
    expect(await sendDueReminders({ today: TODAY })).toEqual({
      usersEmailed: 0,
      applicationsReminded: 0,
      failures: 0,
    });
    expect(sent).toHaveLength(0);
  });
});

describe('todayIn', () => {
  it('formats the date as YYYY-MM-DD in a time zone', () => {
    expect(todayIn('Asia/Kolkata')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects an unknown time zone', () => {
    expect(() => todayIn('Mars/Olympus')).toThrow(RangeError);
  });
});
