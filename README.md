# Agency OS Client Hub

A standalone client operating, communication and requirement management hub built with Next.js, NestJS and PostgreSQL. It supports client workspaces, structured requirements, review and confirmation, manual communication, internal notes, private files and activity history.

## Prerequisites and installation

- **Node.js 22.14–22.x**; verified with Node.js 22.22.2 and npm 11.21.0.
- **Docker Desktop with Docker Compose**, or an existing **PostgreSQL 17** server.

Open PowerShell in the project root, containing `frontend/`, `backend/` and `compose.yaml`. Run all commands from this folder.

Install the locked dependencies:

```powershell
npm ci --no-audit --no-fund
npm ci --prefix backend --no-audit --no-fund
npm ci --prefix frontend --no-audit --no-fund
```

## Environment configuration

Generate the local configuration:

```powershell
node scripts/setup-local.mjs
```

| File                  | Purpose                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `.env`                | PostgreSQL container password                                                  |
| `backend/.env`        | Database connection, JWT settings, demo accounts, API port and private storage |
| `frontend/.env.local` | Internal API URL and frontend origin                                           |

The script generates random credentials and preserves existing configuration. If any of these files already exists, it leaves all configuration unchanged. Complete missing files from their `.env.example` files when needed.

Default settings:

- Backend: `http://127.0.0.1:5000/api`
- Frontend: `http://localhost:3000`
- `API_INTERNAL_URL=http://127.0.0.1:5000/api`
- `APP_ORIGIN=http://localhost:3000`
- `FRONTEND_URL=http://localhost:3000`

Keep database passwords, JWT secrets and demo passwords in the local environment files.

## PostgreSQL setup and migrations

Open Docker Desktop and wait until it is running:

```powershell
docker compose up -d
docker compose ps
```

Wait for PostgreSQL to become healthy. The included database is `agencyos_hub`, with user `agencyos`, on `127.0.0.1:55432`. Its password comes from the root `.env`, and data persists in a named volume.

For an existing PostgreSQL 17 server, create a dedicated database and configure `DATABASE_URL` in `backend/.env` instead of starting Compose.

Generate Prisma Client and apply the committed migrations:

```powershell
npm run prisma:generate --prefix backend
npm run db:migrate --prefix backend
```

Migrations preserve existing data; no database reset is required.

## Seed/demo data and login

The generated `backend/.env` enables local demo authentication with `NODE_ENV=development` and `DEMO_AUTH_ENABLED=true`. Demo authentication is disabled for production.

After applying migrations:

```powershell
npm run db:seed --prefix backend
```

This adds fictional sample data to PostgreSQL: two isolated agencies, clients, draft/confirmed requirements, ordered items, notes, manual communication, references and activity. Existing records and confirmed history are preserved.

Use credentials from `backend/.env` to sign in:

| Credentials                                        | Sample clients                            |
| -------------------------------------------------- | ----------------------------------------- |
| `DEMO_EMAIL` / `DEMO_PASSWORD`                     | Ceylon Craft Studio; Northline Consulting |
| `DEMO_SECONDARY_EMAIL` / `DEMO_SECONDARY_PASSWORD` | Harbor Research Studio                    |

Passwords are generated locally and are not included in this README.

## Backend/frontend run and stop commands

Open two PowerShell terminals in the project root.

**Terminal 1 — backend:**

```powershell
npm run dev --prefix backend
```

**Terminal 2 — frontend:**

```powershell
npm run dev --prefix frontend
```

Once both applications are ready, open **http://localhost:3000** and sign in with a seeded account.

For subsequent starts, start Docker Desktop, run `docker compose up -d`, then run the two application commands above.

Press **Ctrl+C** in each terminal to stop the applications. Stop PostgreSQL while retaining its data with:

```powershell
docker compose stop
```
