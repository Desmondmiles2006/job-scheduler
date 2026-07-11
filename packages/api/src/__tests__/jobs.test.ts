import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../app";
import { getTestPool, truncateAll } from "./testDb";
import { closePool } from "../lib/db";
import { registerOrgProjectQueue } from "./helpers";

const app = createApp();

describe("jobs", () => {
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

  it("creates an immediate job (no runAt) as QUEUED", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "send_email", payload: { to: "x@y.com" } });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("QUEUED");
    expect(res.body.maxAttempts).toBe(3); // inherited from queue's default retry policy
  });

  it("creates a delayed job (future runAt) as SCHEDULED", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const runAt = new Date(Date.now() + 60_000).toISOString();
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "send_email", payload: {}, runAt });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SCHEDULED");
  });

  it("creates a batch of jobs in one call", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs/batch`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        jobs: [
          { type: "send_email", payload: { i: 1 } },
          { type: "send_email", payload: { i: 2 } },
          { type: "send_email", payload: { i: 3 } },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.items.length).toBe(3);
  });

  it("rejects job creation without a type", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ payload: {} });
    expect(res.status).toBe(400);
  });

  it("an explicit maxAttempts overrides the queue's default retry policy", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "send_email", payload: {}, maxAttempts: 9 });
    expect(res.body.maxAttempts).toBe(9);
  });

  it("lists jobs with pagination", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
        .set("Authorization", `Bearer ${token}`)
        .send({ type: "send_email", payload: { i } });
    }

    const res = await request(app)
      .get(`/api/projects/${projectId}/queues/${queueId}/jobs?limit=2`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.items.length).toBe(2);
    expect(res.body.nextCursor).not.toBeNull();
  });

  it("filters jobs by status", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "a", payload: {} });
    await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "b", payload: {}, runAt: new Date(Date.now() + 60_000).toISOString() });

    const res = await request(app)
      .get(`/api/projects/${projectId}/queues/${queueId}/jobs?status=SCHEDULED`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].type).toBe("b");
  });

  it("gets a job by id with its (empty) execution history", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "send_email", payload: {} });

    const job = await request(app)
      .get(`/api/projects/${projectId}/queues/${queueId}/jobs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(job.status).toBe(200);

    const executions = await request(app)
      .get(`/api/projects/${projectId}/queues/${queueId}/jobs/${created.body.id}/executions`)
      .set("Authorization", `Bearer ${token}`);
    expect(executions.body.items).toEqual([]);
  });

  it("returns execution logs once a worker has recorded them", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "send_email", payload: {} });

    const execution = await pool.query(
      `INSERT INTO job_executions (job_id, attempt_number, status) VALUES ($1, 1, 'RUNNING') RETURNING id`,
      [created.body.id]
    );
    await pool.query(`INSERT INTO job_logs (job_execution_id, level, message) VALUES ($1, 'INFO', 'started')`, [
      execution.rows[0].id,
    ]);

    const logs = await request(app)
      .get(
        `/api/projects/${projectId}/queues/${queueId}/jobs/${created.body.id}/executions/${execution.rows[0].id}/logs`
      )
      .set("Authorization", `Bearer ${token}`);
    expect(logs.status).toBe(200);
    expect(logs.body.items.length).toBe(1);
    expect(logs.body.items[0].message).toBe("started");
  });

  it("cancels a queued job", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "send_email", payload: {} });

    const res = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
  });

  it("refuses to cancel a job that is already running", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ type: "send_email", payload: {} });

    await pool.query(`UPDATE jobs SET status = 'RUNNING' WHERE id = $1`, [created.body.id]);

    const res = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/jobs/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("404s fetching a job through a queue belonging to another org", async () => {
    const orgA = await registerOrgProjectQueue(app, "a@x.com");
    const orgB = await registerOrgProjectQueue(app, "b@x.com");
    const created = await request(app)
      .post(`/api/projects/${orgA.projectId}/queues/${orgA.queueId}/jobs`)
      .set("Authorization", `Bearer ${orgA.token}`)
      .send({ type: "send_email", payload: {} });

    const res = await request(app)
      .get(`/api/projects/${orgA.projectId}/queues/${orgA.queueId}/jobs/${created.body.id}`)
      .set("Authorization", `Bearer ${orgB.token}`);
    expect(res.status).toBe(404);
  });
});
