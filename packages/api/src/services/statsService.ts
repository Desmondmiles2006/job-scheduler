import { Pool } from "pg";
import { getOwnedQueueRow } from "./queueService";

const JOB_STATUSES = [
  "QUEUED",
  "SCHEDULED",
  "CLAIMED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "DEAD_LETTER",
  "CANCELLED",
] as const;

export interface QueueStatsDto {
  statusCounts: Record<string, number>;
  deadLetterCount: number;
  completedLastHours: { hour: string; count: number }[];
}

export async function getQueueStats(
  pool: Pool,
  params: { orgId: string; queueId: string }
): Promise<QueueStatsDto> {
  await getOwnedQueueRow(pool, params); // 404s if not owned

  const [statusResult, deadLetterResult, throughputResult] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count FROM jobs WHERE queue_id = $1 GROUP BY status`, [
      params.queueId,
    ]),
    pool.query(`SELECT COUNT(*)::int AS count FROM dead_letter_jobs WHERE queue_id = $1`, [params.queueId]),
    pool.query(
      `WITH hours AS (
         SELECT generate_series(
           date_trunc('hour', now()::timestamp) - interval '23 hours',
           date_trunc('hour', now()::timestamp),
           interval '1 hour'
         ) AS hour
       )
       SELECT
         to_char(h.hour, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS hour,
         COALESCE(COUNT(j.id), 0)::int AS count
       FROM hours h
       LEFT JOIN jobs j
         ON date_trunc('hour', j.updated_at) = h.hour
         AND j.queue_id = $1
         AND j.status = 'COMPLETED'
       GROUP BY h.hour
       ORDER BY h.hour ASC`,
      [params.queueId]
    ),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const status of JOB_STATUSES) statusCounts[status] = 0;
  for (const row of statusResult.rows) statusCounts[row.status] = row.count;

  return {
    statusCounts,
    deadLetterCount: deadLetterResult.rows[0].count,
    completedLastHours: throughputResult.rows.map((row) => ({ hour: row.hour, count: row.count })),
  };
}
