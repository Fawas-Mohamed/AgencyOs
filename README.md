
<<<<<<< HEAD
=======
Local, standalone implementation of the supplied Neirah Tech assignment. Both source PDFs were read completely (Common Standard v1.0: 16 pages; Hub Task: 7 pages). The repository initially contained only Git metadata; **no existing Client, ClientNote, auth, permission, audit or storage integration was available**. Canonical shared adapters are supplied and their replacement points are documented in [HANDOVER.md](docs/HANDOVER.md).

The module provides client workspaces, structured requirements and ordered items, controlled review/confirmation/revisions, manual communications, private files/reference links, internal notes, chronological activity and immutable confirmed JSON packages. Other Agency OS business modules are outside this implementation.

## Prerequisites and versions

- Node.js **22.22.2** used; supported project range 22.14–22.x; npm **11.1.0** used.
- Next.js **15.5.28** App Router, React **19.1.4**, TypeScript **5.9.3**, Tailwind **3.4.19**. Next 15 deliberately retains the required `frontend/middleware.ts` convention.
- NestJS **11.2.7**, Prisma/client **6.19.3**, PostgreSQL **17**.
- Jest **29**, Supertest and Playwright. Exact dependency versions are in the three package-lock files.
- Docker Desktop is optional if you supply separate local PostgreSQL development/test databases. Included Compose uses an isolated PostgreSQL container on **127.0.0.1:55432**, separate from any existing PostgreSQL service.
- Google Chrome for the browser suite, or set `UI_BROWSER_CHANNEL=msedge` for installed Microsoft Edge.

## Local setup

Run from the repository root in PowerShell:

```powershell
npm ci
npm ci --prefix backend
npm ci --prefix frontend
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
>>>>>>> 6383f51 (update the files for database connection)
