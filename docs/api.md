# API Reference

Base URL (dev): `http://localhost:3000`

All routes except `/api/auth/*` require an `Authorization: Bearer <accessToken>`
header. Requests and responses are JSON.

## Conventions

**Error shape** — every error response has the form:

```json
{ "error": { "code": "STRING_CODE", "message": "Human readable", "details": {} } }
```

`details` is present only for validation errors. Status codes used:

| Status | Meaning |
|---|---|
| 400 | Validation error / invalid request |
| 401 | Missing, invalid, or expired token |
| 403 | Authenticated but not permitted |
| 404 | Resource not found (also returned for cross-tenant access) |
| 409 | Conflict (e.g. duplicate name or email) |
| 500 | Unexpected server error |

**Pagination** — list endpoints that paginate accept `?cursor=&limit=` and
return `{ "items": [...], "nextCursor": "opaque-string-or-null" }`. Pass the
returned `nextCursor` back as `?cursor=` to fetch the next page. `limit`
defaults to 20, max 100.

---

## Auth

### POST /api/auth/register
Creates a new organization and an owner user. No auth required.

Request:
```json
{ "orgName": "Acme Inc", "name": "Alice", "email": "alice@acme.com", "password": "min-8-chars" }
```
Response `201`:
```json
{ "user": { "id", "orgId", "email", "name", "role": "OWNER" }, "accessToken": "...", "refreshToken": "..." }
```
Errors: `400` invalid payload, `409` email already registered.

### POST /api/auth/login
Request: `{ "email", "password" }` · Response `200`: same shape as register.
Errors: `401` invalid credentials.

### POST /api/auth/refresh
Rotates the refresh token: revokes the one supplied and issues a new pair.
Request: `{ "refreshToken" }` · Response `200`: same shape as register.
Errors: `401` if the token is unknown, expired, revoked, or already rotated
(reuse detection).

### POST /api/auth/logout
Requires auth. Revokes the given refresh token.
Request: `{ "refreshToken" }` · Response `204` (no body).

---

## Projects

### POST /api/projects
Request: `{ "name" }` · Response `201`: the project.
Errors: `409` duplicate name within the org.

### GET /api/projects
Query: `?cursor=&limit=&name=` (`name` filters by substring). Paginated.

### GET /api/projects/:projectId
Response `200`: the project. `404` if not found or not in the caller's org.

### PATCH /api/projects/:projectId
Request: `{ "name?" }` · Response `200`: the updated project.

### DELETE /api/projects/:projectId
Soft delete. Response `204`. Subsequent GETs return `404`.

---

## Retry policies

### POST /api/projects/:projectId/retry-policies
Request:
```json
{ "name", "strategy": "FIXED|LINEAR|EXPONENTIAL", "baseDelayMs", "maxDelayMs", "maxAttempts", "multiplier?" }
```
Response `201`: the retry policy.

### GET /api/projects/:projectId/retry-policies
Response `200`: `{ "items": [ ... ] }`.

---

## Queues

### POST /api/projects/:projectId/queues
Request:
```json
{ "name", "priority?": 0, "maxConcurrency?": 5, "defaultRetryPolicyId?" }
```
Response `201`: the queue.

### GET /api/projects/:projectId/queues
Query: `?cursor=&limit=&isPaused=`. Paginated.

### GET /api/projects/:projectId/queues/:queueId
Response `200`: the queue.

### PATCH /api/projects/:projectId/queues/:queueId
Request: `{ "name?", "priority?", "maxConcurrency?", "isPaused?", "defaultRetryPolicyId?" }`.
Pausing a queue (`isPaused: true`) stops workers from claiming its jobs.

### DELETE /api/projects/:projectId/queues/:queueId
Response `204`.

---

## Jobs

Scoped to a queue. A job's status begins as `QUEUED` (if it should run now) or
`SCHEDULED` (if `runAt` is in the future).

