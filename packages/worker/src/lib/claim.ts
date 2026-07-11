import { Pool } from "pg";
import { computeRetryDelayMs, RetryPolicyConfig } from "./retryPolicy";

export interface ClaimedJob {
  id: string;
  queue_id: string;
  type: string;
  payload: unknown;
  status: string;
  priority: number;
  run_at: Date;
  attempts: number;
  max_attempts: number;
  retry_policy_id: string | null;
  claimed_by: string | null;
  claimed_at: Date | null;
  locked_until: Date | null;
  idempotency_key: string | null;
}

/**
 * Atomically claims up to `batchSize` eligible jobs from a queue.
 *
 * CONCURRENCY-CRITICAL: the SELECT ... FOR UPDATE SKIP LOCKED and the UPDATE
 * happen inside a single statement (via CTE) so there is no gap between
 * "read" and "write" where two workers could pick the same row. SKIP LOCKED
 * means a worker never blocks waiting on a row another worker already has
 * locked - it just moves on to the next candidate. This is what allows many
 * worker processes to poll the same queue concurrently with zero duplicate
 * execution and no external lock manager (e.g. Redis/Redlock).
 */
export async function claimJobs(
  pool: Pool,
  params: { queueId: string; workerId: string; batchSize: number; leaseSeconds: number }
): Promise<ClaimedJob[]> {
  const { queueId, workerId, batchSize, leaseSeconds } = params;

  const result = await pool.query<ClaimedJob>(
    `
    WITH claimed AS (
      SELECT id FROM jobs
      WHERE queue_id = $1
        AND status IN ('QUEUED', 'SCHEDULED')
        AND run_at <= now()
      ORDER BY priority DESC, run_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT $2
    )
    UPDATE jobs
    SET status = 'CLAIMED',
        claimed_by = $3,
        claimed_at = now(),
        locked_until = now() + ($4 || ' seconds')::interval,
        attempts = attempts + 1,
        updated_at = now()
    FROM claimed
    WHERE jobs.id = claimed.id
    RETURNING jobs.*;
    `,
    [queueId, batchSize, workerId, leaseSeconds]
  );

  return result.rows;
}

/** Extends a job's lease - called periodically by the worker while it runs (the heartbeat). */
export async function extendLease(
  pool: Pool,
  jobId: string,
  workerId: string,
  leaseSeconds: number
): Promise<void> {
  await pool.query(
    `UPDATE jobs
     SET locked_until = now() + ($3 || ' seconds')::interval, updated_at = now()
     WHERE id = $1 AND claimed_by = $2`,
    [jobId, workerId, leaseSeconds]
  );
}

export async function markRunning(pool: Pool, jobId: string): Promise<void> {
  await pool.query(`UPDATE jobs SET status = 'RUNNING', updated_at = now() WHERE id = $1`, [jobId]);
}

export async function completeJob(pool: Pool, jobId: string): Promise<void> {
  await pool.query(
    `UPDATE jobs
     SET status = 'COMPLETED', claimed_by = NULL, locked_until = NULL, updated_at = now()
     WHERE id = $1`,
    [jobId]
  );
}

/**
 * Handles a failed execution attempt. If attempts remain, reschedules with
 * backoff (status -> SCHEDULED). Otherwise moves the job to the dead letter
 * table permanently (status -> DEAD_LETTER) and copies its payload across,
 * since dead_letter_jobs.original_job_id is ON DELETE SET NULL - the DLQ
 * entry must be able to stand on its own if the source job row is later
 * archived/purged.
 */
export async function failJob(
  pool: Pool,
  job: ClaimedJob,
  errorMessage: string,
  retryPolicy: RetryPolicyConfig | null
): Promise<"RESCHEDULED" | "DEAD_LETTERED"> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const permanentFailure = !retryPolicy || job.attempts >= job.max_attempts;

    if (permanentFailure) {
      await client.query(
        `UPDATE jobs
         SET status = 'DEAD_LETTER', claimed_by = NULL, locked_until = NULL, updated_at = now()
         WHERE id = $1`,
        [job.id]
      );
      await client.query(
        `INSERT INTO dead_letter_jobs (original_job_id, queue_id, job_type, payload, failure_reason, attempts)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [job.id, job.queue_id, job.type, job.payload, errorMessage, job.attempts]
      );
      await client.query("COMMIT");
      return "DEAD_LETTERED";
    }

    const delayMs = computeRetryDelayMs(retryPolicy, job.attempts);
    await client.query(
      `UPDATE jobs
       SET status = 'SCHEDULED',
           claimed_by = NULL,
           locked_until = NULL,
           run_at = now() + ($2 || ' milliseconds')::interval,
           updated_at = now()
       WHERE id = $1`,
      [job.id, delayMs]
    );
    await client.query("COMMIT");
    return "RESCHEDULED";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Reclaims jobs whose lease expired without a heartbeat extension - i.e. the
 * worker holding them crashed, was OOM-killed, or lost network. This is the
 * safety net that makes worker crashes non-fatal to job delivery: nothing
 * needs to notice the worker died, the lease just runs out.
 */
export async function reapExpiredLeases(pool: Pool): Promise<number> {
  const result = await pool.query(
    `UPDATE jobs
     SET status = 'QUEUED', claimed_by = NULL, locked_until = NULL, updated_at = now()
     WHERE status IN ('CLAIMED', 'RUNNING')
       AND locked_until < now()`
  );
  return result.rowCount ?? 0;
}
