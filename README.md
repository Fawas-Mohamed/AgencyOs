# Agency OS Client Hub

Local, standalone implementation of the supplied Neirah Tech assignment. Both source PDFs were read completely (Common Standard v1.0: 16 pages; Hub Task: 7 pages). The repository initially contained only Git metadata; **no existing Client, ClientNote, auth, permission, audit or storage integration was available**. Canonical shared adapters are supplied and their replacement points are documented in [HANDOVER.md](docs/HANDOVER.md).

The module provides client workspaces, structured requirements and ordered items, controlled review/confirmation/revisions, manual communications, private files/reference links, internal notes, chronological activity and immutable confirmed JSON packages. Other Agency OS business modules are outside this implementation.

## Prerequisites and versions

- Node.js **22.22.2** used; supported project range 22.14–22.x; npm **11.21.0** used (Day 5).
- Next.js **15.5.28** App Router, React **19.1.4**, TypeScript **5.9.3**, Tailwind **3.4.19**. Next 15 deliberately retains the required `frontend/middleware.ts` convention.
- NestJS **11.2.7**, Prisma/client **6.19.3**, PostgreSQL **17**.
- Jest **29**, Supertest and Playwright. Exact dependency versions are in the three package-lock files.
- Docker Desktop is optional if you supply separate local PostgreSQL development/test databases. Included Compose uses an isolated PostgreSQL container on **127.0.0.1:55432**, separate from any existing PostgreSQL service.
- Google Chrome for the browser suite, or set `UI_BROWSER_CHANNEL=msedge` for installed Microsoft Edge.

## Local setup

Run from the repository root in PowerShell:

```powershell
npm ci --no-audit --no-fund
npm ci --prefix backend --no-audit --no-fund
npm ci --prefix frontend --no-audit --no-fund
node scripts/setup-local.mjs
docker compose up -d
```

The setup script creates ignored root `.env`, `backend/.env`, and `frontend/.env.local` using random local credentials. It preserves existing configuration files. It does not print credentials. Read the generated `DEMO_EMAIL` / `DEMO_PASSWORD`, or `DEMO_SECONDARY_EMAIL` / `DEMO_SECONDARY_PASSWORD`, in **backend/.env locally** to sign in to either isolated agency; do not paste them into reports or source files.

For manual Compose configuration, also copy the root .env.example to .env and set LOCAL_DB_PASSWORD consistently with DATABASE_URL. For manual application configuration, copy each application's `.env.example`, supply your own database URL and random JWT secret, and configure issuer, audience and frontend origin. Enable `DEMO_AUTH_ENABLED=true` only for the seeded local demonstration. Production startup rejects enabled demonstration auth. The frontend server uses `API_INTERNAL_URL`; browser requests use the same-origin `NEXT_PUBLIC_API_BASE_URL=/api`. Keep `APP_ORIGIN` identical to the URL used in the browser.

After PostgreSQL is accepting connections:

```powershell
npm run prisma:generate --prefix backend
npm run db:migrate --prefix backend
npm run db:seed --prefix backend
```

These commands deploy committed migrations and add missing sample data. They do not run migrate reset, drop databases or delete existing records. The seed resumes after partial setup and preserves existing requirement content/status. Sample data includes two isolated agencies: Ceylon Craft Studio and Northline Consulting in the first; Harbor Research Studio in the second. It includes confirmed/draft requirements, references, internal notes, manual communication and associated activity.

Start each application in its own terminal:

```powershell
npm run dev --prefix backend
npm run dev --prefix frontend
```

Open **http://localhost:3000**, sign in, and open Ceylon Craft Studio. Backend: **http://127.0.0.1:5000/api**. No application source or files are uploaded by these commands.

## Verification

```powershell
npm test --prefix backend
npm run lint --prefix backend
npm run lint --prefix frontend
npm run typecheck --prefix backend
npm run typecheck --prefix frontend
npm run build --prefix backend
npm run build --prefix frontend
npm run format:check
node scripts/check-local-hygiene.mjs
```

Create the separate test database once for the included Compose instance:

```powershell
docker exec agencyos-client-hub-db createdb -U agencyos agencyos_hub_test
```

If it already exists, preserve it and skip createdb. Set `TEST_DATABASE_URL` to that database; the generated configuration already does this.

```powershell
node scripts/test-api.mjs
node scripts/test-ui.mjs
```

The API runner refuses database names that do not end in `_test`, deploys migrations and runs actual Nest HTTP requests against PostgreSQL. API fixtures use unique agency IDs and clean up only their own rows. Browser checks seed the separate test database, run dedicated API/web processes on automatically selected free local ports, and stop their own servers afterward. Browser-created test records are retained in that test database to preserve version history. They do not populate the demonstration development database. Screenshots are ignored under `frontend/test-results/`.

To use another dedicated test database, export `TEST_DATABASE_URL` locally. Never point test tooling at an existing business database. No reset command is part of these scripts.