### POST /api/projects/:projectId/queues/:queueId/jobs
Request:
```json
{ "type", "payload": {}, "runAt?": "ISO-8601", "maxAttempts?", "retryPolicyId?", "priority?": 0, "idempotencyKey?" }
```
Response `201`: the job. Retry config is resolved and snapshotted at creation
(explicit `maxAttempts` > explicit `retryPolicyId` > queue default > 1 attempt).

### POST /api/projects/:projectId/queues/:queueId/jobs/batch
Request: `{ "jobs": [ { ...same as above... }, ... ] }` (1–500 jobs). Inserted
in a single transaction. Response `201`: `{ "items": [ ... ] }`.

### GET /api/projects/:projectId/queues/:queueId/jobs
Query: `?cursor=&limit=&status=&type=`. Paginated. `status` is one of
`QUEUED, SCHEDULED, CLAIMED, RUNNING, COMPLETED, FAILED, DEAD_LETTER, CANCELLED`.

### GET /api/projects/:projectId/queues/:queueId/jobs/:jobId
Response `200`: the job.

### GET /api/projects/:projectId/queues/:queueId/jobs/:jobId/executions
Response `200`: `{ "items": [ ... ] }` — one entry per attempt, ordered by
attempt number.

### GET /api/projects/:projectId/queues/:queueId/jobs/:jobId/executions/:executionId/logs
Response `200`: `{ "items": [ { "level", "message", "loggedAt" }, ... ] }`.

### POST /api/projects/:projectId/queues/:queueId/jobs/:jobId/cancel
Cancels a job that hasn't started. Response `200`: the cancelled job.
Errors: `400` if the job is already running or finished.

---

## Scheduled (recurring cron) jobs

Scoped to a queue. The API computes the initial `nextRunAt` from the cron
expression; the scheduler process advances it thereafter.

### POST /api/projects/:projectId/queues/:queueId/scheduled-jobs
Request:
```json
{ "name", "cronExpression", "timezone?": "UTC", "jobType", "payloadTemplate": {} }
```
Response `201`: the scheduled job (includes computed `nextRunAt`).
Errors: `400` invalid cron expression.

### GET /api/projects/:projectId/queues/:queueId/scheduled-jobs
Response `200`: `{ "items": [ ... ] }`.

### PATCH /api/projects/:projectId/queues/:queueId/scheduled-jobs/:scheduledJobId
Request: `{ "name?", "cronExpression?", "timezone?", "isEnabled?" }`.
Changing the cron expression or timezone recomputes `nextRunAt`; toggling
`isEnabled` does not.

### DELETE /api/projects/:projectId/queues/:queueId/scheduled-jobs/:scheduledJobId
Response `204`.

---

## Dead letter queue

Scoped to a project (spans all its queues).

### GET /api/projects/:projectId/dead-letter-jobs
Query: `?cursor=&limit=`. Paginated. Each entry includes `jobType`, `payload`,
`failureReason`, `attempts`, `movedAt`.

### POST /api/projects/:projectId/dead-letter-jobs/:dlqId/retry
Requeues the job. If the original job row still exists it is reset in place
(attempts back to 0, status `QUEUED`); otherwise a fresh job is created from the
DLQ entry's stored snapshot. The DLQ entry is removed. Response `200`:
`{ "jobId": "..." }`.

---

## Workers

Fleet-wide operational visibility. Requires auth but is **not** organization-
scoped (workers are shared infrastructure).

### GET /api/workers
Response `200`: `{ "items": [ { "id", "hostname", "pid", "status", "startedAt", "lastSeenAt", "isOnline" }, ... ] }`.
`isOnline` is derived from heartbeat recency.

### GET /api/workers/:workerId/heartbeats
Response `200`: `{ "items": [ { "heartbeatAt", "currentJobId" }, ... ] }` — most
recent first.

---

## Health

### GET /health
No auth. Response `200`: `{ "status": "ok" }`.
