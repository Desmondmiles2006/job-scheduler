import request from "supertest";
import { Pool } from "pg";
import { Express } from "express";
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

async function createSecondProjectQueue(app: Express, token: string) {
  const project = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Second Project" });
  const projectId = project.body.id as string;

  const retryPolicy = await request(app)
    .post(`/api/projects/${projectId}/retry-policies`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "default", strategy: "FIXED", baseDelayMs: 1000, maxDelayMs: 60000, maxAttempts: 3 });

  const queue = await request(app)
    .post(`/api/projects/${projectId}/queues`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "second-queue", defaultRetryPolicyId: retryPolicy.body.id });

  return { projectId, queueId: queue.body.id as string };
}

describe("dashboard summary", () => {
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

  it("aggregates job status counts across every project in the org", async () => {
    const { token, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const second = await createSecondProjectQueue(app, token);

    await seedJob(pool, queueId, { status: "QUEUED" });
    await seedJob(pool, second.queueId, { status: "QUEUED" });
    await seedJob(pool, second.queueId, { status: "COMPLETED" });
    await seedJob(pool, second.queueId, { status: "RUNNING" });

    const res = await request(app).get("/api/dashboard/summary").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.statusCounts.QUEUED).toBe(2);
    expect(res.body.statusCounts.COMPLETED).toBe(1);
    expect(res.body.statusCounts.RUNNING).toBe(1);
    expect(res.body.statusCounts.FAILED).toBe(0);
  });

  it("counts online vs offline workers", async () => {
    const { token } = await registerOrgProjectQueue(app, "a@x.com");
    await pool.query(`INSERT INTO workers (hostname, pid, status, last_seen_at) VALUES ('host-1', 1, 'IDLE', now())`);
    await pool.query(
      `INSERT INTO workers (hostname, pid, status, last_seen_at) VALUES ('host-2', 2, 'IDLE', now() - interval '5 minutes')`
    );

    const res = await request(app).get("/api/dashboard/summary").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.workersOnline).toBe(1);
    expect(res.body.workersOffline).toBe(1);
  });

  it("only counts completed jobs from the last 24h in the throughput chart", async () => {
    const { token, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    await seedJob(pool, queueId, { status: "COMPLETED", updatedAt: new Date() });
    await seedJob(pool, queueId, {
      status: "COMPLETED",
      updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });

    const res = await request(app).get("/api/dashboard/summary").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.completedLastHours.length).toBe(24);
    const total = res.body.completedLastHours.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0);
    expect(total).toBe(1);
  });

  it("lists recent dead-letter jobs across the org's projects", async () => {
    const { token, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    await pool.query(
      `INSERT INTO dead_letter_jobs (queue_id, job_type, payload, failure_reason, attempts)
       VALUES ($1, 'send_email', '{}'::jsonb, 'boom', 1)`,
      [queueId]
    );

    const res = await request(app).get("/api/dashboard/summary").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.recentDeadLetterJobs.length).toBe(1);
    expect(res.body.recentDeadLetterJobs[0].jobType).toBe("send_email");
    expect(res.body.recentDeadLetterJobs[0].failureReason).toBe("boom");
  });

  it("does not include another org's jobs or dead-letter jobs", async () => {
    const orgA = await registerOrgProjectQueue(app, "a@x.com");
    const orgB = await registerOrgProjectQueue(app, "b@x.com");

    await seedJob(pool, orgB.queueId, { status: "QUEUED" });
    await pool.query(
      `INSERT INTO dead_letter_jobs (queue_id, job_type, payload, failure_reason, attempts)
       VALUES ($1, 'send_email', '{}'::jsonb, 'boom', 1)`,
      [orgB.queueId]
    );

    const res = await request(app).get("/api/dashboard/summary").set("Authorization", `Bearer ${orgA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.statusCounts.QUEUED).toBe(0);
    expect(res.body.recentDeadLetterJobs.length).toBe(0);
  });
});
