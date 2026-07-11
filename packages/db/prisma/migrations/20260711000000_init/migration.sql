-- Enable gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enums ───────────────────────────────────────────────────
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "RetryStrategy" AS ENUM ('FIXED', 'LINEAR', 'EXPONENTIAL');
CREATE TYPE "JobStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');
CREATE TYPE "ExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');
CREATE TYPE "WorkerStatus" AS ENUM ('IDLE', 'BUSY', 'DRAINING', 'OFFLINE');

-- ── Tenancy & auth ──────────────────────────────────────────
CREATE TABLE organizations (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    name          text NOT NULL,
    role          "UserRole" NOT NULL DEFAULT 'MEMBER',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_org_id ON users(org_id);

CREATE TABLE refresh_tokens (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- ── Projects, queues, retry policies ────────────────────────
CREATE TABLE projects (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name       text NOT NULL,
    created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (org_id, name)
);
CREATE INDEX idx_projects_org_id ON projects(org_id);

CREATE TABLE retry_policies (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name          text NOT NULL,
    strategy      "RetryStrategy" NOT NULL,
    base_delay_ms integer NOT NULL,
    max_delay_ms  integer NOT NULL,
    max_attempts  integer NOT NULL,
    multiplier    double precision NOT NULL DEFAULT 2.0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);
CREATE INDEX idx_retry_policies_project_id ON retry_policies(project_id);

CREATE TABLE queues (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id              uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name                    text NOT NULL,
    priority                integer NOT NULL DEFAULT 0,
    max_concurrency         integer NOT NULL DEFAULT 5,
    is_paused               boolean NOT NULL DEFAULT false,
    default_retry_policy_id uuid REFERENCES retry_policies(id) ON DELETE SET NULL,
    created_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);
CREATE INDEX idx_queues_project_id ON queues(project_id);

-- ── Workers (created before jobs since jobs.claimed_by references it) ──
CREATE TABLE workers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hostname     text NOT NULL,
    pid          integer NOT NULL,
    status       "WorkerStatus" NOT NULL DEFAULT 'IDLE',
    started_at   timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_workers_last_seen_at ON workers(last_seen_at);

-- ── Scheduled jobs (created before jobs since jobs.scheduled_job_id references it) ──
CREATE TABLE scheduled_jobs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id         uuid NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    name             text NOT NULL,
    cron_expression  text NOT NULL,
    timezone         text NOT NULL DEFAULT 'UTC',
    job_type         text NOT NULL,
    payload_template jsonb NOT NULL,
    is_enabled       boolean NOT NULL DEFAULT true,
    next_run_at      timestamptz NOT NULL,
    last_run_at      timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (queue_id, name)
);
CREATE INDEX idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at, is_enabled);

-- ── Jobs ─────────────────────────────────────────────────────
CREATE TABLE jobs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id         uuid NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    type             text NOT NULL,
    payload          jsonb NOT NULL,
    status           "JobStatus" NOT NULL DEFAULT 'QUEUED',
    priority         integer NOT NULL DEFAULT 0,
    run_at           timestamptz NOT NULL DEFAULT now(),
    attempts         integer NOT NULL DEFAULT 0,
    max_attempts     integer NOT NULL,
    retry_policy_id  uuid REFERENCES retry_policies(id) ON DELETE SET NULL,
    claimed_by       uuid REFERENCES workers(id) ON DELETE SET NULL,
    claimed_at       timestamptz,
    locked_until     timestamptz,
    idempotency_key  text,
    scheduled_job_id uuid REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (queue_id, idempotency_key)
);

-- Hot path index for the atomic claim query: workers filter on
-- (queue_id, status, run_at) and this is scoped to a small partial set
-- (queued/scheduled rows only), keeping the index tiny relative to the
-- full jobs table even at high volume.
CREATE INDEX idx_jobs_claim_candidates ON jobs(queue_id, priority DESC, run_at)
    WHERE status IN ('QUEUED', 'SCHEDULED');

-- Reaper index: find claimed/running jobs whose lease has expired.
CREATE INDEX idx_jobs_lease_expiry ON jobs(claimed_by, locked_until)
    WHERE status IN ('CLAIMED', 'RUNNING');

CREATE INDEX idx_jobs_queue_status_runat ON jobs(queue_id, status, run_at);

-- ── Job executions & logs ────────────────────────────────────
CREATE TABLE job_executions (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id         uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    worker_id      uuid REFERENCES workers(id) ON DELETE SET NULL,
    attempt_number integer NOT NULL,
    status         "ExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    started_at     timestamptz NOT NULL DEFAULT now(),
    finished_at    timestamptz,
    error_message  text,
    result         jsonb
);
CREATE INDEX idx_job_executions_job_id ON job_executions(job_id);
CREATE INDEX idx_job_executions_worker_id ON job_executions(worker_id);

CREATE TABLE job_logs (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_execution_id  uuid NOT NULL REFERENCES job_executions(id) ON DELETE CASCADE,
    level             "LogLevel" NOT NULL DEFAULT 'INFO',
    message           text NOT NULL,
    logged_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_job_logs_execution_id_logged_at ON job_logs(job_execution_id, logged_at);

-- ── Worker heartbeats ─────────────────────────────────────────
CREATE TABLE worker_heartbeats (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id      uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    heartbeat_at   timestamptz NOT NULL DEFAULT now(),
    current_job_id uuid
);
CREATE INDEX idx_worker_heartbeats_worker_id_at ON worker_heartbeats(worker_id, heartbeat_at);

-- ── Dead letter queue ─────────────────────────────────────────
CREATE TABLE dead_letter_jobs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    original_job_id uuid UNIQUE REFERENCES jobs(id) ON DELETE SET NULL,
    queue_id        uuid NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
    job_type        text NOT NULL,
    payload         jsonb NOT NULL,
    failure_reason  text NOT NULL,
    attempts        integer NOT NULL,
    moved_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dead_letter_jobs_queue_id ON dead_letter_jobs(queue_id);
