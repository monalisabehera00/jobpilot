import http from 'node:http';
import {
  analyzeMatch,
  createAnthropicProvider,
  LlmError,
  setLlmProvider,
} from '../src/services/llm.service.js';

// A local stand-in for the Claude API, so the real SDK's error handling is exercised offline
let server;
let baseURL;
let handler;
let requests;

const validResult = {
  score: 72,
  matchedSkills: ['Node.js', 'MySQL'],
  missingSkills: ['Docker'],
  suggestions: ['Add a bullet about the REST API you built with Express.'],
};

function message(text, stopReason = 'end_turn') {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: text === null ? [] : [{ type: 'text', text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

function reply(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

const apiError = (type, msg) => ({ type: 'error', error: { type, message: msg } });

const input = { resumeText: 'Node.js and MySQL developer', jobDescription: 'Needs Node.js, MySQL, Docker' };

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push({ headers: req.headers, body: JSON.parse(body || '{}') });
      handler(req, res);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  setLlmProvider(null);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  requests = [];
  process.env.LLM_TIMEOUT_MS = '5000';
  setLlmProvider(createAnthropicProvider({ apiKey: 'test-key', baseURL, maxRetries: 0 }));
});

async function expectLlmError(code) {
  const err = await analyzeMatch(input).catch((e) => e);
  expect(err).toBeInstanceOf(LlmError);
  expect(err.code).toBe(code);
  return err;
}

describe('Anthropic provider', () => {
  it('returns validated structured output and sends a well-formed request', async () => {
    handler = (req, res) => reply(res, 200, message(JSON.stringify(validResult)));

    await expect(analyzeMatch(input)).resolves.toEqual({ ...validResult, model: 'claude-opus-5-5' });

    const [{ headers, body }] = requests;
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.fallbacks).toBe('default');
    expect(headers['anthropic-beta']).toContain('server-side-fallback-2026-07-01');
    expect(body.messages[0].content).toContain('<resume>\nNode.js and MySQL developer\n</resume>');
  });

  it('retries once when the output is not valid JSON, then gives up', async () => {
    handler = (req, res) => reply(res, 200, message('not json'));

    const err = await expectLlmError('LLM_INVALID_RESPONSE');
    expect(err.status).toBe(502);
    expect(requests).toHaveLength(2);
  });

  it('recovers when the retry returns valid output', async () => {
    let calls = 0;
    handler = (req, res) =>
      reply(res, 200, message(++calls === 1 ? '{"score": 150}' : JSON.stringify(validResult)));

    await expect(analyzeMatch(input)).resolves.toMatchObject({ score: 72 });
    expect(requests).toHaveLength(2);
  });

  it('rejects output that breaks the schema', async () => {
    handler = (req, res) => reply(res, 200, message(JSON.stringify({ ...validResult, score: 150 })));
    await expectLlmError('LLM_INVALID_RESPONSE');
  });

  it('treats a truncated response as invalid', async () => {
    handler = (req, res) => reply(res, 200, message('{"score": 7', 'max_tokens'));
    await expectLlmError('LLM_INVALID_RESPONSE');
  });

  it('reports a refusal', async () => {
    handler = (req, res) => reply(res, 200, message(null, 'refusal'));
    const err = await expectLlmError('LLM_REFUSED');
    expect(err.status).toBe(422);
  });

  it('maps 429 to a rate-limit error with the retry-after delay', async () => {
    handler = (req, res) =>
      reply(res, 429, apiError('rate_limit_error', 'Slow down'), { 'retry-after': '30' });

    const err = await expectLlmError('LLM_RATE_LIMITED');
    expect(err.status).toBe(429);
    expect(err.retryAfter).toBe(30);
  });

  it('maps an overloaded API (529) to unavailable', async () => {
    handler = (req, res) => reply(res, 529, apiError('overloaded_error', 'Overloaded'));
    const err = await expectLlmError('LLM_UNAVAILABLE');
    expect(err.status).toBe(503);
  });

  it('maps a rejected API key to not configured', async () => {
    handler = (req, res) => reply(res, 401, apiError('authentication_error', 'Invalid key'));
    await expectLlmError('LLM_NOT_CONFIGURED');
  });

  it('times out when the API is too slow', async () => {
    process.env.LLM_TIMEOUT_MS = '300';
    handler = (req, res) => setTimeout(() => reply(res, 200, message(JSON.stringify(validResult))), 1500);

    const err = await expectLlmError('LLM_TIMEOUT');
    expect(err.status).toBe(504);
  });

  it('lets the SDK retry a rate limit and succeed', async () => {
    setLlmProvider(createAnthropicProvider({ apiKey: 'test-key', baseURL, maxRetries: 1 }));
    let calls = 0;
    handler = (req, res) =>
      ++calls === 1
        ? reply(res, 429, apiError('rate_limit_error', 'Slow down'), { 'retry-after': '0.1' })
        : reply(res, 200, message(JSON.stringify(validResult)));

    await expect(analyzeMatch(input)).resolves.toMatchObject({ score: 72 });
    expect(requests).toHaveLength(2);
  });
});

describe('configuration', () => {
  it('requires an API key for the Anthropic provider', () => {
    expect(() => createAnthropicProvider({ apiKey: '' })).toThrow(LlmError);
  });
});
