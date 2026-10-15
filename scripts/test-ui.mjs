import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const values = Object.fromEntries(
  readFileSync(path.join(root, 'backend/.env'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const database = process.env.TEST_DATABASE_URL ?? values.TEST_DATABASE_URL;
if (!database || !new URL(database).pathname.endsWith('_test'))
  throw new Error('A dedicated test database is required');
const env = {
  ...process.env,
  ...values,
  DATABASE_URL: database,
  TEST_DATABASE_URL: database,
  NODE_ENV: 'test',
  DEMO_AUTH_ENABLED: 'true',
  JWT_SECRET: randomBytes(48).toString('hex'),
  UI_ORIGIN: 'http://localhost:3001',
};
for (const args of [
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  ['node_modules/ts-node/dist/bin.js', 'prisma/seed.ts'],
]) {
  const result = spawnSync(process.execPath, args, {
    cwd: path.join(root, 'backend'),
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const result = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
  { cwd: path.join(root, 'frontend'), env, stdio: 'inherit', windowsHide: true },
);
process.exit(result.status ?? 1);
