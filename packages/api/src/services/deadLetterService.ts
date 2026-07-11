import { Pool } from "pg";
import { NotFoundError } from "../lib/errors";
import { encodeCursor, decodeCursor } from "../lib/pagination";
import { Page } from "./projectService";

export interface DeadLetterJobDto {
  id: string;
  originalJobId: string | null;
  queueId: string;
  jobType: string;
  payload: unknown;
  failureReason: string;
  attempts: number;
  movedAt: string;
}

function toDto(row: any): DeadLetterJobDto {
  return {
    id: row.id,
    originalJobId: row.original_job_id,
    queueId: row.queue_id,
    jobType: row.job_type,
    payload: row.payload,
    failureReason: row.failure_reason,
    attempts: row.attempts,
    movedAt: row.moved_at,
  };
}

export async function listDeadLetterJobs(
  pool: Pool,
  params: { orgId: string; projectId: string; cursor?: string; limit: number }
): Promise<Page<DeadLetterJobDto>> {
  const conditions = ["p.id = $1", "p.org_id = $2"];
  const values: unknown[] = [params.projectId, params.orgId];

  if (params.cursor) {
    const { createdAt, id } = decodeCursor(params.cursor);
    values.push(createdAt, id);
    conditions.push(`(d.moved_at, d.id) < ($${values.length - 1}, $${values.length})`);
  }

  values.push(params.limit + 1);
  const result = await pool.query(
    `SELECT d.* FROM dead_letter_jobs d
     JOIN queues q ON q.id = d.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY d.moved_at DESC, d.id DESC
     LIMIT $${values.length}`,
    values
  );

  const hasMore = result.rows.length > params.limit;
  const rows = hasMore ? result.rows.slice(0, params.limit) : result.rows;
  const last = rows[rows.length - 1];

  return {
    items: rows.map(toDto),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.moved_at, id: last.id }) : null,
  };
}

async function getOwnedDeadLetterRow(pool: Pool, params: { orgId: string; projectId: string; dlqId: string }) {
  const result = await pool.query(
    `SELECT d.* FROM dead_letter_jobs d
     JOIN queues q ON q.id = d.queue_id
     JOIN projects p ON p.id = q.project_id
     WHERE d.id = $1 AND p.id = $2 AND p.org_id = $3`,
    [params.dlqId, params.projectId, params.orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError("Dead letter job");
  return result.rows[0];
}

/**
 * Requeues a dead-lettered job. If the original job row still exists, it's
 * reset in place (attempts back to 0, status back to QUEUED); otherwise
 * (the original was archived/purged - original_job_id is ON DELETE SET
 * NULL specifically to allow that) a fresh job row is created from the
 * DLQ's own snapshot of type/payload. Either way the DLQ entry is removed
 * once handled.
 */
export async function retryDeadLetterJob(
  pool: Pool,
  params: { orgId: string; projectId: string; dlqId: string }
): Promise<{ jobId: string }> {
  const dlqRow = await getOwnedDeadLetterRow(pool, params);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let jobId: string;

    if (dlqRow.original_job_id) {
      const existing = await client.query(`SELECT id FROM jobs WHERE id = $1`, [dlqRow.original_job_id]);
      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE jobs SET status = 'QUEUED', attempts = 0, run_at = now(),
                  claimed_by = NULL, claimed_at = NULL, locked_until = NULL, updated_at = now()
           WHERE id = $1`,
          [dlqRow.original_job_id]
        );
        jobId = dlqRow.original_job_id;
      } else {
        jobId = await insertFreshJob(client as unknown as Pool, dlqRow);
      }
    } else {
      jobId = await insertFreshJob(client as unknown as Pool, dlqRow);
    }

    await client.query(`DELETE FROM dead_letter_jobs WHERE id = $1`, [dlqRow.id]);
    await client.query("COMMIT");
    return { jobId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function insertFreshJob(client: Pool, dlqRow: any): Promise<string> {
  const queueRow = await client.query(`SELECT default_retry_policy_id FROM queues WHERE id = $1`, [
    dlqRow.queue_id,
  ]);
  const retryPolicyId = queueRow.rows[0]?.default_retry_policy_id ?? null;

  let maxAttempts = Math.max(dlqRow.attempts, 1);
  if (retryPolicyId) {
    const policy = await client.query(`SELECT max_attempts FROM retry_policies WHERE id = $1`, [retryPolicyId]);
    if (policy.rows[0]) maxAttempts = policy.rows[0].max_attempts;
  }

  const result = await client.query(
    `INSERT INTO jobs (queue_id, type, payload, status, max_attempts, retry_policy_id)
     VALUES ($1, $2, $3, 'QUEUED', $4, $5)
     RETURNING id`,
    [dlqRow.queue_id, dlqRow.job_type, dlqRow.payload, maxAttempts, retryPolicyId]
  );
  return result.rows[0].id;
}
