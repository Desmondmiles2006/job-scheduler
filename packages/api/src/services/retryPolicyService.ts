import { Pool } from "pg";
import { NotFoundError } from "../lib/errors";
import { getProject } from "./projectService";

export interface RetryPolicyDto {
  id: string;
  projectId: string;
  name: string;
  strategy: string;
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  multiplier: number;
  createdAt: string;
}

function toDto(row: any): RetryPolicyDto {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    strategy: row.strategy,
    baseDelayMs: row.base_delay_ms,
    maxDelayMs: row.max_delay_ms,
    maxAttempts: row.max_attempts,
    multiplier: Number(row.multiplier),
    createdAt: row.created_at,
  };
}

export async function createRetryPolicy(
  pool: Pool,
  params: {
    orgId: string;
    projectId: string;
    name: string;
    strategy: string;
    baseDelayMs: number;
    maxDelayMs: number;
    maxAttempts: number;
    multiplier: number;
  }
): Promise<RetryPolicyDto> {
  await getProject(pool, { orgId: params.orgId, projectId: params.projectId });

  const result = await pool.query(
    `INSERT INTO retry_policies (project_id, name, strategy, base_delay_ms, max_delay_ms, max_attempts, multiplier)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      params.projectId,
      params.name,
      params.strategy,
      params.baseDelayMs,
      params.maxDelayMs,
      params.maxAttempts,
      params.multiplier,
    ]
  );
  return toDto(result.rows[0]);
}

export async function listRetryPolicies(
  pool: Pool,
  params: { orgId: string; projectId: string }
): Promise<RetryPolicyDto[]> {
  await getProject(pool, { orgId: params.orgId, projectId: params.projectId });

  const result = await pool.query(
    `SELECT * FROM retry_policies WHERE project_id = $1 ORDER BY created_at DESC`,
    [params.projectId]
  );
  return result.rows.map(toDto);
}

export async function getRetryPolicy(
  pool: Pool,
  params: { orgId: string; retryPolicyId: string }
): Promise<RetryPolicyDto> {
  const result = await pool.query(
    `SELECT rp.* FROM retry_policies rp
     JOIN projects p ON p.id = rp.project_id
     WHERE rp.id = $1 AND p.org_id = $2`,
    [params.retryPolicyId, params.orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError("Retry policy");
  return toDto(result.rows[0]);
}
