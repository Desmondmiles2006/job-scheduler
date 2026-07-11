import { Pool } from "pg";
import { NotFoundError, ValidationError } from "../lib/errors";
import { getOwnedQueueRow } from "./queueService";
import { computeNextRun } from "../lib/cron";

function safeComputeNextRun(cronExpression: string, timezone: string, after?: Date) {
  try {
    return computeNextRun(cronExpression, timezone, after);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid cron expression or timezone";
    throw new ValidationError(message);
  }
}

export interface ScheduledJobDto {
  id: string;
  queueId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  jobType: string;
  payloadTemplate: unknown;
  isEnabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
}

function toDto(row: any): ScheduledJobDto {
  return {
    id: row.id,
    queueId: row.queue_id,
    name: row.name,
    cronExpression: row.cron_expression,
    timezone: row.timezone,
    jobType: row.job_type,
    payloadTemplate: row.payload_template,
    isEnabled: row.is_enabled,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    createdAt: row.created_at,
  };
}

export async function createScheduledJob(
  pool: Pool,
  params: {
    orgId: string;
    queueId: string;
    name: string;
    cronExpression: string;
    timezone: string;
    jobType: string;
    payloadTemplate: unknown;
    isEnabled: boolean;
  }
): Promise<ScheduledJobDto> {
  await getOwnedQueueRow(pool, { orgId: params.orgId, queueId: params.queueId });

  const nextRunAt = safeComputeNextRun(params.cronExpression, params.timezone);

  const result = await pool.query(
    `INSERT INTO scheduled_jobs (queue_id, name, cron_expression, timezone, job_type, payload_template, is_enabled, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     RETURNING *`,
    [
      params.queueId,
      params.name,
      params.cronExpression,
      params.timezone,
      params.jobType,
      JSON.stringify(params.payloadTemplate),
      params.isEnabled,
      nextRunAt.toISOString(),
    ]
  );
  return toDto(result.rows[0]);
}

export async function listScheduledJobs(
  pool: Pool,
  params: { orgId: string; queueId: string }
): Promise<ScheduledJobDto[]> {
  await getOwnedQueueRow(pool, { orgId: params.orgId, queueId: params.queueId });
  const result = await pool.query(
    `SELECT * FROM scheduled_jobs WHERE queue_id = $1 ORDER BY created_at DESC`,
    [params.queueId]
  );
  return result.rows.map(toDto);
}

async function getOwnedScheduledJobRow(
  pool: Pool,
  params: { orgId: string; queueId: string; scheduledJobId: string }
) {
  await getOwnedQueueRow(pool, { orgId: params.orgId, queueId: params.queueId });
  const result = await pool.query(`SELECT * FROM scheduled_jobs WHERE id = $1 AND queue_id = $2`, [
    params.scheduledJobId,
    params.queueId,
  ]);
  if (result.rows.length === 0) throw new NotFoundError("Scheduled job");
  return result.rows[0];
}

export async function updateScheduledJob(
  pool: Pool,
  params: {
    orgId: string;
    queueId: string;
    scheduledJobId: string;
    name?: string;
    cronExpression?: string;
    timezone?: string;
    isEnabled?: boolean;
  }
): Promise<ScheduledJobDto> {
  const current = await getOwnedScheduledJobRow(pool, params);

  const cronChanged = params.cronExpression !== undefined || params.timezone !== undefined;
  const nextRunAt = cronChanged
    ? safeComputeNextRun(params.cronExpression ?? current.cron_expression, params.timezone ?? current.timezone)
    : new Date(current.next_run_at);

  const result = await pool.query(
    `UPDATE scheduled_jobs SET
       name = COALESCE($3, name),
       cron_expression = COALESCE($4, cron_expression),
       timezone = COALESCE($5, timezone),
       is_enabled = COALESCE($6, is_enabled),
       next_run_at = $7
     WHERE id = $1 AND queue_id = $2
     RETURNING *`,
    [
      params.scheduledJobId,
      params.queueId,
      params.name ?? null,
      params.cronExpression ?? null,
      params.timezone ?? null,
      params.isEnabled ?? null,
      nextRunAt.toISOString(),
    ]
  );
  return toDto(result.rows[0]);
}

export async function deleteScheduledJob(
  pool: Pool,
  params: { orgId: string; queueId: string; scheduledJobId: string }
): Promise<void> {
  await getOwnedScheduledJobRow(pool, params);
  await pool.query(`DELETE FROM scheduled_jobs WHERE id = $1`, [params.scheduledJobId]);
}