Production compilation:

```powershell
npm run build
```

`npm start --prefix backend` executes `dist/src/main.js`; `npm start --prefix frontend` serves the Next production build. For local demonstrations, development mode is intentional because the seeded login is not a production identity system. A successful production build alone does not establish production readiness.

## Repository and contracts

```text
frontend/
  app/client-hub/                 Module routes
  app/api/[...path]/              Same-origin session proxy
  components/ui/                 Reusable primitives
  components/client-hub/          Module screens and rows
  lib/api/                       Central API client / resource hook
  lib/types/                     Typed contracts
  lib/utils/                     Presentation helpers
  public/agency-os-logo.png      Supplied original, unchanged
  middleware.ts                  Session presence routing
backend/
  prisma/schema.prisma
  prisma/migrations/
  src/client-hub/dto/
  src/client-hub/                 Controllers / services / module
  src/common/                    Auth / permissions / validation / envelopes
  src/prisma/
  test/                          PostgreSQL HTTP integration tests
docs/
  REQUIREMENTS_CHECKLIST.md
  IMPLEMENTATION_CHOICES.md
  HANDOVER.md
  WORK_LOG.md
  TEST_RESULTS.md
```

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for every endpoint, DTO, permission and confirmed package, [the requirement checklist](docs/REQUIREMENTS_CHECKLIST.md) for traceability, and [WORK_LOG.md](docs/WORK_LOG.md) for commands actually executed and milestone reports.

## Added dependencies and purpose

| Application          | Dependencies                                                         | Purpose                                                                 |
| -------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Backend runtime      | Nest common/core/platform-express/config/jwt, reflect-metadata, rxjs | Application modules, environment configuration, signed JWT verification |
| Backend runtime      | Prisma client                                                        | Typed PostgreSQL access and transactions                                |
| Backend runtime      | class-validator, class-transformer                                   | Strict DTO and nested input validation                                  |
| Backend runtime      | helmet, multer                                                       | Security headers and bounded in-memory uploads                          |
| Backend runtime      | dotenv                                                               | Local seed/config loading                                               |
| Backend development  | Nest CLI/testing, Prisma CLI, TypeScript, ts-node                    | Build, migrations, generation, test application and seed                |
| Backend development  | Jest, ts-jest, Supertest, type packages                              | Unit and real HTTP/database integration verification                    |
| Backend development  | ESLint, typescript-eslint                                            | Consistent TypeScript lint rules                                        |
| Frontend runtime     | Next, React, React DOM                                               | App Router screens and server proxy                                     |
| Frontend runtime     | lucide-react, @fontsource/inter                                      | Single icon family and locally bundled required font                    |
| Frontend development | Tailwind, PostCSS, Autoprefixer, TypeScript/type packages            | Required styling and typed compilation                                  |
| Frontend development | ESLint, eslint-config-next, @eslint/eslintrc                         | Next/React lint rules                                                   |
| Frontend development | @playwright/test                                                     | Browser and responsive workflow verification                            |
| Root development     | Prettier                                                             | Consistent source formatting                                            |

No commits, pushes, pull requests, deployments or external messages are part of this delivery.

## Day 1 foundation audit — 16 October 2026

The current workspace already contains the standalone module; this pass preserves it and documents reuse. See the [foundation inventory, schema and proposed workflow](docs/DAY_1_FOUNDATION.md), [complete traceability checklist](docs/DAY_1_TRACEABILITY.md) and [fresh Day 1 report](docs/DAY_1_REPORT.md). These distinguish standalone adapters from absent shared Agency OS integrations.

For an existing explicitly enabled local demo, add only missing secondary credentials, then verify two-agency sample data, preservation, repeat seeding and live Nest/PostgreSQL access:

```powershell
node scripts/setup-local.mjs --add-isolation-demo
node scripts/test-foundation.mjs
node scripts/test-ui.mjs --grep foundation
```

The foundation runner reads the configured development database, fingerprints all pre-existing rows in memory, seeds missing demo records twice, verifies that existing rows and confirmed history did not change, and starts/stops its own Nest HTTP listener. It never resets the database or prints credentials. The browser command uses the separate test database and verifies the shell at desktop/tablet/mobile sizes with two isolated cookie sessions. Both application builds must exist before browser checks.

## Day 2 requirement backend — 17 October 2026

The existing canonical clients, requirement routes and Day 1 workflow/revision policy are retained. Requirement services now enforce their permission keys directly and return tenant-scoped current lockVersion/status on stale or serialized writes. See the [Day 2 report](docs/DAY_2_REPORT.md), [traceability](docs/DAY_2_TRACEABILITY.md) and expanded [API contract](API_DOCUMENTATION.md).

Executed verification: npm test --prefix backend (67 passed), node scripts/test-api.mjs (79 passed on the corrected full run), backend build and lint. Test tooling uses only its dedicated test database and fixture agencies. Frontend/browser checks remain dated Day 1 for this backend-only request.

