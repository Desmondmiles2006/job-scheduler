# Distributed Job Scheduler

A Postgres-only distributed job scheduling platform: no Redis, no external
broker. Queueing, locking, and scheduling state all live in Postgres, with
`FOR UPDATE SKIP LOCKED` providing atomic, concurrency-safe job claiming.

## Architecture

```
React Dashboard --> API Service (Express) --\
                                              >--> PostgreSQL <-- Worker Pool (N processes)
                     Scheduler Process ------/                        ^
                     (croner computes            leader election      |
                      next_run_at only)          via advisory lock    heartbeats/leases
```

- **API service** (`packages/api`) - auth, projects, queues, retry policies, jobs, scheduled (cron) jobs, dead-letter retry, worker monitoring. Stateless REST, JWT access tokens + rotating opaque refresh tokens.
- **Scheduler** (`packages/scheduler`) - owns `scheduled_jobs`. Uses `croner` purely to compute the next cron occurrence; a Postgres advisory lock ensures only one instance is ever "leader" even if you run several for HA. Enqueuing itself happens via `FOR UPDATE SKIP LOCKED` on the due row, so leader-election races can never double-enqueue.
- **Worker pool** (`packages/worker`) - polls queues, claims jobs atomically, executes via a pluggable handler registry, sends heartbeats, retries with backoff, moves permanent failures to the dead letter table.
- **Web dashboard** (`packages/web`) - React + Vite. Covers auth, projects, queues, job submission and explorer, recurring cron jobs, dead-letter retry, and worker fleet monitoring.

## Database & migrations

The schema lives in `packages/db/prisma/schema.prisma` (the canonical, readable
definition). The **worker** and **scheduler** packages talk to Postgres via raw
`pg` rather than Prisma Client, so the concurrency-critical logic (the
`SKIP LOCKED` claim query, the leader election, the cron tick) is exercised
directly against the database rather than through an ORM layer.

### Migration order and naming

Prisma migrations live in `packages/db/prisma/migrations/`, each in a folder
named `<timestamp>_<description>`. The timestamp fixes the apply order; the
description is a human label with no functional effect. They apply in order:

1. **`20260711000000_init`** - creates every table, index, and foreign key.
2. **`20260711075320_align_prisma_column_types`** - a Prisma-generated migration
   that aligns column types with what Prisma Client expects (`text` ids,
   `timestamp(3)` instead of `uuid` / `timestamptz`).
3. **`20260711080000_restore_db_id_defaults`** - restores the database-level
   `gen_random_uuid()` id defaults and `updated_at` defaults that step 2
   dropped. Prisma normally expects the application to supply those values, but
   since this project inserts via raw `pg` on several paths, the database needs
   to generate them. Prisma Client inserts still work (they supply their own
   values, which override the defaults), so this migration is safe either way.

If you add a migration later, let Prisma name it from the `--name` flag, e.g.
`npm run migrate --workspace=@job-scheduler/db -- --name add_job_dependencies`,
which produces a folder like `20260712101500_add_job_dependencies`. Use a short
snake_case verb phrase describing the change; don't rename a migration folder
once it has been applied to a shared database (Prisma tracks applied migrations
by folder name in the `_prisma_migrations` table).

**Everything ran and passed** against a real Postgres 16 instance: 74 tests
across the three backend packages, including a test that fires 10 concurrent
claimants at 100 seeded jobs and asserts zero duplicate claims.

## Prerequisites

- Node.js 20+
- PostgreSQL 16 (via Docker Compose, or a local install)

## Setup

```bash
npm install

# Start Postgres (creates both job_scheduler and job_scheduler_test databases)
docker compose up -d

# Apply all migrations via Prisma
npm run migrate --workspace=@job-scheduler/db
```

Copy each package's `.env.example` to `.env`:

```bash
cp packages/api/.env.example packages/api/.env
cp packages/worker/.env.example packages/worker/.env
cp packages/scheduler/.env.example packages/scheduler/.env
```

On native Windows (cmd/PowerShell, no `cp`), use `copy` instead:

```powershell
copy packages\api\.env.example packages\api\.env
copy packages\worker\.env.example packages\worker\.env
copy packages\scheduler\.env.example packages\scheduler\.env
```

Each `.env` needs both `DATABASE_URL` and `TEST_DATABASE_URL` - the test
suites deliberately refuse to run if `TEST_DATABASE_URL` is unset, rather
than silently falling back to the dev database and truncating it between
test runs. `docker compose up -d` creates both `job_scheduler` and
`job_scheduler_test` automatically (see `scripts/init-test-db.sql`).

### Applying migrations without Prisma (raw SQL)

`npm run migrate` above is the normal path. If you'd rather apply the raw SQL
directly and don't have `psql` installed on your host, run it through the
Postgres Docker container. Find the container name with `docker ps` (usually
`job-scheduler-postgres-1`), then pipe each migration file in order:

```powershell
docker exec -i job-scheduler-postgres-1 psql -U postgres -d job_scheduler < packages\db\prisma\migrations\20260711000000_init\migration.sql
docker exec -i job-scheduler-postgres-1 psql -U postgres -d job_scheduler < packages\db\prisma\migrations\20260711075320_align_prisma_column_types\migration.sql
docker exec -i job-scheduler-postgres-1 psql -U postgres -d job_scheduler < packages\db\prisma\migrations\20260711080000_restore_db_id_defaults\migration.sql
# repeat the three lines with -d job_scheduler_test for the test database
```

If you do have `psql` on your PATH (macOS/Linux, or Windows with the PostgreSQL
client installed), `scripts/migrate.sh` applies all three migrations to both
databases in one go:

```bash
./scripts/migrate.sh
```

## Running the services

```bash
npm run dev:api        # http://localhost:3000
npm run dev:worker
npm run dev:scheduler
npm run dev:web         # http://localhost:5173, proxies /api to the API service
```

## Running tests

Each backend package's tests run against `TEST_DATABASE_URL` (a real
Postgres database, truncated between tests - not mocked):

```bash
npm run test --workspace=@job-scheduler/api
npm run test --workspace=@job-scheduler/worker
npm run test --workspace=@job-scheduler/scheduler
```

What's covered:
- **worker**: atomic claiming under concurrency (the core reliability
  guarantee), lease expiry/reaping after a simulated worker crash, retry
  backoff math for all three strategies, dead-letter transition.
- **scheduler**: due/not-due/disabled scheduled jobs, `next_run_at`
  advancement, double-tick and concurrent-tick safety (`SKIP LOCKED` on
  `scheduled_jobs`), leader election under concurrent instances.
- **api**: full auth flow (register/login/refresh rotation/logout, including
  refresh-token reuse rejection), project + queue + retry-policy + job +
  scheduled-job + dead-letter-queue CRUD, keyset pagination, cross-tenant
  isolation (org A can never see org B's projects/queues/jobs), retry-policy
  inheritance (explicit `maxAttempts` overrides an explicit `retryPolicyId`
  overrides the queue's default), immediate vs delayed job status placement,
  batch job creation, execution/log retrieval, job cancellation rules, and
  DLQ retry (both when the original job row still exists and when it's been
  purged - the `original_job_id ON DELETE SET NULL` case).

Total: 74 tests across the three backend packages, all passing against a
real Postgres instance.

## API overview

All routes except `/api/auth/*` require `Authorization: Bearer <accessToken>`.

```
POST   /api/auth/register          { orgName, name, email, password }
POST   /api/auth/login             { email, password }
POST   /api/auth/refresh           { refreshToken }
POST   /api/auth/logout            { refreshToken }

POST   /api/projects               { name }
GET    /api/projects               ?cursor=&limit=&name=
GET    /api/projects/:id
PATCH  /api/projects/:id           { name }
DELETE /api/projects/:id           (soft delete)

POST   /api/projects/:id/queues              { name, priority?, maxConcurrency?, defaultRetryPolicyId? }
GET    /api/projects/:id/queues              ?cursor=&limit=&isPaused=
GET    /api/projects/:id/queues/:queueId
PATCH  /api/projects/:id/queues/:queueId     { name?, priority?, maxConcurrency?, isPaused?, defaultRetryPolicyId? }
DELETE /api/projects/:id/queues/:queueId

POST   /api/projects/:id/retry-policies      { name, strategy, baseDelayMs, maxDelayMs, maxAttempts, multiplier? }
GET    /api/projects/:id/retry-policies

POST   /api/projects/:id/queues/:queueId/jobs                { type, payload, runAt?, maxAttempts?, retryPolicyId?, priority? }
POST   /api/projects/:id/queues/:queueId/jobs/batch           { jobs: [ {type, payload, runAt?}, ... ] }  (max 500)
GET    /api/projects/:id/queues/:queueId/jobs                 ?cursor=&limit=&status=&type=
GET    /api/projects/:id/queues/:queueId/jobs/:jobId
GET    /api/projects/:id/queues/:queueId/jobs/:jobId/executions
GET    /api/projects/:id/queues/:queueId/jobs/:jobId/executions/:executionId/logs
POST   /api/projects/:id/queues/:queueId/jobs/:jobId/cancel   (only while QUEUED or SCHEDULED)

POST   /api/projects/:id/queues/:queueId/scheduled-jobs       { name, cronExpression, timezone?, jobType, payloadTemplate }
GET    /api/projects/:id/queues/:queueId/scheduled-jobs
PATCH  /api/projects/:id/queues/:queueId/scheduled-jobs/:id   { name?, cronExpression?, timezone?, isEnabled? }
DELETE /api/projects/:id/queues/:queueId/scheduled-jobs/:id

GET    /api/projects/:id/dead-letter-jobs                     ?cursor=&limit=
POST   /api/projects/:id/dead-letter-jobs/:dlqId/retry

GET    /api/workers                        (fleet status - not org-scoped, see note below)
GET    /api/workers/:workerId/heartbeats
```

A design note on `/api/workers`: workers aren't a tenant-owned resource in this
schema (a worker process can pull jobs from any queue, for any org, depending
on deployment config) - it's operational/infrastructure visibility, not
tenant data, so it isn't scoped to the caller's org the way projects/queues
are. Any authenticated user can see fleet health. If you wanted per-tenant
worker pools later, that would need a join table (`worker_queue_assignments`
or similar) rather than a column on `workers` directly, since one worker can
legitimately serve multiple queues/orgs.

Errors are always `{ "error": { "code": "...", "message": "...", "details"?: ... } }`
with an appropriate HTTP status (400 validation, 401 auth, 403 forbidden, 404
not found, 409 conflict, 500 unexpected).

## What's next

Covered so far: auth, project/queue/retry-policy management, job submission
(immediate/delayed/batch), the job explorer (list/detail/executions/logs),
recurring cron jobs, dead-letter retry, and worker fleet monitoring - both
API and dashboard UI.

Remaining, in rough priority order: WebSocket live updates (the dashboard
currently polls on load / every 10s for workers rather than pushing changes),
queue-level throughput/health metrics and charts, RBAC beyond the single
OWNER role created at registration, and the bonus features (workflow
dependencies between jobs, distributed rate limiting, queue sharding).
