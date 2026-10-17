import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

const api = request(app);
let tokenA;
let tokenB;

async function registerUser(email) {
  const res = await api
    .post('/api/auth/register')
    .send({ name: 'Test User', email, password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const create = (token, body) =>
  api.post('/api/applications').set(auth(token)).send(body);

beforeAll(async () => {
  tokenA = await registerUser('alice@example.com');
  tokenB = await registerUser('bob@example.com');
});

beforeEach(async () => {
  await pool.query('DELETE FROM job_applications');
});

afterAll(async () => {
  await pool.end();
});

describe('authentication', () => {
  it('rejects requests without a token', async () => {
    const res = await api.get('/api/applications');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid token', async () => {
    const res = await api.get('/api/applications').set(auth('not-a-jwt'));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/applications', () => {
  it('creates a Wishlist application by default', async () => {
    const res = await create(tokenA, { companyName: '  Acme  ', jobTitle: 'Engineer', location: '' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      companyName: 'Acme',
      jobTitle: 'Engineer',
      status: 'Wishlist',
      location: null,
      appliedOn: null,
    });
    expect(res.body.id).toEqual(expect.any(Number));
  });

  it('stores all optional fields', async () => {
    const body = {
      companyName: 'Globex',
      jobTitle: 'Backend Developer',
      jobDescription: 'Node.js and MySQL',
      jobUrl: 'https://globex.example.com/jobs/1',
      location: 'Remote',
      notes: 'Referral from Sam',
      status: 'Applied',
      appliedOn: '2026-09-01',
      nextFollowUpOn: '2026-09-15',
    };
    const res = await create(tokenA, body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject(body);
  });

  it('returns 400 with field errors for invalid input', async () => {
    const res = await create(tokenA, {
      jobTitle: 'Engineer',
      status: 'Hired',
      jobUrl: 'javascript:alert(1)',
      appliedOn: '01/09/2026',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(
      ['appliedOn', 'companyName', 'jobUrl', 'status'].sort()
    );
  });
});

describe('GET /api/applications', () => {
  beforeEach(async () => {
    const rows = [
      { companyName: 'Acme', jobTitle: 'Frontend Engineer', status: 'Applied', appliedOn: '2026-01-10' },
      { companyName: 'Acme Labs', jobTitle: 'Data Analyst', status: 'Wishlist' },
      { companyName: 'Globex', jobTitle: 'Backend Engineer', status: 'Interview', appliedOn: '2026-03-05' },
      { companyName: 'Initech', jobTitle: 'QA Tester', status: 'Rejected', appliedOn: '2026-05-20', notes: '100% remote' },
      { companyName: 'Umbrella', jobTitle: 'DevOps', status: 'Offer', appliedOn: '2026-07-01' },
    ];
    for (const row of rows) await create(tokenA, row);
    await create(tokenB, { companyName: 'Acme', jobTitle: 'Bob Engineer' });
  });

  it('paginates only the current user’s applications', async () => {
    const res = await api.get('/api/applications?page=2&limit=2').set(auth(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
    expect(res.body.data.every((a) => a.jobTitle !== 'Bob Engineer')).toBe(true);
  });

  it('uses defaults when no query is given', async () => {
    const res = await api.get('/api/applications').set(auth(tokenA));
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 5, totalPages: 1 });
  });

  it('filters by status', async () => {
    const res = await api.get('/api/applications?status=Interview').set(auth(tokenA));
    expect(res.body.data.map((a) => a.companyName)).toEqual(['Globex']);
  });

  it('filters by partial company name', async () => {
    const res = await api.get('/api/applications?company=acme&sortBy=companyName&sortOrder=asc')
      .set(auth(tokenA));
    expect(res.body.data.map((a) => a.companyName)).toEqual(['Acme', 'Acme Labs']);
  });

  it('searches across title, company, location and notes', async () => {
    const res = await api.get('/api/applications?search=engineer&sortBy=jobTitle&sortOrder=asc')
      .set(auth(tokenA));
    expect(res.body.data.map((a) => a.jobTitle)).toEqual(['Backend Engineer', 'Frontend Engineer']);
  });

  it('treats LIKE wildcards in search as literal text', async () => {
    const res = await api.get('/api/applications?search=100%25').set(auth(tokenA));
    expect(res.body.data.map((a) => a.companyName)).toEqual(['Initech']);

    const underscore = await api.get('/api/applications?search=_').set(auth(tokenA));
    expect(underscore.body.data).toHaveLength(0);
  });

  it('filters by applied date range', async () => {
    const res = await api
      .get('/api/applications?dateFrom=2026-03-01&dateTo=2026-06-30&sortBy=appliedOn&sortOrder=asc')
      .set(auth(tokenA));
    expect(res.body.data.map((a) => a.companyName)).toEqual(['Globex', 'Initech']);
  });

  it('sorts by an allowlisted field', async () => {
    const res = await api.get('/api/applications?sortBy=companyName&sortOrder=desc').set(auth(tokenA));
    expect(res.body.data.map((a) => a.companyName)).toEqual([
      'Umbrella', 'Initech', 'Globex', 'Acme Labs', 'Acme',
    ]);
  });

  it('rejects invalid query parameters', async () => {
    const res = await api
      .get('/api/applications?sortBy=password_hash&limit=500&page=0')
      .set(auth(tokenA));
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(['limit', 'page', 'sortBy']);
  });

  it('rejects a reversed date range', async () => {
    const res = await api
      .get('/api/applications?dateFrom=2026-06-01&dateTo=2026-01-01')
      .set(auth(tokenA));
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('dateFrom');
  });
});

describe('single application routes', () => {
  let app1;

  beforeEach(async () => {
    const res = await create(tokenA, { companyName: 'Acme', jobTitle: 'Engineer', notes: 'First call' });
    app1 = res.body;
  });

  it('GET returns an owned application', async () => {
    const res = await api.get(`/api/applications/${app1.id}`).set(auth(tokenA));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(app1);
  });

  it('GET returns 400 for a non-numeric id and 404 for an unknown id', async () => {
    expect((await api.get('/api/applications/abc').set(auth(tokenA))).status).toBe(400);
    expect((await api.get('/api/applications/999999').set(auth(tokenA))).status).toBe(404);
  });

  it('PUT updates only the provided fields and null clears a field', async () => {
    const res = await api
      .put(`/api/applications/${app1.id}`)
      .set(auth(tokenA))
      .send({ jobTitle: 'Senior Engineer', notes: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ companyName: 'Acme', jobTitle: 'Senior Engineer', notes: null });
  });

  it('PUT rejects an empty body', async () => {
    const res = await api.put(`/api/applications/${app1.id}`).set(auth(tokenA)).send({});
    expect(res.status).toBe(400);
  });

  it('PUT returns 404 for an unknown id', async () => {
    const res = await api.put('/api/applications/999999').set(auth(tokenA)).send({ notes: 'x' });
    expect(res.status).toBe(404);
  });

  it('PATCH /status changes the status', async () => {
    const res = await api
      .patch(`/api/applications/${app1.id}/status`)
      .set(auth(tokenA))
      .send({ status: 'Applied' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Applied');
  });

  it('PATCH /status rejects an unknown status', async () => {
    const res = await api
      .patch(`/api/applications/${app1.id}/status`)
      .set(auth(tokenA))
      .send({ status: 'Hired' });
    expect(res.status).toBe(400);
  });

  it('DELETE removes the application', async () => {
    const res = await api.delete(`/api/applications/${app1.id}`).set(auth(tokenA));
    expect(res.status).toBe(204);
    expect((await api.get(`/api/applications/${app1.id}`).set(auth(tokenA))).status).toBe(404);
    expect((await api.delete(`/api/applications/${app1.id}`).set(auth(tokenA))).status).toBe(404);
  });

  describe('cross-user access', () => {
    it('hides another user’s application from GET', async () => {
      const res = await api.get(`/api/applications/${app1.id}`).set(auth(tokenB));
      expect(res.status).toBe(404);
    });

    it('blocks PUT, PATCH and DELETE and leaves the record unchanged', async () => {
      const put = await api
        .put(`/api/applications/${app1.id}`)
        .set(auth(tokenB))
        .send({ companyName: 'Hacked' });
      const patch = await api
        .patch(`/api/applications/${app1.id}/status`)
        .set(auth(tokenB))
        .send({ status: 'Rejected' });
      const del = await api.delete(`/api/applications/${app1.id}`).set(auth(tokenB));

      expect([put.status, patch.status, del.status]).toEqual([404, 404, 404]);

      const owner = await api.get(`/api/applications/${app1.id}`).set(auth(tokenA));
      expect(owner.body).toMatchObject({ companyName: 'Acme', status: 'Wishlist' });
    });
  });
});
