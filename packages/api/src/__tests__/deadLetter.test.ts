import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../app";
import { getTestPool, truncateAll } from "./testDb";
import { closePool } from "../lib/db";
import { registerOrgProjectQueue } from "./helpers";

const app = createApp();

async function seedDeadLetterJob(
  pool: Pool,
  queueId: string,
  opts: { withOriginalJob?: boolean } = { withOriginalJob: true }
) {
  let originalJobId: string | null = null;

  if (opts.withOriginalJob) {
    const job = await pool.query(
      `INSERT INTO jobs (queue_id, type, payload, status, max_attempts, attempts)
       VALUES ($1, 'send_email', '{}'::jsonb, 'DEAD_LETTER', 1, 1) RETURNING id`,
      [queueId]
    );
    originalJobId = job.rows[0].id;
  }

  const dlq = await pool.query(
    `INSERT INTO dead_letter_jobs (original_job_id, queue_id, job_type, payload, failure_reason, attempts)
     VALUES ($1, $2, 'send_email', '{}'::jsonb, 'boom', 1) RETURNING id`,
    [originalJobId, queueId]
  );

  return { dlqId: dlq.rows[0].id as string, originalJobId };
}

describe("dead letter queue", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool();
  });
  afterAll(async () => {
    await pool.end();
    await closePool();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it("lists dead letter jobs for a project", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    await seedDeadLetterJob(pool, queueId);

    const res = await request(app)
      .get(`/api/projects/${projectId}/dead-letter-jobs`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].failureReason).toBe("boom");
  });

  it("retrying resets the original job in place when it still exists", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const { dlqId, originalJobId } = await seedDeadLetterJob(pool, queueId);

    const res = await request(app)
      .post(`/api/projects/${projectId}/dead-letter-jobs/${dlqId}/retry`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.jobId).toBe(originalJobId);

    const jobRow = await pool.query(`SELECT status, attempts FROM jobs WHERE id = $1`, [originalJobId]);
    expect(jobRow.rows[0].status).toBe("QUEUED");
    expect(jobRow.rows[0].attempts).toBe(0);

    const dlqRow = await pool.query(`SELECT * FROM dead_letter_jobs WHERE id = $1`, [dlqId]);
    expect(dlqRow.rows.length).toBe(0);
  });

  it("retrying creates a fresh job when the original was already purged", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const { dlqId } = await seedDeadLetterJob(pool, queueId, { withOriginalJob: false });

    const res = await request(app)
      .post(`/api/projects/${projectId}/dead-letter-jobs/${dlqId}/retry`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);

    const jobRow = await pool.query(`SELECT status, type FROM jobs WHERE id = $1`, [res.body.jobId]);
    expect(jobRow.rows[0].status).toBe("QUEUED");
    expect(jobRow.rows[0].type).toBe("send_email");
  });

  it("404s retrying a dead letter job belonging to another org", async () => {
    const orgA = await registerOrgProjectQueue(app, "a@x.com");
    const orgB = await registerOrgProjectQueue(app, "b@x.com");
    const { dlqId } = await seedDeadLetterJob(pool, orgA.queueId);

    const res = await request(app)
      .post(`/api/projects/${orgA.projectId}/dead-letter-jobs/${dlqId}/retry`)
      .set("Authorization", `Bearer ${orgB.token}`);
    expect(res.status).toBe(404);
  });
});
