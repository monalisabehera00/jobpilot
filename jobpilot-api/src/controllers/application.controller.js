import { pool } from '../config/db.js';

// API field -> column. SQL identifiers only ever come from these fixed maps.
const COLUMNS = {
  companyName: 'company_name',
  jobTitle: 'job_title',
  jobDescription: 'job_description',
  jobUrl: 'job_url',
  location: 'location',
  notes: 'notes',
  status: 'status',
  appliedOn: 'applied_on',
  nextFollowUpOn: 'next_follow_up_on',
};

const SORT_COLUMNS = {
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  appliedOn: 'applied_on',
  nextFollowUpOn: 'next_follow_up_on',
  companyName: 'company_name',
  jobTitle: 'job_title',
  status: 'status',
};

const SELECT_FIELDS = `id, company_name, job_title, job_description, job_url, location, notes,
  status, applied_on, next_follow_up_on, created_at, updated_at`;

function toApplication(row) {
  return {
    id: row.id,
    companyName: row.company_name,
    jobTitle: row.job_title,
    jobDescription: row.job_description,
    jobUrl: row.job_url,
    location: row.location,
    notes: row.notes,
    status: row.status,
    appliedOn: row.applied_on,
    nextFollowUpOn: row.next_follow_up_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Fields the client actually sent (validated body), in [column, value] form
function providedColumns(body) {
  return Object.entries(body)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => [COLUMNS[field], value]);
}

// Make user input match literally inside LIKE (backslash is MySQL's default escape)
const likeContains = (text) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

async function findOwned(id, userId) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS} FROM job_applications WHERE id = ? AND user_id = ?`,
    [id, userId]
  );
  return rows[0] ? toApplication(rows[0]) : null;
}

const notFound = (res) => res.status(404).json({ message: 'Application not found.' });

export async function createApplication(req, res) {
  const fields = providedColumns(req.body);
  const columns = fields.map(([column]) => column);

  const [result] = await pool.execute(
    `INSERT INTO job_applications (user_id, ${columns.join(', ')})
     VALUES (?, ${columns.map(() => '?').join(', ')})`,
    [req.user.id, ...fields.map(([, value]) => value)]
  );

  res.status(201).json(await findOwned(result.insertId, req.user.id));
}

export async function listApplications(req, res) {
  const { page, limit, status, company, search, dateFrom, dateTo, sortBy, sortOrder } =
    req.validated.query;

  const where = ['user_id = ?'];
  const values = [req.user.id];

  if (status) {
    where.push('status = ?');
    values.push(status);
  }
  if (company) {
    where.push('company_name LIKE ?');
    values.push(likeContains(company));
  }
  if (search) {
    where.push('(job_title LIKE ? OR company_name LIKE ? OR location LIKE ? OR notes LIKE ?)');
    values.push(...Array(4).fill(likeContains(search)));
  }
  if (dateFrom) {
    where.push('applied_on >= ?');
    values.push(dateFrom);
  }
  if (dateTo) {
    where.push('applied_on <= ?');
    values.push(dateTo);
  }

  const whereSql = where.join(' AND ');
  const direction = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM job_applications WHERE ${whereSql}`,
    values
  );

  // LIMIT/OFFSET are sent as strings: mysql2 + MySQL 8 reject numeric values here
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS} FROM job_applications WHERE ${whereSql}
     ORDER BY ${SORT_COLUMNS[sortBy]} ${direction}, id ${direction}
     LIMIT ? OFFSET ?`,
    [...values, String(limit), String((page - 1) * limit)]
  );

  res.json({
    data: rows.map(toApplication),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function getApplication(req, res) {
  const application = await findOwned(req.validated.params.id, req.user.id);
  if (!application) return notFound(res);
  res.json(application);
}

export async function updateApplication(req, res) {
  const { id } = req.validated.params;
  const fields = providedColumns(req.body);

  await pool.execute(
    `UPDATE job_applications SET ${fields.map(([column]) => `${column} = ?`).join(', ')}
     WHERE id = ? AND user_id = ?`,
    [...fields.map(([, value]) => value), id, req.user.id]
  );

  const application = await findOwned(id, req.user.id);
  if (!application) return notFound(res);
  res.json(application);
}

export async function updateApplicationStatus(req, res) {
  const { id } = req.validated.params;

  await pool.execute('UPDATE job_applications SET status = ? WHERE id = ? AND user_id = ?', [
    req.body.status,
    id,
    req.user.id,
  ]);

  const application = await findOwned(id, req.user.id);
  if (!application) return notFound(res);
  res.json(application);
}

export async function deleteApplication(req, res) {
  const [result] = await pool.execute(
    'DELETE FROM job_applications WHERE id = ? AND user_id = ?',
    [req.validated.params.id, req.user.id]
  );
  if (!result.affectedRows) return notFound(res);
  res.status(204).end();
}
