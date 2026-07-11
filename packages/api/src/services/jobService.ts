import { Pool } from "pg";
import { NotFoundError, ValidationError } from "../lib/errors";
import { encodeCursor, decodeCursor } from "../lib/pagination";
import { getOwnedQueueRow } from "./queueService";
import { Page } from "./projectService";

export interface JobDto {
  id: string;
  queueId: string;
  type: string;
  payload: unknown;
  status: string;
  priority: number;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  retryPolicyId: string | null;
  claimedBy: string | null;
  idempotencyKey: string | null;
  scheduledJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDto(row: any): JobDto {
  return {
    id: row.id,
    queueId: row.queue_id,
    type: row.type,
    payload: row.payload,
    status: row.status,
    priority: row.priority,
    runAt: row.run_at,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    retryPolicyId: row.retry_policy_id,
    claimedBy: row.claimed_by,
    idempotencyKey: row.idempotency_key,
    scheduledJobId: row.scheduled_job_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface JobInput {
  type: string;
  payload: unknown;
  runAt?: string;
  maxAttempts?: number;
  retryPolicyId?: string;
  idempotencyKey?: string;
  priority: number;
}

/**
 * Resolves the effective retry policy + max_attempts for a new job:
 * an explicit maxAttempts always wins; otherwise it's taken from an
 * explicit retryPolicyId, falling back to the queue's default policy, with
 * a bare max_attempts=1 (no retries) if neither is configured. These are
 * snapshotted onto the job row at creation time - see design notes on why
 * (in-flight jobs must not change behavior if the policy is edited later).
 */
async function resolveRetryConfig(
  pool: Pool,
  queueRow: { default_retry_policy_id: string | null },
  input: Pick<JobInput, "maxAttempts" | "retryPolicyId">
): Promise<{ maxAttempts: number; retryPolicyId: string | null }> {
  const retryPolicyId = input.retryPolicyId ?? queueRow.default_retry_policy_id ?? null;

  if (input.maxAttempts) {
    return { maxAttempts: input.maxAttempts, retryPolicyId };
  }
  if (retryPolicyId) {
    const result = await pool.query(`SELECT max_attempts FROM retry_policies WHERE id = $1`, [retryPolicyId]);
    if (result.rows.length === 0) throw new ValidationError("retryPolicyId does not refer to an existing retry policy");
    return { maxAttempts: result.rows[0].max_attempts, retryPolicyId };
  }
  return { maxAttempts: 1, retryPolicyId: null };
}

export async function createJob(
  pool: Pool,
  params: { orgId: string; queueId: string; input: JobInput }
): Promise<JobDto> {
  const queueRow = await getOwnedQueueRow(pool, { orgId: params.orgId, queueId: params.queueId });
  const { maxAttempts, retryPolicyId } = await resolveRetryConfig(pool, queueRow, params.input);

  const runAt = params.input.runAt ? new Date(params.input.runAt) : new Date();
  const status = runAt.getTime() > Date.now() ? "SCHEDULED" : "QUEUED";

  const result = await pool.query(
    `INSERT INTO jobs (queue_id, type, payload, status, priority, run_at, max_attempts, retry_policy_id, idempotency_key)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      params.queueId,
      params.input.type,
      JSON.stringify(params.input.payload),
      status,
      params.input.priority,
      runAt.toISOString(),
      maxAttempts,
      retryPolicyId,
      params.input.idempotencyKey ?? null,
    ]
  );
  return toDto(result.rows[0]);
}

export async function createJobsBatch(
  pool: Pool,
  params: { orgId: string; queueId: string; jobs: JobInput[] }
): Promise<JobDto[]> {
  const queueRow = await getOwnedQueueRow(pool, { orgId: params.orgId, queueId: params.queueId });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created: JobDto[] = [];

    for (const input of params.jobs) {
      const { maxAttempts, retryPolicyId } = await resolveRetryConfig(client as unknown as Pool, queueRow, input);
      const runAt = input.runAt ? new Date(input.runAt) : new Date();
      const status = runAt.getTime() > Date.now() ? "SCHEDULED" : "QUEUED";

      const result = await client.query(
        `INSERT INTO jobs (queue_id, type, payload, status, priority, run_at, max_attempts, retry_policy_id, idempotency_key)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          params.queueId,
          input.type,
          JSON.stringify(input.payload),
          status,
          input.priority,
          runAt.toISOString(),
          maxAttempts,
          retryPolicyId,
          input.idempotencyKey ?? null,
        ]
      );
      created.push(toDto(result.rows[0]));
    }

    await client.query("COMMIT");
    return created;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listJobs(
  pool: Pool,
  params: { orgId: string; queueId: string; cursor?: string; limit: number; status?: string; type?: string }
): Promise<Page<JobDto>> {
  await getOwnedQueueRow(pool, { orgId: params.orgId, queueId: params.queueId });

  const conditions = ["queue_id = $1"];
  const values: unknown[] = [params.queueId];

  if (params.status) {
    values.push(params.status);
    conditions.push(`status = $${values.length}`);
  }
  if (params.type) {
    values.push(params.type);
    conditions.push(`type = $${values.length}`);
  }
  if (params.cursor) {
    const { createdAt, id } = decodeCursor(params.cursor);
    values.push(createdAt, id);
    conditions.push(`(created_at, id) < ($${values.length - 1}, $${values.length})`);
  }

  values.push(params.limit + 1);
  const result = await pool.query(
    `SELECT * FROM jobs WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC, id DESC LIMIT $${values.length}`,
    values
  );

  const hasMore = result.rows.length > params.limit;
  const rows = hasMore ? result.rows.slice(0, params.limit) : result.rows;
  const last = rows[rows.length - 1];

  return {
    items: rows.map(toDto),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

export async function getJob(pool: Pool, params: { orgId: string; queueId: string; jobId: string }): Promise<JobDto> {
  await getOwnedQueueRow(pool, { orgId: params.orgId, queueId: params.queueId });
  const result = await pool.query(`SELECT * FROM jobs WHERE id = $1 AND queue_id = $2`, [
    params.jobId,
    params.queueId,
  ]);
  if (result.rows.length === 0) throw new NotFoundError("Job");
  return toDto(result.rows[0]);
}

export interface JobExecutionDto {
  id: string;
  jobId: string;
  workerId: string | null;
  attemptNumber: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  result: unknown;
}

export async function listExecutions(
  pool: Pool,
  params: { orgId: string; queueId: string; jobId: string }
): Promise<JobExecutionDto[]> {
  await getJob(pool, params); // ownership + existence check

  const result = await pool.query(
    `SELECT * FROM job_executions WHERE job_id = $1 ORDER BY attempt_number ASC`,
    [params.jobId]
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    jobId: row.job_id,
    workerId: row.worker_id,
    attemptNumber: row.attempt_number,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message,
    result: row.result,
  }));
}

export interface JobLogDto {
  id: string;
  level: string;
  message: string;
  loggedAt: string;
}

export async function listExecutionLogs(
  pool: Pool,
  params: { orgId: string; queueId: string; jobId: string; executionId: string }
): Promise<JobLogDto[]> {
  await getJob(pool, params); // ownership check on the parent job

  const execCheck = await pool.query(`SELECT id FROM job_executions WHERE id = $1 AND job_id = $2`, [
    params.executionId,
    params.jobId,
  ]);
  if (execCheck.rows.length === 0) throw new NotFoundError("Job execution");

  const result = await pool.query(
    `SELECT * FROM job_logs WHERE job_execution_id = $1 ORDER BY logged_at ASC`,
    [params.executionId]
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    level: row.level,
    message: row.message,
    loggedAt: row.logged_at,
  }));
}

/** Cancels a job that hasn't started running yet. */
export async function cancelJob(pool: Pool, params: { orgId: string; queueId: string; jobId: string }): Promise<JobDto> {
  await getOwnedQueueRow(pool, { orgId: params.orgId, queueId: params.queueId });

  const result = await pool.query(
    `UPDATE jobs SET status = 'CANCELLED', updated_at = now()
     WHERE id = $1 AND queue_id = $2 AND status IN ('QUEUED', 'SCHEDULED')
     RETURNING *`,
    [params.jobId, params.queueId]
  );
  if (result.rows.length === 0) {
    throw new ValidationError("Job cannot be cancelled - it may already be running or finished");
  }
  return toDto(result.rows[0]);
}
