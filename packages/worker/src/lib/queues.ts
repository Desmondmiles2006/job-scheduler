import { Pool } from "pg";

export interface QueueConfig {
  id: string;
  maxConcurrency: number;
  isPaused: boolean;
}

export async function getActiveQueues(pool: Pool, queueIds?: string[]): Promise<QueueConfig[]> {
  const result = queueIds && queueIds.length > 0
    ? await pool.query(
        `SELECT id, max_concurrency, is_paused FROM queues WHERE id = ANY($1::uuid[]) AND is_paused = false`,
        [queueIds]
      )
    : await pool.query(`SELECT id, max_concurrency, is_paused FROM queues WHERE is_paused = false`);

  return result.rows.map((r) => ({
    id: r.id,
    maxConcurrency: r.max_concurrency,
    isPaused: r.is_paused,
  }));
}

/** How many more jobs this queue can run right now, given its max_concurrency. */
export async function availableCapacity(pool: Pool, queue: QueueConfig): Promise<number> {
  const result = await pool.query(
    `SELECT count(*)::int AS in_flight FROM jobs WHERE queue_id = $1 AND status IN ('CLAIMED', 'RUNNING')`,
    [queue.id]
  );
  const inFlight = result.rows[0].in_flight as number;
  return Math.max(0, queue.maxConcurrency - inFlight);
}
