import { Pool } from "pg";
import { computeNextRun } from "./cron";

export interface TickResult {
  enqueued: number;
}

/**
 * One scheduler tick. Runs inside a single transaction with
 * FOR UPDATE SKIP LOCKED on the due scheduled_jobs rows - this is defense in
 * depth on top of leader election: even if two scheduler processes both
 * believed they were leader for a moment (e.g. during a failover race), they
 * cannot both enqueue the same scheduled run, because whichever locks the
 * row first wins and the other skips it.
 *
 * Croner's job here is purely computational (computeNextRun) - it never
 * executes anything. The job itself is executed later, by an ordinary
 * worker, exactly like any manually-submitted job.
 */
export async function tick(pool: Pool): Promise<TickResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const due = await client.query(
      `SELECT * FROM scheduled_jobs
       WHERE next_run_at <= now() AND is_enabled = true
       FOR UPDATE SKIP LOCKED`
    );

    for (const row of due.rows) {
      const queueRow = await client.query(
        `SELECT default_retry_policy_id FROM queues WHERE id = $1`,
        [row.queue_id]
      );
      const retryPolicyId: string | null = queueRow.rows[0]?.default_retry_policy_id ?? null;

      let maxAttempts = 1;
      if (retryPolicyId) {
        const policyRow = await client.query(`SELECT max_attempts FROM retry_policies WHERE id = $1`, [
          retryPolicyId,
        ]);
        maxAttempts = policyRow.rows[0]?.max_attempts ?? 1;
      }

      await client.query(
        `INSERT INTO jobs (queue_id, type, payload, max_attempts, retry_policy_id, scheduled_job_id, run_at, status)
         VALUES ($1, $2, $3, $4, $5, $6, now(), 'QUEUED')`,
        [row.queue_id, row.job_type, row.payload_template, maxAttempts, retryPolicyId, row.id]
      );

      const nextRun = computeNextRun(row.cron_expression, row.timezone, row.next_run_at);
      await client.query(`UPDATE scheduled_jobs SET next_run_at = $1, last_run_at = now() WHERE id = $2`, [
        nextRun,
        row.id,
      ]);
    }

    await client.query("COMMIT");
    return { enqueued: due.rows.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
