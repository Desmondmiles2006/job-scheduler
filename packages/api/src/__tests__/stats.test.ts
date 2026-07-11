import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../app";
import { getTestPool, truncateAll } from "./testDb";
import { closePool } from "../lib/db";
import { registerOrgProjectQueue } from "./helpers";

const app = createApp();

async function seedJob(pool: Pool, queueId: string, opts: { status: string; updatedAt?: Date }) {
  await pool.query(
    `INSERT INTO jobs (queue_id, type, payload, status, max_attempts, attempts, updated_at)
     VALUES ($1, 'send_email', '{}'::jsonb, $2, 1, 0, COALESCE($3, now()))`,
    [queueId, opts.status, opts.updatedAt ?? null]
  );
}

describe("queue stats", () => {
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

  it("returns status counts for a mix of job statuses", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    await seedJob(pool, queueId, { status: "QUEUED" });
    await seedJob(pool, queueId, { status: "QUEUED" });
    await seedJob(pool, queueId, { status: "RUNNING" });
    await seedJob(pool, queueId, { status: "COMPLETED" });
    await seedJob(pool, queueId, { status: "COMPLETED" });
    await seedJob(pool, queueId, { status: "COMPLETED" });

    const res = await request(app)
      .get(`/api/projects/${projectId}/queues/${queueId}/stats`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.statusCounts.QUEUED).toBe(2);
    expect(res.body.statusCounts.RUNNING).toBe(1);
    expect(res.body.statusCounts.COMPLETED).toBe(3);
    expect(res.body.statusCounts.FAILED).toBe(0);
  });

  it("reflects seeded dead_letter_jobs rows in deadLetterCount", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    await pool.query(
      `INSERT INTO dead_letter_jobs (queue_id, job_type, payload, failure_reason, attempts)
       VALUES ($1, 'send_email', '{}'::jsonb, 'boom', 1)`,
      [queueId]
    );
    await pool.query(
      `INSERT INTO dead_letter_jobs (queue_id, job_type, payload, failure_reason, attempts)
       VALUES ($1, 'send_email', '{}'::jsonb, 'boom again', 2)`,
      [queueId]
    );

    const res = await request(app)
      .get(`/api/projects/${projectId}/queues/${queueId}/stats`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.deadLetterCount).toBe(2);
  });

  it("completedLastHours only counts jobs completed in the last 24h, not older ones", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");

    await seedJob(pool, queueId, { status: "COMPLETED", updatedAt: new Date() });
    await seedJob(pool, queueId, {
      status: "COMPLETED",
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app)
      .get(`/api/projects/${projectId}/queues/${queueId}/stats`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.completedLastHours.length).toBe(24);
    const total = res.body.completedLastHours.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0);
    expect(total).toBe(1);
  });

  it("404s when queried through another org's queue", async () => {
    const orgA = await registerOrgProjectQueue(app, "a@x.com");
    const orgB = await registerOrgProjectQueue(app, "b@x.com");

    const res = await request(app)
      .get(`/api/projects/${orgA.projectId}/queues/${orgA.queueId}/stats`)
      .set("Authorization", `Bearer ${orgB.token}`);

    expect(res.status).toBe(404);
  });
});
