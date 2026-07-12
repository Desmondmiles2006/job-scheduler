# Distributed Job Scheduler

A Postgres-only distributed job scheduling platform: no Redis, no external
broker. Queueing, locking, and scheduling state all live in Postgres, with
`FOR UPDATE SKIP LOCKED` providing atomic, concurrency-safe job claiming.

## What this is

Submit jobs (immediate, delayed, batch, or recurring via cron) to a queue.
A pool of worker processes claims and executes them concurrently, with
automatic retries (fixed / linear / exponential backoff) and a dead letter
queue for permanent failures. A React dashboard shows queue health, job
status, worker fleet status, and throughput - both org-wide and per-queue.

## Architecture

```
React Dashboard --> API Service (Express) --\
                                              >--> PostgreSQL <-- Worker Pool (N processes)
                     Scheduler Process ------/                        ^
                     (croner computes            leader election      |
                      next_run_at only)          via advisory lock    heartbeats/leases
```

- **API service** (`packages/api`) - auth, projects, queues, retry policies,
  jobs, recurring (cron) jobs, dead-letter retry, worker fleet monitoring,
  and an org-wide dashboard summary + per-queue stats. Stateless REST, JWT
  access tokens + rotating opaque refresh tokens.
- **Scheduler** (`packages/scheduler`) - owns `scheduled_jobs`. Uses `croner`
  purely to compute the next cron occurrence; a Postgres advisory lock
  ensures only one instance is ever "leader" even if you run several for HA.
- **Worker pool** (`packages/worker`) - polls queues, claims jobs atomically,
  executes via a pluggable handler registry, sends heartbeats, retries with
  backoff, moves permanent failures to the dead letter table.
- **Web dashboard** (`packages/web`) - React + Vite. Auth, projects, queues
  (with job submission - immediate/delayed/batch, and recurring schedules
  via a simple "every N minutes/hours/days" input or raw cron), a job
  explorer with a visual lifecycle pipeline and live countdown timers,
  dead-letter retry, worker fleet + heartbeat history, standalone retry
  policy management, and a dashboard home page with org-wide stats and a
  throughput chart.

See `docs/architecture.md` for the full breakdown and `docs/api.md` for
every endpoint.

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres)

## Setup (5 steps)

**1. Install dependencies**
```bash
npm install
```

**2. Start Postgres**
```bash
docker compose up -d
```
This creates both `job_scheduler` and `job_scheduler_test` databases.

**3. Copy environment files**
```bash
cp packages/db/.env.example packages/db/.env
cp packages/api/.env.example packages/api/.env
cp packages/worker/.env.example packages/worker/.env
cp packages/scheduler/.env.example packages/scheduler/.env
```
On native Windows (no `cp`), use `copy` instead of `cp` in each line above.
`packages/db/.env` is what `prisma migrate dev` reads `DATABASE_URL` from in
the next step - it's easy to miss since it's a separate file from the other
three.

**4. Apply database migrations**
```bash
npm run migrate --workspace=@job-scheduler/db
```
See "Database & migrations" below if this doesn't work in your environment
(e.g. no network access to Prisma's engine download) - there's a raw-SQL
fallback.

**5. Run everything**
```bash
npm run dev
```
This starts the API (port 3000), worker, scheduler, and web dashboard
(port 5173) together in one terminal, color-labeled by service. Open
`http://localhost:5173`, register an account, and you're in.

To run any service on its own instead: `npm run dev:api`, `npm run dev:worker`,
`npm run dev:scheduler`, `npm run dev:web`.

## Running tests

```bash
npm run test --workspace=@job-scheduler/api
npm run test --workspace=@job-scheduler/worker
npm run test --workspace=@job-scheduler/scheduler
npm run test --workspace=@job-scheduler/web
```

All backend tests run against a real Postgres database (`TEST_DATABASE_URL`
in each `.env`), not mocks. Current count: **83 backend tests** (62 api + 13
worker + 8 scheduler) plus 9 frontend unit tests for the cron-interval
conversion logic - all passing.

## Database & migrations

The schema lives in `packages/db/prisma/schema.prisma`. The **worker** and
**scheduler** packages talk to Postgres via raw `pg` rather than Prisma
Client, so the concurrency-critical logic (the `SKIP LOCKED` claim query, the
leader election, the cron tick) is exercised directly against the database.

There are five migrations, applied in order:

1. **`20260711000000_init`** - creates every table, index, and foreign key.
2. **`20260711075320_align_prisma_column_types`** - a Prisma-generated
   migration aligning column types with Prisma Client's conventions (`text`
   ids, `timestamp(3)`).
3. **`20260711080000_restore_db_id_defaults`** - restores database-level
   `gen_random_uuid()` / `now()` defaults that step 2 dropped, needed because
   this project inserts rows via raw `pg` in several places.
