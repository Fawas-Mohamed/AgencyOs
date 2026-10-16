import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.join(root, 'backend');
const requireBackend = createRequire(path.join(backend, 'package.json'));
const { parse } = requireBackend('dotenv');
const { PrismaClient } = requireBackend('@prisma/client');
const values = parse(readFileSync(path.join(backend, '.env'), 'utf8'));
const env = { ...values, ...process.env };
if (env.NODE_ENV === 'production' || env.DEMO_AUTH_ENABLED !== 'true')
  throw new Error(
    'This seed verification requires explicitly enabled non-production demo configuration',
  );
const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
const models = [
  'agency',
  'permission',
  'role',
  'rolePermission',
  'user',
  'client',
  'clientRequirement',
  'requirementItem',
  'requirementRevision',
  'clientNote',
  'clientCommunication',
  'clientFile',
  'auditLog',
];
async function snapshot() {
  const result = new Map();
  for (const model of models)
    for (const row of await db[model].findMany()) {
      const key = model + ':' + (row.id ?? row.key ?? row.roleId + ':' + row.permissionKey);
      result.set(key, createHash('sha256').update(JSON.stringify(row)).digest('hex'));
    }
  return result;
}
function run(relative) {
  const result = spawnSync(process.execPath, ['node_modules/ts-node/dist/bin.js', relative], {
    cwd: backend,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  assert.equal(result.status, 0, 'Foundation child command failed');
}
try {
  const before = await snapshot();
  run('prisma/seed.ts');
  const once = await snapshot();
  for (const [key, digest] of before)
    assert.equal(once.get(key), digest, 'An existing row changed');
  console.log('PASS: all existing rows preserved across two-agency seeding');
  run('prisma/seed.ts');
  const twice = await snapshot();
  assert.equal(twice.size, once.size);
  for (const [key, digest] of once)
    assert.equal(twice.get(key), digest, 'Repeat seed changed a row');
  console.log(
    'PASS: repeat seed is idempotent; confirmed history and all existing rows are unchanged',
  );
  run('prisma/verify-foundation.ts');
} catch {
  console.error(
    'FAIL: foundation verification; database was not reset and credential values were not printed',
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
