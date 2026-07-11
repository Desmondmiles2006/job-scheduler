import { Pool } from "pg";

export function getTestPool(): Pool {
  const connectionString = process.env.TEST_DATABASE_URL;
  if (!connectionString) {
    throw new Error("TEST_DATABASE_URL is not set - see packages/api/.env.example");
  }
  return new Pool({ connectionString, max: 20 });
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE
      dead_letter_jobs, job_logs, job_executions, worker_heartbeats,
      jobs, scheduled_jobs, workers, retry_policies, queues, projects,
      refresh_tokens, users, organizations
    RESTART IDENTITY CASCADE;
  `);
}
