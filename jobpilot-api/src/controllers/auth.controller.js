import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db.js';
import { JWT_OPTIONS } from '../middleware/auth.js';

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { ...JWT_OPTIONS, algorithm: 'HS256', expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

export async function register(req, res) {
  const { name, email, password } = req.body;

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length) {
    return res.status(409).json({ message: 'Email is already registered.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [result] = await pool.execute(
    'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
    [name, email, passwordHash]
  );

  const user = { id: result.insertId, name, email };
  res.status(201).json({ token: signToken(user), user });
}

export async function login(req, res) {
  const { email, password } = req.body;

  const [rows] = await pool.execute(
    'SELECT id, name, email, password_hash FROM users WHERE email = ?',
    [email]
  );
  const user = rows[0];

  // Same message for "no such user" and "wrong password" so emails can't be probed
  const valid = user && (await bcrypt.compare(password, user.password_hash));
  if (!valid) {
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  res.json({
    token: signToken(user),
    user: { id: user.id, name: user.name, email: user.email },
  });
}

export async function me(req, res) {
  const [rows] = await pool.execute(
    'SELECT id, name, email, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ message: 'User not found.' });
  res.json(rows[0]);
}
