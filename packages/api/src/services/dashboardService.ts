import { Pool } from "pg";
import * as workerService from "./workerService";

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

export interface DashboardSummaryDto {
  statusCounts: Record<string, number>;
  workersOnline: number;
  workersOffline: number;
  completedLastHours: { hour: string; count: number }[];
  recentDeadLetterJobs: {
    id: string;
    projectId: string;
    projectName: string;
    jobType: string;
    failureReason: string;
    attempts: number;
    movedAt: string;
  }[];
}

export async function getDashboardSummary(pool: Pool, params: { orgId: string }): Promise<DashboardSummaryDto> {
  const [statusResult, workers, throughputResult, dlqResult] = await Promise.all([
    pool.query(
      `SELECT j.status, COUNT(*)::int AS count
       FROM jobs j
       JOIN queues q ON q.id = j.queue_id
       JOIN projects p ON p.id = q.project_id
       WHERE p.org_id = $1
       GROUP BY j.status`,
      [params.orgId]
    ),
    workerService.listWorkers(pool),
    pool.query(
      `WITH hours AS (
         SELECT generate_series(
           date_trunc('hour', now()::timestamp) - interval '23 hours',
           date_trunc('hour', now()::timestamp),
           interval '1 hour'
         ) AS hour
       ),
       org_completions AS (
         SELECT j.updated_at
         FROM jobs j
         JOIN queues q ON q.id = j.queue_id
         JOIN projects p ON p.id = q.project_id
         WHERE p.org_id = $1 AND j.status = 'COMPLETED'
       )
       SELECT
         to_char(h.hour, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS hour,
         COUNT(oc.updated_at)::int AS count
       FROM hours h
       LEFT JOIN org_completions oc ON date_trunc('hour', oc.updated_at) = h.hour
       GROUP BY h.hour
       ORDER BY h.hour ASC`,
      [params.orgId]
    ),
    pool.query(
      `SELECT d.id, d.job_type, d.failure_reason, d.attempts, d.moved_at, p.id AS project_id, p.name AS project_name
       FROM dead_letter_jobs d
       JOIN queues q ON q.id = d.queue_id
       JOIN projects p ON p.id = q.project_id
       WHERE p.org_id = $1
       ORDER BY d.moved_at DESC
       LIMIT 10`,
      [params.orgId]
    ),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const status of JOB_STATUSES) statusCounts[status] = 0;
  for (const row of statusResult.rows) statusCounts[row.status] = row.count;

  return {
    statusCounts,
    workersOnline: workers.filter((w) => w.isOnline).length,
    workersOffline: workers.filter((w) => !w.isOnline).length,
    completedLastHours: throughputResult.rows.map((row) => ({ hour: row.hour, count: row.count })),
    recentDeadLetterJobs: dlqResult.rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      jobType: row.job_type,
      failureReason: row.failure_reason,
      attempts: row.attempts,
      movedAt: row.moved_at,
    })),
  };
}