4. **`20260711171009_11_07_2026`** - an auto-generated Prisma migration that
   **dropped those same defaults again**. This happened because
   `schema.prisma` declared ids with `@default(uuid())` and `updatedAt` with
   `@updatedAt` - both application-level defaults from Prisma's point of
   view - so Prisma kept seeing the database's real defaults as unwanted
   drift and removing them on every `prisma migrate dev` run.
5. **`20260712000000_permanently_restore_db_defaults`** - restores the
   defaults a second time, but this time `schema.prisma` was also updated to
   declare them as `@default(dbgenerated("gen_random_uuid()"))` and
   `@default(dbgenerated("now()"))`. This tells Prisma the database-level
   default **is** the intended state, so future `prisma migrate dev` runs
   will no longer see a diff here and won't regenerate a migration that
   strips it again. This is the permanent fix - if you add new tables/fields
   later, running `prisma migrate dev` should no longer touch `id` or
   `updated_at` on existing tables.

If `npm run migrate` fails because you don't have network access to fetch
Prisma's migration engine, apply the raw SQL directly instead - either via
`./scripts/migrate.sh` (bash-capable shells), or by piping each file through
your Postgres container in order:

```powershell
docker exec -i job-scheduler-postgres-1 psql -U postgres -d job_scheduler < packages\db\prisma\migrations\20260711000000_init\migration.sql
docker exec -i job-scheduler-postgres-1 psql -U postgres -d job_scheduler < packages\db\prisma\migrations\20260711075320_align_prisma_column_types\migration.sql
docker exec -i job-scheduler-postgres-1 psql -U postgres -d job_scheduler < packages\db\prisma\migrations\20260711080000_restore_db_id_defaults\migration.sql
docker exec -i job-scheduler-postgres-1 psql -U postgres -d job_scheduler < packages\db\prisma\migrations\20260711171009_11_07_2026\migration.sql
docker exec -i job-scheduler-postgres-1 psql -U postgres -d job_scheduler < packages\db\prisma\migrations\20260712000000_permanently_restore_db_defaults\migration.sql
```
(Repeat with `-d job_scheduler_test` for the test database.)

## Viewing the database directly

Easiest option - Prisma Studio:
```bash
npm run studio --workspace=@job-scheduler/db
```
Opens a browser table view at `http://localhost:5555`. Or use any Postgres
GUI client (TablePlus, DBeaver, pgAdmin) with `localhost:5432`,
user/password `postgres`, database `job_scheduler`.

## API overview

All routes except `/api/auth/*` require `Authorization: Bearer <accessToken>`.
Full detail with request/response shapes is in `docs/api.md`. Route groups:

```
/api/auth/*                                          register, login, refresh, logout
/api/projects, /api/projects/:id                      project CRUD
/api/projects/:id/retry-policies                      retry policy CRUD
/api/projects/:id/queues, .../:queueId                 queue CRUD
/api/projects/:id/queues/:queueId/stats                per-queue status counts + 24h throughput
/api/projects/:id/queues/:queueId/jobs                 job submission (immediate/delayed/batch) + explorer
/api/projects/:id/queues/:queueId/scheduled-jobs       recurring (cron) job definitions
/api/projects/:id/dead-letter-jobs                     list + retry permanently failed jobs
/api/workers, /api/workers/:id/heartbeats              worker fleet monitoring (not org-scoped - see docs/api.md)
/api/dashboard/summary                                 org-wide stats: status counts, workers online/offline,
                                                         24h throughput, recent dead-letter entries
```

Errors are always `{ "error": { "code", "message", "details"? } }` with the
appropriate HTTP status (400 validation, 401 auth, 403 forbidden, 404 not
found, 409 conflict, 500 unexpected).

## Documentation

- `docs/architecture.md` - component responsibilities, the cron/queue
  division of labor, full architecture diagram
- `docs/er-diagram.md` - entity-relationship diagram, keys, indexes, cascade
  behavior, normalization notes
- `docs/design-decisions.md` - the trade-offs behind every major choice
- `docs/api.md` - complete endpoint reference

## What's implemented vs. the assignment brief

Covered: auth + org/project management, queue configuration (priority,
concurrency, retry policy, pause/resume, statistics), job creation
(immediate/delayed/batch/recurring), the full lifecycle with retries and
DLQ, all three retry strategies, execution logs/history/timestamps, a
dashboard covering queues/jobs/workers/DLQ retry with throughput
visualization, REST APIs with validation/auth/pagination/filtering/
structured errors, and atomic concurrency-safe job claiming.

Not implemented (all listed in the brief as bonus/optional): workflow
dependencies between jobs, rate limiting, queue sharding, event-driven
execution, WebSocket live updates (the dashboard polls instead, which the
brief explicitly allows), RBAC beyond a single OWNER role, AI-generated
failure summaries.