## Day 3 supporting backend — 17 October 2026

Manual communications, internal ClientNote discussion, private files/references, activity, bounded hub totals and approved-version export are documented in the [Day 3 report](docs/DAY_3_REPORT.md) and [traceability](docs/DAY_3_TRACEABILITY.md). Fresh checks: 96 unit tests, 109 PostgreSQL API tests, backend build/lint and frontend contract typecheck passed. No external sync or unrelated module was added.

The [storage/retention guide](docs/STORAGE_AND_RETENTION.md) describes the replaceable PrivateStorage provider, private staged writes, failure cleanup and approved-history retention. From the repository root, `npm run storage:reconcile --prefix backend` performs a counts-only dry run. Apply is separate, local-only, and requires upload workers stopped as described in the guide. Day 3 ran only the real-environment dry run; it deleted nothing.

## Day 4 frontend — 18 October 2026

The full client hub uses real APIs with six workspace sections and separate requirement forms/review screens. It includes keyboard item ordering, retained form errors, unsaved-change dialogs, explicit conflict recovery, protected download retry, permission-aware actions and clear active/confirmed version history. See [Day 4 traceability](docs/DAY_4_TRACEABILITY.md) and [Day 4 report](docs/DAY_4_REPORT.md) for fresh results and screenshots.

Run the full local workflow: create a client; create a requirement and ordered items; log a related communication and upload/reference supporting material; submit for review; confirm; download the confirmed package; reopen with a reason; edit the new draft; download the previous exact version from history. While a newer draft is unapproved, unversioned export is unavailable. Manual notes/communications remain separate from immutable approved content.

After both builds, `node scripts/test-ui.mjs` checks Chrome at 375/768/1440 pixels. Use `--project=desktop` for a focused rerun. Source PDFs/logo, business data and database volumes remain local; setup, test and adapter limitations above still apply.

## Isolated clean setup / existing PostgreSQL

Extract the submission to a new directory. Install the three lockfiles with the npm ci commands above; do not copy node_modules or real environment files from another installation. An optional --offline flag uses a populated local npm cache. Python is not an application prerequisite.

If the included Compose container/port already serves an existing checkout, preserve it. Instead, ask your local PostgreSQL administrator to create a NEW login role and two NEW empty databases owned by that role, with the test database name ending in \_test. Do not use reset or point setup at an existing business database. For example, in the administrator's local PostgreSQL session, use fresh names and your own random password:

```sql
CREATE ROLE assignment_demo LOGIN PASSWORD '<new-local-random-password>';
CREATE DATABASE assignment_demo OWNER assignment_demo;
CREATE DATABASE assignment_demo_test OWNER assignment_demo;
```

Run node scripts/setup-local.mjs in the extracted directory to generate safe local credentials. Before migrations, edit backend/.env locally: set DATABASE_URL and TEST_DATABASE_URL to the new role/databases, including the PostgreSQL host/port. Keep the generated random JWT and demo passwords. Do not run docker compose up for this existing-server option. The root Compose password is unused in this option.

Then run prisma:generate, db:migrate and db:seed exactly as above. Start both dev commands in separate terminals, sign in using the generated local credentials, and follow [the reviewer demo](docs/REVIEWER_DEMO.md). If ports are occupied, change backend PORT and FRONTEND_URL, frontend API_INTERNAL_URL and APP_ORIGIN consistently, and run npm run dev --prefix frontend -- --port <free-port>. Host/port values must match the browser URL; do not expose the development servers externally.

The hygiene tool supports extracted source without Git: it explicitly reports Git tracking/ignore checks UNRUN, then scans available configured credentials and browser bundles. This is distinct from package inventory verification.

## Local submission packaging

After verification and documentation, run from the working source:

```powershell
node scripts/package-submission.mjs submission/agencyos-client-hub-day5
```

The destination must be new; the script never deletes or overwrites a previous package. It copies only allowlisted module source, migrations, tests, lockfiles, safe examples, the original logo and documentation, writes a SHA-256 file manifest, and creates a local ZIP. It excludes Git, dependencies, build/cache output, real environment files, uploaded data and unrelated files. It checks included bytes against configured local secrets without printing them. Nothing is submitted externally. For a clean rehearsal copy without an archive, use a new .qa/name destination with --stage-only. Do not package the rehearsal's generated config or database data.

## Day 5 acceptance and submission - 18 October 2026

See [the final report](docs/DAY_5_REPORT.md), [PDF acceptance mapping](docs/DAY_5_TRACEABILITY.md), [reviewer demo](docs/REVIEWER_DEMO.md) and [technical handover](docs/HANDOVER.md). Final Day 5 results supersede earlier dated milestone counts above. This remains a locally demonstrated standalone module with explicit production adapter work; passing a build does not establish production readiness.
