import { Pool } from "pg";
import { NotFoundError } from "../lib/errors";
import { encodeCursor, decodeCursor } from "../lib/pagination";
import { getProject } from "./projectService";
import { Page } from "./projectService";

export interface QueueDto {
  id: string;
  projectId: string;
  name: string;
  priority: number;
  maxConcurrency: number;
  isPaused: boolean;
  defaultRetryPolicyId: string | null;
  createdAt: string;
}

function toDto(row: any): QueueDto {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    priority: row.priority,
    maxConcurrency: row.max_concurrency,
    isPaused: row.is_paused,
    defaultRetryPolicyId: row.default_retry_policy_id,
    createdAt: row.created_at,
  };
}

export async function createQueue(
  pool: Pool,
  params: {
    orgId: string;
    projectId: string;
    name: string;
    priority: number;
    maxConcurrency: number;
    defaultRetryPolicyId?: string;
  }
): Promise<QueueDto> {
  await getProject(pool, { orgId: params.orgId, projectId: params.projectId }); // 404s if not owned

  const result = await pool.query(
    `INSERT INTO queues (project_id, name, priority, max_concurrency, default_retry_policy_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [params.projectId, params.name, params.priority, params.maxConcurrency, params.defaultRetryPolicyId ?? null]
  );
  return toDto(result.rows[0]);
}

export async function listQueues(
  pool: Pool,
  params: { orgId: string; projectId: string; cursor?: string; limit: number; isPaused?: boolean }
): Promise<Page<QueueDto>> {
  await getProject(pool, { orgId: params.orgId, projectId: params.projectId });

  const conditions = ["project_id = $1"];
  const values: unknown[] = [params.projectId];

  if (params.isPaused !== undefined) {
    values.push(params.isPaused);
    conditions.push(`is_paused = $${values.length}`);
  }
  if (params.cursor) {
    const { createdAt, id } = decodeCursor(params.cursor);
    values.push(createdAt, id);
    conditions.push(`(created_at, id) < ($${values.length - 1}, $${values.length})`);
  }

  values.push(params.limit + 1);
  const result = await pool.query(
    `SELECT * FROM queues WHERE ${conditions.join(" AND ")}
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

export async function getOwnedQueueRow(pool: Pool, params: { orgId: string; queueId: string }) {
  const result = await pool.query(
    `SELECT q.* FROM queues q
     JOIN projects p ON p.id = q.project_id
     WHERE q.id = $1 AND p.org_id = $2 AND p.deleted_at IS NULL`,
    [params.queueId, params.orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError("Queue");
  return result.rows[0];
}

export async function getQueue(pool: Pool, params: { orgId: string; queueId: string }): Promise<QueueDto> {
  return toDto(await getOwnedQueueRow(pool, params));
}

export async function updateQueue(
  pool: Pool,
  params: {
    orgId: string;
    queueId: string;
    name?: string;
    priority?: number;
    maxConcurrency?: number;
    isPaused?: boolean;
    defaultRetryPolicyId?: string | null;
  }
): Promise<QueueDto> {
  await getOwnedQueueRow(pool, params); // ownership check + 404

  const result = await pool.query(
    `UPDATE queues SET
       name = COALESCE($2, name),
       priority = COALESCE($3, priority),
       max_concurrency = COALESCE($4, max_concurrency),
       is_paused = COALESCE($5, is_paused),
       default_retry_policy_id = CASE WHEN $6::boolean THEN $7 ELSE default_retry_policy_id END
     WHERE id = $1
     RETURNING *`,
    [
      params.queueId,
      params.name ?? null,
      params.priority ?? null,
      params.maxConcurrency ?? null,
      params.isPaused ?? null,
      params.defaultRetryPolicyId !== undefined,
      params.defaultRetryPolicyId ?? null,
    ]
  );
  return toDto(result.rows[0]);
}

export async function deleteQueue(pool: Pool, params: { orgId: string; queueId: string }): Promise<void> {
  await getOwnedQueueRow(pool, params);
  await pool.query(`DELETE FROM queues WHERE id = $1`, [params.queueId]);
}
