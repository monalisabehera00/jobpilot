import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Point every test run at a disposable database, never the development one
export const TEST_DB_NAME = process.env.TEST_DB_NAME || 'jobpilot_test';

if (!/test/i.test(TEST_DB_NAME)) {
  throw new Error('TEST_DB_NAME must contain "test".');
}

// This file loads in both globalSetup and each test file, so only switch once
if (!process.env.JOBPILOT_TEST_DB_ACTIVE) {
  if (TEST_DB_NAME === process.env.DB_NAME) {
    throw new Error('TEST_DB_NAME must differ from DB_NAME.');
  }
  process.env.DB_NAME = TEST_DB_NAME;
  process.env.JOBPILOT_TEST_DB_ACTIVE = '1';
}
process.env.JWT_SECRET ||= 'test-only-secret-that-is-at-least-32-characters';

// Tests never call the real AI service (or spend money): use the offline provider
process.env.LLM_PROVIDER = 'mock';
delete process.env.ANTHROPIC_API_KEY;
