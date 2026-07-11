import { Pool } from "pg";
import { NotFoundError } from "../lib/errors";
import { encodeCursor, decodeCursor } from "../lib/pagination";

export interface ProjectDto {
  id: string;
  orgId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

function toDto(row: any): ProjectDto {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function createProject(
  pool: Pool,
  params: { orgId: string; createdBy: string; name: string }
): Promise<ProjectDto> {
  const result = await pool.query(
    `INSERT INTO projects (org_id, name, created_by) VALUES ($1, $2, $3) RETURNING *`,
    [params.orgId, params.name, params.createdBy]
  );
  return toDto(result.rows[0]);
}

export async function listProjects(
  pool: Pool,
  params: { orgId: string; cursor?: string; limit: number; name?: string }
): Promise<Page<ProjectDto>> {
  const conditions = ["org_id = $1", "deleted_at IS NULL"];
  const values: unknown[] = [params.orgId];

  if (params.name) {
    values.push(`%${params.name}%`);
    conditions.push(`name ILIKE $${values.length}`);
  }

  if (params.cursor) {
    const { createdAt, id } = decodeCursor(params.cursor);
    values.push(createdAt, id);
    conditions.push(`(created_at, id) < ($${values.length - 1}, $${values.length})`);
  }

  values.push(params.limit + 1);
  const sql = `
    SELECT * FROM projects
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC, id DESC
    LIMIT $${values.length}
  `;
  const result = await pool.query(sql, values);

  const hasMore = result.rows.length > params.limit;
  const rows = hasMore ? result.rows.slice(0, params.limit) : result.rows;
  const last = rows[rows.length - 1];

  return {
    items: rows.map(toDto),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

export async function getProject(pool: Pool, params: { orgId: string; projectId: string }): Promise<ProjectDto> {
  const result = await pool.query(
    `SELECT * FROM projects WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [params.projectId, params.orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError("Project");
  return toDto(result.rows[0]);
}

export async function updateProject(
  pool: Pool,
  params: { orgId: string; projectId: string; name?: string }
): Promise<ProjectDto> {
  const result = await pool.query(
    `UPDATE projects SET name = COALESCE($3, name)
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [params.projectId, params.orgId, params.name ?? null]
  );
  if (result.rows.length === 0) throw new NotFoundError("Project");
  return toDto(result.rows[0]);
}

export async function deleteProject(pool: Pool, params: { orgId: string; projectId: string }): Promise<void> {
  const result = await pool.query(
    `UPDATE projects SET deleted_at = now()
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [params.projectId, params.orgId]
  );
  if (result.rows.length === 0) throw new NotFoundError("Project");
}
