import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relative = process.argv[2];
const stageOnly = process.argv.includes('--stage-only');
if (!relative || !/^(submission|\.qa)[/\\][a-zA-Z0-9_-]+$/.test(relative))
  throw new Error('Choose a new submission/name or .qa/name directory');
const target = path.resolve(root, relative);
if (!target.startsWith(root + path.sep) || existsSync(target) || existsSync(target + '.zip'))
  throw new Error('Destination must be new and inside this workspace');
const roots = [
  'README.md',
  'API_DOCUMENTATION.md',
  'package.json',
  'package-lock.json',
  'compose.yaml',
  '.gitignore',
  '.prettierignore',
  '.prettierrc.json',
  '.env.example',
  'docs',
  'scripts',
  'backend/src',
  'backend/prisma',
  'backend/test',
  'backend/package.json',
  'backend/package-lock.json',
  'backend/tsconfig.json',
  'backend/nest-cli.json',
  'backend/eslint.config.mjs',
  'backend/.env.example',
  'frontend/app',
  'frontend/components',
  'frontend/lib',
  'frontend/public',
  'frontend/test',
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/tsconfig.json',
  'frontend/next-env.d.ts',
  'frontend/next.config.ts',
  'frontend/tailwind.config.ts',
  'frontend/postcss.config.js',
  'frontend/eslint.config.mjs',
  'frontend/playwright.config.ts',
  'frontend/middleware.ts',
  'frontend/.env.example',
];
const blocked =
  /(^|\/)(node_modules|\.git|\.next|dist|coverage|\.data|test-results|playwright-report)(\/|$)|\.(log|tsbuildinfo|zip|dump|bak)$/;
const inventory = new Map();
function collect(relativeName) {
  const name = relativeName.replaceAll('\\', '/');
  if (blocked.test(name)) throw new Error('Forbidden source path: ' + name);
  const source = path.join(root, name);
  if (!existsSync(source)) throw new Error('Missing required submission source: ' + name);
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error('Links are not packaged: ' + name);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(source).sort()) collect(name + '/' + entry);
    return;
  }
  if (!stat.isFile() || (path.basename(name).startsWith('.env') && !name.endsWith('.example')))
    throw new Error('Unsafe submission entry: ' + name);
  if (
    !/\.(tsx?|mjs|cjs|js|json|css|prisma|sql|toml|md|png|yaml|example)$/.test(name) &&
    !['.gitignore', '.prettierignore'].includes(name)
  )
    throw new Error('Unexpected source extension: ' + name);
  inventory.set(name, readFileSync(source));
}
roots.forEach(collect);
const credentials = [];
for (const name of ['.env', 'backend/.env', 'frontend/.env.local']) {
  if (!existsSync(path.join(root, name))) continue;
  for (const line of readFileSync(path.join(root, name), 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line);
    if (!match) continue;
    if (/PASSWORD|SECRET/.test(match[1]) && match[2].length >= 12) credentials.push(match[2]);
    if (/DATABASE_URL$/.test(match[1])) {
      try {
        const value = decodeURIComponent(new URL(match[2]).password);
        if (value) credentials.push(value);
      } catch {
        /* validated at startup */
      }
    }
  }
}
for (const [name, bytes] of inventory)
  if (credentials.some((value) => bytes.includes(Buffer.from(value))))
    throw new Error('Configured credential detected in source: ' + name);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = [...inventory].map(([name, bytes]) => ({
  path: name,
  bytes: bytes.length,
  sha256: hash(bytes),
}));
inventory.set(
  'SUBMISSION_MANIFEST.json',
  Buffer.from(
    JSON.stringify(
      {
        formatVersion: 1,
        note: 'SHA-256 of every included source file; manifest excludes itself. No Git metadata or runtime data.',
        files: manifest,
      },
      null,
      2,
    ) + '\n',
  ),
);
for (const [name, bytes] of inventory) {
  const destination = path.join(target, name);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, bytes, { flag: 'wx' });
}
for (const [name, bytes] of inventory)
  if (hash(readFileSync(path.join(target, name))) !== hash(bytes))
    throw new Error('Copy mismatch: ' + name);
console.log(
  'PASS: ' +
    inventory.size +
    ' allowlisted files copied and verified; no runtime data or configured credentials',
);
if (!stageOnly) {
  // ZIP STORE: no dependency, shell interpolation, or executable archive entries.
  const crcTable = Array.from({ length: 256 }, (_, i) => {
    let n = i;
    for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, bytes] of inventory) {
    const filename = Buffer.from(name, 'utf8'),
      crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(33, 12); // 1980-01-01
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(bytes.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(filename.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x800, 8);
    entry.writeUInt16LE(33, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(bytes.length, 20);
    entry.writeUInt32LE(bytes.length, 24);
    entry.writeUInt16LE(filename.length, 28);
    entry.writeUInt32LE(offset, 42);
    local.push(header, filename, bytes);
    central.push(entry, filename);
    offset += header.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(inventory.size, 8);
  end.writeUInt16LE(inventory.size, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const zip = Buffer.concat([...local, directory, end]);
  writeFileSync(target + '.zip', zip, { flag: 'wx' });
  console.log('Archive: ' + relative + '.zip');
  console.log('SHA256: ' + hash(zip));
}
console.log('Folder: ' + relative);
