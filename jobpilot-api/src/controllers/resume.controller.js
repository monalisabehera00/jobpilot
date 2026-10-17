import { pool } from '../config/db.js';
import { extractPdfText, isPdf, PdfExtractionError } from '../services/pdf.service.js';

const SUMMARY_FIELDS = `id, file_name, is_default, uploaded_at,
  CHAR_LENGTH(extracted_text) AS text_length, LEFT(extracted_text, 200) AS preview`;

function toResume(row) {
  const resume = {
    id: row.id,
    fileName: row.file_name,
    isDefault: Boolean(row.is_default),
    textLength: row.text_length,
    preview: row.preview,
    uploadedAt: row.uploaded_at,
  };
  if (row.extracted_text !== undefined) resume.extractedText = row.extracted_text;
  return resume;
}

async function findOwned(id, userId, { withText = false } = {}) {
  const [rows] = await pool.execute(
    `SELECT ${SUMMARY_FIELDS}${withText ? ', extracted_text' : ''}
     FROM resumes WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
  return rows[0] ? toResume(rows[0]) : null;
}

// Runs work in a transaction holding a lock on the user's row, so concurrent
// uploads/deletes/default changes can't leave a user with zero or two defaults
async function withUserLock(userId, work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Drop any client-side path and keep the name within the column size
function cleanFileName(originalName) {
  const name = originalName.split(/[\\/]/).pop().trim();
  return (name || 'resume.pdf').slice(0, 255);
}

const notFound = (res) => res.status(404).json({ message: 'Resume not found.' });

export async function uploadResume(req, res) {
  if (!isPdf(req.file.buffer)) {
    return res.status(400).json({ message: 'The uploaded file is not a valid PDF.' });
  }

  let text;
  try {
    text = await extractPdfText(req.file.buffer);
  } catch (err) {
    if (err instanceof PdfExtractionError) {
      return res.status(err.status).json({ message: err.message });
    }
    throw err;
  }

  const userId = req.user.id;
  const id = await withUserLock(userId, async (conn) => {
    // A user's first resume becomes their default automatically
    const [existing] = await conn.execute('SELECT 1 FROM resumes WHERE user_id = ? LIMIT 1', [
      userId,
    ]);
    const [result] = await conn.execute(
      'INSERT INTO resumes (user_id, file_name, extracted_text, is_default) VALUES (?, ?, ?, ?)',
      [userId, cleanFileName(req.file.originalname), text, existing.length ? 0 : 1]
    );
    return result.insertId;
  });

  res.status(201).json(await findOwned(id, userId));
}

export async function listResumes(req, res) {
  const [rows] = await pool.execute(
    `SELECT ${SUMMARY_FIELDS} FROM resumes WHERE user_id = ?
     ORDER BY is_default DESC, uploaded_at DESC, id DESC`,
    [req.user.id]
  );
  res.json(rows.map(toResume));
}

export async function getResume(req, res) {
  const resume = await findOwned(req.validated.params.id, req.user.id, { withText: true });
  if (!resume) return notFound(res);
  res.json(resume);
}

export async function setDefaultResume(req, res) {
  const { id } = req.validated.params;
  const userId = req.user.id;

  const found = await withUserLock(userId, async (conn) => {
    const [rows] = await conn.execute('SELECT id FROM resumes WHERE id = ? AND user_id = ?', [
      id,
      userId,
    ]);
    if (!rows.length) return false;

    await conn.execute('UPDATE resumes SET is_default = (id = ?) WHERE user_id = ?', [id, userId]);
    return true;
  });

  if (!found) return notFound(res);
  res.json(await findOwned(id, userId));
}

export async function deleteResume(req, res) {
  const { id } = req.validated.params;
  const userId = req.user.id;

  const found = await withUserLock(userId, async (conn) => {
    const [rows] = await conn.execute(
      'SELECT is_default FROM resumes WHERE id = ? AND user_id = ?',
      [id, userId]
    );
    if (!rows.length) return false;

    await conn.execute('DELETE FROM resumes WHERE id = ? AND user_id = ?', [id, userId]);

    // Deleting the default promotes the most recently uploaded remaining resume
    if (rows[0].is_default) {
      await conn.execute(
        `UPDATE resumes SET is_default = 1 WHERE user_id = ?
         ORDER BY uploaded_at DESC, id DESC LIMIT 1`,
        [userId]
      );
    }
    return true;
  });

  if (!found) return notFound(res);
  res.status(204).end();
}
