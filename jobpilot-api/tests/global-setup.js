import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { TEST_DB_NAME } from './env.js';

// Recreates the test database from db/schema.sql before the whole test run
export default async function globalSetup() {
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const sql = schema.replace(/\b(CREATE DATABASE IF NOT EXISTS|USE)\s+jobpilot\b/g, `$1 ${TEST_DB_NAME}`);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${TEST_DB_NAME}\``);
    await connection.query(sql);
  } finally {
    await connection.end();
  }
}
