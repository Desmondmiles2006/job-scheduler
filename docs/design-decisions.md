# Design Decisions

This document records the major architectural and data-model decisions, and the
trade-offs behind each. The theme throughout is favoring correctness,
operational simplicity, and consistency over raw throughput or feature count.

## PostgreSQL only — no Redis, no broker

**Decision:** Use PostgreSQL as the single stateful component. All queueing,
locking, scheduling state, and business data live in one database.

**Trade-off:** A dedicated broker (Redis, RabbitMQ, Kafka) would offer a higher
raw throughput ceiling and built-in pub/sub. Postgres-only gives that up in
exchange for:

- Transactional consistency between job state and business data — enqueuing a
  job and updating related rows can happen in one transaction.
- One fewer system to deploy, monitor, back up, and secure.
- Concurrency-safe dequeuing via `SKIP LOCKED` without any external lock
  manager.

## Atomic claiming via `SELECT ... FOR UPDATE SKIP LOCKED`

**Decision:** Workers claim jobs with a single statement that selects candidate
rows `FOR UPDATE SKIP LOCKED` and updates them to `CLAIMED` in the same CTE.

**Why:** If claiming were a separate `SELECT` then `UPDATE`, two workers could
read the same row before either wrote to it, causing duplicate execution.
Combining them into one statement closes that gap. `SKIP LOCKED` means
concurrent workers never block on each other — a worker simply skips rows
another worker already holds and moves to the next candidate.

**Verified:** A test fires 10 concurrent claimants at 100 seeded jobs and
asserts every job is claimed exactly once, with zero duplicates.

## Leader election for the scheduler via advisory locks

**Decision:** Scheduler instances contend for a Postgres session-level advisory
lock; only the holder does work. The enqueue step additionally uses
`FOR UPDATE SKIP LOCKED` on due `scheduled_jobs` rows.

**Why:** This allows running multiple scheduler instances for high availability
without double-firing cron jobs. Advisory locks release automatically if the
holding connection drops, so a crashed leader can't wedge the system. The
row-level lock on the enqueue is defense in depth: even a momentary
leader-election overlap can't enqueue the same scheduled run twice.

## Retry policy fields snapshotted onto jobs at creation

**Decision:** When a job is created, its effective `max_attempts` and
`retry_policy_id` are written onto the job row, rather than always read live
from the policy table at retry time.

**Why:** If retry behavior were read live, editing a policy would retroactively
change the behavior of jobs already queued or mid-retry — surprising and hard to
reason about. Snapshotting makes a job's retry behavior fixed at submission
time. The resolution order is: an explicit `maxAttempts` on the request wins,
then an explicit `retryPolicyId`, then the queue's default policy, then a
fallback of a single attempt (no retries).

## Dead letter queue as a separate table

**Decision:** Permanently failed jobs move to a dedicated `dead_letter_jobs`
table rather than being marked with a `jobs.status = 'DEAD_LETTER'` flag alone.

**Why:**
- Keeps the hot `jobs` table and its indexes lean — dead jobs are a permanent
  tail, not part of the active working set.
- The DLQ row carries its own copy of the payload, job type, and failure
  reason, so it remains meaningful even if the original job row is later
  archived or purged.

## `ON DELETE SET NULL` on `dead_letter_jobs.original_job_id`

**Decision:** The FK from a DLQ entry back to its originating job is
`ON DELETE SET NULL`, not `CASCADE`.

**Why:** DLQ entries must outlive job cleanup. If old `jobs` rows are purged for
table maintenance, the DLQ history should survive — the entry keeps its own
payload snapshot and simply loses the back-reference. The retry logic handles
both cases: if the original job still exists it's reset in place; if it's gone,
a fresh job is created from the DLQ's snapshot.

## Keyset pagination over OFFSET

**Decision:** List endpoints paginate with a keyset cursor
(`WHERE (created_at, id) < (cursor) ORDER BY created_at DESC, id DESC LIMIT n`),
not `LIMIT/OFFSET`.

**Why:** `OFFSET` degrades linearly as the offset grows — the database must
scan and discard all skipped rows. Keyset pagination stays fast regardless of
how deep into the list you page.

## Soft deletes for projects

**Decision:** Projects are soft-deleted (`deleted_at` timestamp) rather than
hard-removed; the FK from projects to organizations is `RESTRICT`.

**Why:** Projects own queues, jobs, and history; a hard delete would cascade
destruction across a lot of operational data. A soft delete hides the project
from normal queries while preserving the underlying records.

## Auth: JWT access tokens + rotating opaque refresh tokens

**Decision:** Short-lived JWT access tokens plus long-lived, DB-backed refresh
tokens. Refresh tokens are opaque random strings; only their SHA-256 hash is
stored. On refresh, the used token is revoked and a new one issued (rotation).

**Why:** Stateless access tokens keep the API horizontally scalable, while
DB-backed refresh tokens remain revocable. Storing only the hash means a
database leak doesn't hand out usable sessions. Rotation plus reuse-detection
catches a stolen-and-replayed refresh token: the legitimate client already
rotated it, so the replayed token shows as revoked and is rejected.

## Worker fleet endpoint is not tenant-scoped

**Decision:** `/api/workers` returns fleet status to any authenticated user and
is not filtered by organization.

**Why:** Workers are shared infrastructure — a worker process can pull jobs from
any queue for any org depending on deployment configuration. Worker status is
operational visibility, not tenant-owned data. If per-tenant worker pools were
ever needed, that would call for a `worker_queue_assignments` join table rather
than a column on `workers`, since one worker can legitimately serve multiple
queues.

## Migration strategy, and a real drift problem that took two fixes

**Decision:** The schema is defined in `schema.prisma` as the canonical
reference, but the worker and scheduler use raw `pg` on the
concurrency-critical paths — which depend on the database generating IDs
(`gen_random_uuid()`) and `updated_at` timestamps on insert, since not every
raw insert supplies them explicitly.

**What went wrong, twice:** `schema.prisma` originally declared id fields with
`@default(uuid())` and `updatedAt` with `@updatedAt` — both of which Prisma
treats as *application-level* defaults (Prisma Client generates the value
before sending the query), not database-level ones. Every time
`prisma migrate dev` ran, Prisma compared its own understanding of the schema
against the live database, saw the database's `DEFAULT gen_random_uuid()` /
`DEFAULT now()` as unexpected drift it didn't ask for, and generated a
migration to strip them. This happened twice across the project's history
(migrations `20260711075320` and `20260711171009`), each time breaking raw
`pg` inserts (worker registration, job creation, user registration) with a
null-constraint violation until manually patched back.

**The permanent fix:** `schema.prisma` now declares these fields as
`@default(dbgenerated("gen_random_uuid()"))` and
`@default(dbgenerated("now()"))` instead. This tells Prisma the database-level
default **is** the intended, desired state — not drift to correct — so future
`prisma migrate dev` runs no longer see a diff on these columns and won't
regenerate a migration that removes them. This is the standard, documented
Prisma pattern for exactly this situation: a database-native default that
Prisma's own generators can't express any other way.

**Why this is worth documenting rather than hiding:** it's a genuine example of
diagnosing a recurring bug to its actual root cause (a schema declaration
mismatched with how the application really uses the database) rather than
patching the symptom a third time.
