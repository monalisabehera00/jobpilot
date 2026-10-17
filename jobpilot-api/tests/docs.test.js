import request from 'supertest';
import app from '../src/app.js';
import { pool } from '../src/config/db.js';

const api = request(app);

afterAll(async () => {
  await pool.end();
});

// Every route the API serves, as documented in OpenAPI form
const ROUTES = [
  ['post', '/auth/register'],
  ['post', '/auth/login'],
  ['get', '/auth/me'],
  ['get', '/applications'],
  ['post', '/applications'],
  ['get', '/applications/{id}'],
  ['put', '/applications/{id}'],
  ['delete', '/applications/{id}'],
  ['patch', '/applications/{id}/status'],
  ['post', '/applications/{id}/matches'],
  ['get', '/applications/{id}/matches'],
  ['post', '/resumes'],
  ['get', '/resumes'],
  ['get', '/resumes/{id}'],
  ['delete', '/resumes/{id}'],
  ['patch', '/resumes/{id}/default'],
];

describe('API documentation', () => {
  let spec;

  beforeAll(async () => {
    const res = await api.get('/api/docs.json');
    expect(res.status).toBe(200);
    spec = res.body;
  });

  it('is an OpenAPI 3 document', () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('JobPilot API');
  });

  it.each(ROUTES)('documents %s %s', (method, path) => {
    expect(spec.paths[path]?.[method]).toBeDefined();
  });

  it('only leaves register and login public', () => {
    const publicOps = ROUTES.filter(([m, p]) => spec.paths[p][m].security?.length === 0);
    expect(publicOps).toEqual([
      ['post', '/auth/register'],
      ['post', '/auth/login'],
    ]);
  });

  it('has no broken $ref links', () => {
    const refs = JSON.stringify(spec).match(/"\$ref":"#\/[^"]+"/g) ?? [];
    for (const ref of new Set(refs)) {
      const path = ref.slice(10, -1).split('/');
      const target = path.reduce((node, key) => node?.[key], spec);
      expect({ ref, found: target !== undefined }).toEqual({ ref, found: true });
    }
  });

  it('serves Swagger UI at /api/docs', async () => {
    const res = await api.get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});
