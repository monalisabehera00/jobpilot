import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { makePdf } from './helpers/pdf.js';

const api = request(app);
let tokenA;
let tokenB;

async function registerUser(email) {
  const res = await api
    .post('/api/auth/register')
    .send({ name: 'Resume User', email, password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token;
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

const upload = (token, buffer, filename = 'resume.pdf', contentType = 'application/pdf') =>
  api.post('/api/resumes').set(auth(token)).attach('resume', buffer, { filename, contentType });

const resumePdf = (name) => makePdf([name, 'Skills: Node.js, Express, MySQL']);

async function defaultIds(token) {
  const res = await api.get('/api/resumes').set(auth(token));
  return res.body.filter((r) => r.isDefault).map((r) => r.id);
}

beforeAll(async () => {
  tokenA = await registerUser('resume-a@example.com');
  tokenB = await registerUser('resume-b@example.com');
});

beforeEach(async () => {
  await pool.query('DELETE FROM resumes');
});

afterAll(async () => {
  await pool.end();
});

describe('POST /api/resumes', () => {
  it('requires authentication', async () => {
    const res = await api.post('/api/resumes').attach('resume', resumePdf('Jane'), 'cv.pdf');
    expect(res.status).toBe(401);
  });

  it('extracts text and makes the first resume the default', async () => {
    const res = await upload(tokenA, resumePdf('Jane Doe'), 'jane-cv.pdf');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ fileName: 'jane-cv.pdf', isDefault: true });
    expect(res.body.preview).toContain('Jane Doe');
    expect(res.body.textLength).toBeGreaterThan(0);
    expect(res.body).not.toHaveProperty('extractedText');
  });

  it('does not make later uploads the default', async () => {
    await upload(tokenA, resumePdf('First'));
    const res = await upload(tokenA, resumePdf('Second'));
    expect(res.body.isDefault).toBe(false);
  });

  it('keeps non-ASCII file names', async () => {
    const res = await upload(tokenA, resumePdf('Zoë'), 'résumé-zoë.pdf');
    expect(res.body.fileName).toBe('résumé-zoë.pdf');
  });

  it('rejects a missing file', async () => {
    const res = await api.post('/api/resumes').set(auth(tokenA));
    expect(res.status).toBe(400);
  });

  it('rejects a file sent in the wrong field', async () => {
    const res = await api
      .post('/api/resumes')
      .set(auth(tokenA))
      .attach('file', resumePdf('Jane'), { filename: 'cv.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('rejects non-PDF files', async () => {
    const res = await upload(tokenA, Buffer.from('plain text'), 'cv.txt', 'text/plain');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Only PDF files are allowed.');
  });

  it('rejects files that claim to be PDFs but are not', async () => {
    const res = await upload(tokenA, Buffer.from('not really a pdf'), 'fake.pdf');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('The uploaded file is not a valid PDF.');
  });

  it('rejects files over 5 MB', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(5 * 1024 * 1024)]);
    const res = await upload(tokenA, big, 'big.pdf');
    expect(res.status).toBe(413);
  });

  it('returns 422 for PDFs without extractable text', async () => {
    const res = await upload(tokenA, makePdf([]), 'scan.pdf');
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/no text could be extracted/i);
  });

  it('returns 422 for corrupt PDFs', async () => {
    const res = await upload(tokenA, Buffer.from('%PDF-1.4 broken'), 'broken.pdf');
    expect(res.status).toBe(422);
  });
});

describe('reading resumes', () => {
  it('lists only the user’s resumes, default first, without full text', async () => {
    const first = (await upload(tokenA, resumePdf('A1'))).body;
    await upload(tokenA, resumePdf('A2'));
    await upload(tokenB, resumePdf('B1'));

    const res = await api.get('/api/resumes').set(auth(tokenA));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(first.id);
    expect(res.body.every((r) => !('extractedText' in r))).toBe(true);
  });

  it('returns one resume with its extracted text', async () => {
    const { id } = (await upload(tokenA, resumePdf('Jane Doe'))).body;
    const res = await api.get(`/api/resumes/${id}`).set(auth(tokenA));

    expect(res.status).toBe(200);
    expect(res.body.extractedText).toBe('Jane Doe\nSkills: Node.js, Express, MySQL');
  });

  it('returns 400 for a bad id and 404 for an unknown id', async () => {
    expect((await api.get('/api/resumes/abc').set(auth(tokenA))).status).toBe(400);
    expect((await api.get('/api/resumes/999999').set(auth(tokenA))).status).toBe(404);
  });
});

describe('PATCH /api/resumes/:id/default', () => {
  it('moves the default to the chosen resume', async () => {
    await upload(tokenA, resumePdf('First'));
    const second = (await upload(tokenA, resumePdf('Second'))).body;

    const res = await api.patch(`/api/resumes/${second.id}/default`).set(auth(tokenA));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: second.id, isDefault: true });
    expect(await defaultIds(tokenA)).toEqual([second.id]);
  });

  it('returns 404 for an unknown resume', async () => {
    const res = await api.patch('/api/resumes/999999/default').set(auth(tokenA));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/resumes/:id', () => {
  it('promotes the newest remaining resume when the default is deleted', async () => {
    const first = (await upload(tokenA, resumePdf('First'))).body;
    await upload(tokenA, resumePdf('Second'));
    const third = (await upload(tokenA, resumePdf('Third'))).body;

    const res = await api.delete(`/api/resumes/${first.id}`).set(auth(tokenA));

    expect(res.status).toBe(204);
    expect(await defaultIds(tokenA)).toEqual([third.id]);
  });

  it('keeps the default when another resume is deleted', async () => {
    const first = (await upload(tokenA, resumePdf('First'))).body;
    const second = (await upload(tokenA, resumePdf('Second'))).body;

    await api.delete(`/api/resumes/${second.id}`).set(auth(tokenA));

    expect(await defaultIds(tokenA)).toEqual([first.id]);
  });

  it('returns 404 for an already deleted resume', async () => {
    const { id } = (await upload(tokenA, resumePdf('Only'))).body;
    await api.delete(`/api/resumes/${id}`).set(auth(tokenA));

    expect((await api.delete(`/api/resumes/${id}`).set(auth(tokenA))).status).toBe(404);
    expect((await api.get('/api/resumes').set(auth(tokenA))).body).toEqual([]);
  });
});

describe('cross-user access', () => {
  it('blocks reading, changing the default and deleting another user’s resume', async () => {
    const resumeA = (await upload(tokenA, resumePdf('Alice'))).body;
    const resumeB = (await upload(tokenB, resumePdf('Bob'))).body;

    const get = await api.get(`/api/resumes/${resumeA.id}`).set(auth(tokenB));
    const patch = await api.patch(`/api/resumes/${resumeA.id}/default`).set(auth(tokenB));
    const del = await api.delete(`/api/resumes/${resumeA.id}`).set(auth(tokenB));

    expect([get.status, patch.status, del.status]).toEqual([404, 404, 404]);
    expect(await defaultIds(tokenA)).toEqual([resumeA.id]);
    expect(await defaultIds(tokenB)).toEqual([resumeB.id]);
  });
});
