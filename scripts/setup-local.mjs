import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const paths = ['.env', 'backend/.env', 'frontend/.env.local'].map((p) => path.join(root, p));
if (process.argv.includes('--add-isolation-demo')) {
  const requireBackend = createRequire(path.join(root, 'backend/package.json'));
  const { parse } = requireBackend('dotenv');
  if (!existsSync(paths[1])) throw new Error('Create the local environment first');
  const values = parse(readFileSync(paths[1], 'utf8'));
  if (values.NODE_ENV === 'production' || values.DEMO_AUTH_ENABLED !== 'true')
    throw new Error('This option requires an explicitly enabled non-production demo adapter');
  const additions = [];
  for (const [key, fallback] of [
    ['DEMO_SECONDARY_EMAIL', 'isolation-reviewer@agencyos.local'],
    ['DEMO_SECONDARY_PASSWORD', randomBytes(18).toString('base64url')],
  ]) {
    if (Object.hasOwn(values, key)) {
      if (!values[key])
        throw new Error('Complete the existing blank ' + key + ' locally; no values were changed');
    } else {
      additions.push(key + '=' + fallback);
    }
  }
  if (additions.length) appendFileSync(paths[1], '\n' + additions.join('\n') + '\n');
  console.log(
    'Secondary demo configuration is present. Existing values were preserved; credentials were not printed.',
  );
  process.exit(0);
}
if (paths.some((p) => existsSync(p))) {
  console.log(
    'Local environment files already exist and were preserved. Use --add-isolation-demo to add missing secondary demo keys.',
  );
  process.exit(0);
}
const databasePassword = randomBytes(24).toString('hex');
const jwtSecret = randomBytes(48).toString('hex');
writeFileSync(paths[0], 'LOCAL_DB_PASSWORD=' + databasePassword + '\n', {
  flag: 'wx',
  mode: 0o600,
});
writeFileSync(
  paths[1],
  [
    'DATABASE_URL=postgresql://agencyos:' +
      databasePassword +
      '@127.0.0.1:55432/agencyos_hub?schema=public',
    'TEST_DATABASE_URL=postgresql://agencyos:' +
      databasePassword +
      '@127.0.0.1:55432/agencyos_hub_test?schema=public',
    'JWT_SECRET=' + jwtSecret,
    'JWT_ISSUER=agencyos-local',
    'JWT_AUDIENCE=agencyos-client-hub',
    'PORT=5000',
    'HOST=127.0.0.1',
    'FRONTEND_URL=http://localhost:3000',
    'NODE_ENV=development',
    'DEMO_AUTH_ENABLED=true',
    'DEMO_EMAIL=reviewer@agencyos.local',
    'DEMO_PASSWORD=' + randomBytes(18).toString('base64url'),
    'DEMO_SECONDARY_EMAIL=isolation-reviewer@agencyos.local',
    'DEMO_SECONDARY_PASSWORD=' + randomBytes(18).toString('base64url'),
    'STORAGE_ROOT=.data/files',
    'MAX_FILE_BYTES=5242880',
    'ALLOWED_FILE_TYPES=application/pdf,image/png,image/jpeg,text/plain',
    '',
  ].join('\n'),
  { flag: 'wx', mode: 0o600 },
);
writeFileSync(
  paths[2],
  'NEXT_PUBLIC_API_BASE_URL=/api\nAPI_INTERNAL_URL=http://127.0.0.1:5000/api\nAPP_ORIGIN=http://localhost:3000\nNEXT_TELEMETRY_DISABLED=1\n',
  { flag: 'wx', mode: 0o600 },
);
console.log(
  'Created ignored local configuration with random credentials for two agencies. Read demo credentials in backend/.env locally; no credentials were printed.',
);
