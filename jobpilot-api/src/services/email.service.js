import nodemailer from 'nodemailer';

// MAIL_TRANSPORT picks how email is delivered:
//   "log"  (default) prints each email to the console, so no mail server is needed locally
//   "smtp" sends through SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
let transport = null;

function mailMode() {
  return (process.env.MAIL_TRANSPORT || 'log').toLowerCase();
}

function createTransport() {
  const mode = mailMode();
  if (mode === 'log') return nodemailer.createTransport({ jsonTransport: true });

  if (mode === 'smtp') {
    if (!process.env.SMTP_HOST) throw new Error('MAIL_TRANSPORT=smtp requires SMTP_HOST.');
    const port = Number(process.env.SMTP_PORT || 587);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }

  throw new Error(`MAIL_TRANSPORT "${mode}" is not supported; use "log" or "smtp".`);
}

// Lets tests capture emails with a fake { sendMail } (pass null to go back to the environment setting)
export function setEmailTransport(next) {
  transport = next;
}

export async function sendEmail({ to, subject, text, html }) {
  transport ??= createTransport();
  const from = process.env.MAIL_FROM || 'JobPilot <no-reply@jobpilot.local>';
  const info = await transport.sendMail({ from, to, subject, text, html });

  if (mailMode() === 'log' && info?.message) {
    console.log(`[email] To: ${to}\n[email] Subject: ${subject}\n${text}\n`);
  }
  return info;
}
