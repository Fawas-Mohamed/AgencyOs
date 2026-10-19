import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
// A submission has no .git. Never discover a parent checkout accidentally.
const checkout = existsSync(path.join(root, '.git'));
const omitted = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'coverage',
  '.data',
  '.qa',
  'submission',
  'test-results',
  'playwright-report',
]);
function sourceFiles(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (omitted.has(entry.name) || entry.isSymbolicLink()) return [];
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(name);
    if (
      (entry.name.startsWith('.env') &&
        !['.env.example', '.env.test.example'].includes(entry.name)) ||
      /\.(log|tsbuildinfo|zip)$/.test(entry.name)
    )
      return [];
    return [path.relative(root, name).replaceAll('\\', '/')];
  });
}
const tracked = checkout ? git(['ls-files']) : [];
const source = checkout
  ? [...new Set(git(['ls-files', '--cached', '--others', '--exclude-standard']))]
  : sourceFiles();
let failed = false;
const fail = (message) => {
  failed = true;
  console.error('FAIL: ' + message);
};
const forbidden = tracked.filter(
  (name) =>
    /(^|\/)(node_modules|\.next|dist|coverage|\.data)\//.test(name) ||
    name.endsWith('.tsbuildinfo') ||
    (/(^|\/)\.env($|\.)/.test(name) &&
      !name.endsWith('.env.example') &&
      !name.endsWith('.env.test.example')),
);
for (const name of forbidden) fail('Generated output or real environment file is tracked: ' + name);
if (checkout && !forbidden.length)
  console.log('PASS: no generated output or real environment files tracked');
if (!checkout) console.log('UNRUN: Git tracking/ignore checks (source-only submission; no .git)');
const secrets = [];
for (const relative of ['.env', 'backend/.env']) {
  const filename = path.join(root, relative);
  if (!existsSync(filename)) continue;
  for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i < 1 || line.startsWith('#')) continue;
    const key = line.slice(0, i);
    const value = line.slice(i + 1);
    if (
      ['JWT_SECRET', 'DEMO_PASSWORD', 'DEMO_SECONDARY_PASSWORD', 'LOCAL_DB_PASSWORD'].includes(
        key,
      ) &&
      value.length >= 16
    )
      secrets.push(value);
    if (key === 'DATABASE_URL') {
      try {
        const password = new URL(value).password;
        if (password) secrets.push(password);
      } catch {
        /* Invalid configuration is validated by the API. */
      }
    }
  }
}
for (const relative of checkout ? ['.env', 'backend/.env', 'frontend/.env.local'] : []) {
  if (!existsSync(path.join(root, relative))) continue;
  try {
    execFileSync('git', ['check-ignore', '--quiet', relative], { cwd: root, stdio: 'ignore' });
  } catch {
    fail('Local configuration is not ignored: ' + relative);
  }
}
function scan(names, caption) {
  let issues = 0;
  for (const name of names) {
    const file = path.isAbsolute(name) ? name : path.join(root, name);
    if (!existsSync(file)) continue;
    const bytes = readFileSync(file);
    if (secrets.some((value) => bytes.includes(Buffer.from(value)))) {
      fail('Credential content detected in ' + path.relative(root, file));
      issues++;
    }
  }
  console.log(
    (issues ? 'FAIL' : 'PASS') +
      ': ' +
      caption +
      ' (' +
      names.length +
      ' files checked; credential values never printed)',
  );
}
if (secrets.length) scan(source, 'source credential scan');
else console.log('UNRUN: generated-value scan; no configured local credentials found');
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(name) : [name];
  });
}
const staticDirectory = path.join(root, 'frontend/.next/static');
if (existsSync(staticDirectory) && secrets.length)
  scan(
    walk(staticDirectory).filter((file) => /\.(js|css|json|map|html)$/.test(file)),
    'compiled browser bundle credential scan',
  );
else
  console.log(
    'UNRUN: compiled browser bundle scan; build the frontend and configure local credentials first',
  );
process.exitCode = failed ? 1 : 0;
