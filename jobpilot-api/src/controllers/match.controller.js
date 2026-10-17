import { pool } from '../config/db.js';
import { analyzeMatch, LlmError } from '../services/llm.service.js';

// Upper bound on resume + job description text sent for analysis
const MAX_INPUT_CHARS = 150000;

// One analysis at a time per user, so double clicks don't spend twice
const runningForUser = new Set();

// MySQL returns JSON columns already parsed; MariaDB (e.g. XAMPP) stores JSON as text
const jsonColumn = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

function toMatch(row) {
  return {
    id: row.id,
    applicationId: row.job_application_id,
    resumeId: row.resume_id,
    resumeFileName: row.resume_file_name,
    score: row.score,
    matchedSkills: jsonColumn(row.matched_skills),
    missingSkills: jsonColumn(row.missing_skills),
    suggestions: jsonColumn(row.suggestions),
    model: row.model_used,
    createdAt: row.created_at,
  };
}

// Ownership is checked through the parent application's user_id
const MATCH_SELECT = `
  SELECT ma.id, ma.job_application_id, ma.resume_id, r.file_name AS resume_file_name, ma.score,
         ma.matched_skills, ma.missing_skills, ma.suggestions, ma.model_used, ma.created_at
  FROM match_analyses ma
  JOIN job_applications ja ON ja.id = ma.job_application_id
  JOIN resumes r ON r.id = ma.resume_id
  WHERE ja.user_id = ?`;

async function findOwnedApplication(id, userId) {
  const [rows] = await pool.execute(
    'SELECT id, job_description FROM job_applications WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return rows[0] ?? null;
}

async function findResume(userId, resumeId) {
  const [rows] = resumeId
    ? await pool.execute(
        'SELECT id, extracted_text FROM resumes WHERE id = ? AND user_id = ?',
        [resumeId, userId]
      )
    : await pool.execute(
        'SELECT id, extracted_text FROM resumes WHERE user_id = ? AND is_default = 1 LIMIT 1',
        [userId]
      );
  return rows[0] ?? null;
}

function sendLlmError(res, err) {
  if (!['LLM_TIMEOUT', 'LLM_RATE_LIMITED', 'LLM_REFUSED'].includes(err.code)) {
    console.error(`AI match failed (${err.code}):`, err.cause?.message ?? err.message);
  }
  if (err.retryAfter) res.set('Retry-After', String(err.retryAfter));

  const message = err.retryAfter
    ? `${err.message} (try again in about ${err.retryAfter} seconds)`
    : err.message;
  res.status(err.status).json({ message, code: err.code });
}

export async function createMatch(req, res) {
  const userId = req.user.id;
  const { id: applicationId } = req.validated.params;
  const { resumeId } = req.body;

  const application = await findOwnedApplication(applicationId, userId);
  if (!application) return res.status(404).json({ message: 'Application not found.' });

  const jobDescription = application.job_description?.trim();
  if (!jobDescription) {
    return res.status(422).json({
      message: 'Add a job description to this application before running a match.',
    });
  }

  const resume = await findResume(userId, resumeId);
  if (!resume) {
    return resumeId
      ? res.status(404).json({ message: 'Resume not found.' })
      : res.status(422).json({ message: 'Upload a resume before running a match.' });
  }

  if (jobDescription.length + resume.extracted_text.length > MAX_INPUT_CHARS) {
    return res.status(422).json({
      message: 'The resume and job description are too long to analyze together.',
    });
  }

  if (runningForUser.has(userId)) {
    return res.status(429).json({ message: 'A match analysis is already running. Please wait for it to finish.' });
  }

  runningForUser.add(userId);
  let analysis;
  try {
    analysis = await analyzeMatch({ resumeText: resume.extracted_text, jobDescription });
  } catch (err) {
    if (err instanceof LlmError) return sendLlmError(res, err);
    throw err;
  } finally {
    runningForUser.delete(userId);
  }

  let insertId;
  try {
    const [result] = await pool.execute(
      `INSERT INTO match_analyses
         (job_application_id, resume_id, score, matched_skills, missing_skills, suggestions, model_used)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        applicationId,
        resume.id,
        analysis.score,
        JSON.stringify(analysis.matchedSkills),
        JSON.stringify(analysis.missingSkills),
        JSON.stringify(analysis.suggestions),
        analysis.model,
      ]
    );
    insertId = result.insertId;
  } catch (err) {
    // The application or resume was deleted while the AI was working
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(409).json({ message: 'The application or resume was deleted during the analysis.' });
    }
    throw err;
  }

  const [rows] = await pool.execute(`${MATCH_SELECT} AND ma.id = ?`, [userId, insertId]);
  res.status(201).json(toMatch(rows[0]));
}

export async function listMatches(req, res) {
  const userId = req.user.id;
  const { id: applicationId } = req.validated.params;

  if (!(await findOwnedApplication(applicationId, userId))) {
    return res.status(404).json({ message: 'Application not found.' });
  }

  const [rows] = await pool.execute(
    `${MATCH_SELECT} AND ma.job_application_id = ? ORDER BY ma.created_at DESC, ma.id DESC`,
    [userId, applicationId]
  );
  res.json(rows.map(toMatch));
}
