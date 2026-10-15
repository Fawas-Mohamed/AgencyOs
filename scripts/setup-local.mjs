import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const paths = ['.env','backend/.env','frontend/.env.local'].map(p=>path.join(root,p));
if (paths.some(p=>existsSync(p))) {
  console.log('Local environment files already exist. They were preserved. Follow README to use or complete your configuration.');
  process.exit(0);
}
const databasePassword = randomBytes(24).toString('hex');
const demoPassword = randomBytes(18).toString('base64url');
const jwtSecret = randomBytes(48).toString('hex');
writeFileSync(paths[0],'LOCAL_DB_PASSWORD='+databasePassword+'\n',{flag:'wx',mode:0o600});
writeFileSync(paths[1],[
  'DATABASE_URL=postgresql://agencyos:'+databasePassword+'@127.0.0.1:55432/agencyos_hub?schema=public',
  'TEST_DATABASE_URL=postgresql://agencyos:'+databasePassword+'@127.0.0.1:55432/agencyos_hub_test?schema=public',
  'JWT_SECRET='+jwtSecret,'JWT_ISSUER=agencyos-local','JWT_AUDIENCE=agencyos-client-hub',
  'PORT=5000','HOST=127.0.0.1','FRONTEND_URL=http://localhost:3000','NODE_ENV=development',
  'DEMO_AUTH_ENABLED=true','DEMO_EMAIL=reviewer@agencyos.local','DEMO_PASSWORD='+demoPassword,
  'STORAGE_ROOT=.data/files','MAX_FILE_BYTES=5242880',
  'ALLOWED_FILE_TYPES=application/pdf,image/png,image/jpeg,text/plain','',
].join('\n'),{flag:'wx',mode:0o600});
writeFileSync(paths[2],'NEXT_PUBLIC_API_BASE_URL=/api\nAPI_INTERNAL_URL=http://127.0.0.1:5000/api\nAPP_ORIGIN=http://localhost:3000\n',{flag:'wx',mode:0o600});
console.log('Created ignored local configuration with random credentials. Read DEMO_EMAIL and DEMO_PASSWORD in backend/.env locally to sign in. No credentials were printed.');
