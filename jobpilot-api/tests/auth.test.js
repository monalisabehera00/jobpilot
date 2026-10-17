import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

const api = request(app);
const user = { name: 'Auth User', email: 'auth-user@example.com', password: 'password123' };

beforeAll(async () => {
  await pool.execute('DELETE FROM users WHERE email LIKE ?', ['auth-%@example.com']);
});

afterAll(async () => {
  await pool.end();
});

describe('POST /api/auth/register', () => {
  it('creates an account and returns a token without the password hash', async () => {
    const res = await api.post('/api/auth/register').send({ ...user, email: ' Auth-User@Example.com ' });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({ id: expect.any(Number), name: user.name, email: user.email });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('rejects a duplicate email', async () => {
    const res = await api.post('/api/auth/register').send(user);
    expect(res.status).toBe(409);
  });

  it('validates the input', async () => {
    const res = await api
      .post('/api/auth/register')
      .send({ name: '', email: 'not-an-email', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(['email', 'name', 'password']);
  });

  it('rejects malformed JSON', async () => {
    const res = await api
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid JSON body.');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right password', async () => {
    const res = await api.post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await api.post('/api/auth/login').send({ email: user.email, password: 'nope-nope' });
    const unknownEmail = await api
      .post('/api/auth/login')
      .send({ email: 'auth-nobody@example.com', password: 'nope-nope' });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe('GET /api/auth/me', () => {
  let token;

  beforeAll(async () => {
    const res = await api.post('/api/auth/login').send({ email: user.email, password: user.password });
    token = res.body.token;
  });

  it('returns the current user', async () => {
    const res = await api.get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: user.name, email: user.email });
  });

  it.each([
    ['no header', undefined],
    ['wrong scheme', `Basic ${'x'.repeat(10)}`],
    ['garbage token', 'Bearer not-a-jwt'],
  ])('rejects %s', async (label, header) => {
    const req = api.get('/api/auth/me');
    if (header) req.set('Authorization', header);
    expect((await req).status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ sub: '1' }, process.env.JWT_SECRET, {
      issuer: 'jobpilot',
      audience: 'jobpilot-client',
      expiresIn: -10,
    });
    const res = await api.get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign({ sub: '1' }, 'some-other-secret-that-is-long-enough-123', {
      issuer: 'jobpilot',
      audience: 'jobpilot-client',
    });
    const res = await api.get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned ("alg: none") token', async () => {
    const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: '1', iss: 'jobpilot', aud: 'jobpilot-client' })}.`;
    const res = await api.get('/api/auth/me').set('Authorization', `Bearer ${unsigned}`);
    expect(res.status).toBe(401);
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const res = await api.get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/Route not found/);
  });
});
