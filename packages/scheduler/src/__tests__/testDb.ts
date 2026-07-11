import { Pool } from "pg";

export function getTestPool(): Pool {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is not set - see packages/scheduler/.env.example");
  }
  return new Pool({ connectionString, max: 20 });
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE
      dead_letter_jobs, job_logs, job_executions, worker_heartbeats,
      jobs, scheduled_jobs, workers, retry_policies, queues, projects,
      users, organizations
    RESTART IDENTITY CASCADE;
  `);
}

export async function seedProjectAndQueue(pool: Pool) {
  const org = await pool.query(`INSERT INTO organizations (name) VALUES ('Test Org') RETURNING id`);
  const orgId = org.rows[0].id;
  const user = await pool.query(
    `INSERT INTO users (org_id, email, password_hash, name, role) VALUES ($1, 'a@test.com', 'x', 'Alice', 'OWNER') RETURNING id`,
    [orgId]
  );
  const userId = user.rows[0].id;
  const project = await pool.query(
    `INSERT INTO projects (org_id, name, created_by) VALUES ($1, 'Test Project', $2) RETURNING id`,
    [orgId, userId]
  );
  const projectId = project.rows[0].id;
  const retryPolicy = await pool.query(
    `INSERT INTO retry_policies (project_id, name, strategy, base_delay_ms, max_delay_ms, max_attempts, multiplier)
     VALUES ($1, 'default', 'FIXED', 1000, 60000, 3, 1.0) RETURNING id`,
    [projectId]
  );
  const retryPolicyId = retryPolicy.rows[0].id;
  const queue = await pool.query(
    `INSERT INTO queues (project_id, name, priority, max_concurrency, default_retry_policy_id)
     VALUES ($1, 'default-queue', 0, 10, $2) RETURNING id`,
    [projectId, retryPolicyId]
  );
  const queueId = queue.rows[0].id;
  return { orgId, userId, projectId, retryPolicyId, queueId };
}
