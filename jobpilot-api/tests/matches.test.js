import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';
import { LlmError, setLlmProvider } from '../src/services/llm.service.js';
import { makePdf } from './helpers/pdf.js';

const api = request(app);
let tokenA;
let tokenB;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function registerUser(email) {
  const res = await api
    .post('/api/auth/register')
    .send({ name: 'Match User', email, password: 'password123' });
  expect(res.status).toBe(201);
  return res.body.token;
}

async function createApplication(token, jobDescription = 'We need Node.js, MySQL and Docker skills.') {
  const res = await api
    .post('/api/applications')
    .set(auth(token))
    .send({ companyName: 'Acme', jobTitle: 'Backend Engineer', jobDescription });
  return res.body;
}

async function uploadResume(token, lines) {
  const res = await api
    .post('/api/resumes')
    .set(auth(token))
    .attach('resume', makePdf(lines), { filename: 'cv.pdf', contentType: 'application/pdf' });
  return res.body;
}

const runMatch = (token, appId, body = {}) =>
  api.post(`/api/applications/${appId}/matches`).set(auth(token)).send(body);

const failingProvider = (err) => ({ name: 'fake', analyze: async () => Promise.reject(err) });

beforeAll(async () => {
  tokenA = await registerUser('match-a@example.com');
  tokenB = await registerUser('match-b@example.com');
});

beforeEach(async () => {
  setLlmProvider(null);
  await pool.query('DELETE FROM match_analyses');
  await pool.query('DELETE FROM job_applications');
  await pool.query('DELETE FROM resumes');
});

afterAll(async () => {
  setLlmProvider(null);
  await pool.end();
});

describe('POST /api/applications/:id/matches', () => {
  it('requires authentication', async () => {
    const res = await api.post('/api/applications/1/matches');
    expect(res.status).toBe(401);
  });

  it('analyzes the default resume and saves the result', async () => {
    const application = await createApplication(tokenA);
    const resume = await uploadResume(tokenA, ['Skills: Node.js, MySQL, Express']);

    const res = await runMatch(tokenA, application.id);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      applicationId: application.id,
      resumeId: resume.id,
      resumeFileName: 'cv.pdf',
      score: 67,
      matchedSkills: ['Node.js', 'MySQL'],
      missingSkills: ['Docker'],
      model: 'mock',
    });
    expect(res.body.suggestions.length).toBeGreaterThan(0);

    const list = await api.get(`/api/applications/${application.id}/matches`).set(auth(tokenA));
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toEqual(res.body);
  });

  it('uses a specific resume when resumeId is given', async () => {
    const application = await createApplication(tokenA);
    await uploadResume(tokenA, ['Skills: Node.js']);
    const second = await uploadResume(tokenA, ['Skills: Node.js, MySQL, Docker']);

    const res = await runMatch(tokenA, application.id, { resumeId: second.id });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ resumeId: second.id, score: 100 });
  });

  it('asks for a job description first', async () => {
    const application = await createApplication(tokenA, '');
    await uploadResume(tokenA, ['Skills: Node.js']);

    const res = await runMatch(tokenA, application.id);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/job description/i);
  });

  it('asks for a resume first', async () => {
    const application = await createApplication(tokenA);
    const res = await runMatch(tokenA, application.id);
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/upload a resume/i);
  });

  it('validates resumeId', async () => {
    const application = await createApplication(tokenA);
    const res = await runMatch(tokenA, application.id, { resumeId: 'abc' });
    expect(res.status).toBe(400);
  });

  it('does not use another user’s application or resume', async () => {
    const appA = await createApplication(tokenA);
    const resumeA = await uploadResume(tokenA, ['Skills: Node.js']);
    const appB = await createApplication(tokenB);
    await uploadResume(tokenB, ['Skills: MySQL']);

    expect((await runMatch(tokenB, appA.id)).status).toBe(404);
    const otherResume = await runMatch(tokenB, appB.id, { resumeId: resumeA.id });
    expect(otherResume.status).toBe(404);
    expect(otherResume.body.message).toBe('Resume not found.');
  });

  it.each([
    ['LLM_RATE_LIMITED', 429],
    ['LLM_TIMEOUT', 504],
    ['LLM_UNAVAILABLE', 503],
    ['LLM_INVALID_RESPONSE', 502],
    ['LLM_REFUSED', 422],
    ['LLM_NOT_CONFIGURED', 503],
  ])('turns %s into a %i response and saves nothing', async (code, status) => {
    const error = new LlmError(code, { retryAfter: code === 'LLM_RATE_LIMITED' ? 20 : undefined });
    const application = await createApplication(tokenA);
    await uploadResume(tokenA, ['Skills: Node.js']);
    setLlmProvider(failingProvider(error));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await runMatch(tokenA, application.id);
    errorSpy.mockRestore();

    expect(res.status).toBe(status);
    expect(res.body.code).toBe(error.code);
    if (error.retryAfter) {
      expect(res.headers['retry-after']).toBe('20');
      expect(res.body.message).toMatch(/20 seconds/);
    }
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM match_analyses');
    expect(count).toBe(0);
  });

  it('allows only one analysis at a time per user', async () => {
    const application = await createApplication(tokenA);
    await uploadResume(tokenA, ['Skills: Node.js']);

    let release;
    const gate = new Promise((resolve) => (release = resolve));
    setLlmProvider({
      name: 'slow',
      analyze: async () => {
        await gate;
        return { result: { score: 10, matchedSkills: [], missingSkills: [], suggestions: ['x'] }, model: 'slow' };
      },
    });

    const first = runMatch(tokenA, application.id).then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = await runMatch(tokenA, application.id);
    release();

    expect(second.status).toBe(429);
    expect((await first).status).toBe(201);
  });
});

describe('GET /api/applications/:id/matches', () => {
  it('returns 404 for another user’s application', async () => {
    const application = await createApplication(tokenA);
    await uploadResume(tokenA, ['Skills: Node.js']);
    await runMatch(tokenA, application.id);

    const res = await api.get(`/api/applications/${application.id}/matches`).set(auth(tokenB));
    expect(res.status).toBe(404);
  });

  it('lists newest first', async () => {
    const application = await createApplication(tokenA);
    await uploadResume(tokenA, ['Skills: Node.js']);
    const first = (await runMatch(tokenA, application.id)).body;
    const second = (await runMatch(tokenA, application.id)).body;

    const res = await api.get(`/api/applications/${application.id}/matches`).set(auth(tokenA));
    expect(res.body.map((m) => m.id)).toEqual([second.id, first.id]);
  });
});
