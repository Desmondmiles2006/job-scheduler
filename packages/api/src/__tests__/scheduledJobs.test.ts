import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../app";
import { getTestPool, truncateAll } from "./testDb";
import { closePool } from "../lib/db";
import { registerOrgProjectQueue } from "./helpers";

const app = createApp();

describe("scheduled jobs (recurring cron)", () => {
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

  it("creates a scheduled job with a computed next_run_at in the future", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "nightly", cronExpression: "0 0 * * *", jobType: "send_report", payloadTemplate: { kind: "nightly" } });

    expect(res.status).toBe(201);
    expect(new Date(res.body.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect(res.body.isEnabled).toBe(true);
  });

  it("rejects an invalid cron expression", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "bad", cronExpression: "not a cron", jobType: "x", payloadTemplate: {} });
    expect(res.status).toBe(400);
  });

  it("lists scheduled jobs for a queue", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "one", cronExpression: "0 0 * * *", jobType: "x", payloadTemplate: {} });

    const res = await request(app)
      .get(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.body.items.length).toBe(1);
  });

  it("toggling isEnabled does not change next_run_at", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "one", cronExpression: "0 0 * * *", jobType: "x", payloadTemplate: {} });

    const res = await request(app)
      .patch(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.isEnabled).toBe(false);
    expect(res.body.nextRunAt).toBe(created.body.nextRunAt);
  });

  it("changing the cron expression recomputes next_run_at", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "one", cronExpression: "0 0 1 1 *", jobType: "x", payloadTemplate: {} }); // yearly

    const res = await request(app)
      .patch(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ cronExpression: "*/5 * * * *" }); // every 5 minutes

    expect(res.status).toBe(200);
    expect(res.body.nextRunAt).not.toBe(created.body.nextRunAt);
    const minutesAhead = (new Date(res.body.nextRunAt).getTime() - Date.now()) / 60000;
    expect(minutesAhead).toBeLessThan(6);
  });

  it("deletes a scheduled job", async () => {
    const { token, projectId, queueId } = await registerOrgProjectQueue(app, "a@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "one", cronExpression: "0 0 * * *", jobType: "x", payloadTemplate: {} });

    const del = await request(app)
      .delete(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app)
      .get(`/api/projects/${projectId}/queues/${queueId}/scheduled-jobs`)
      .set("Authorization", `Bearer ${token}`);
    expect(list.body.items.length).toBe(0);
  });

  it("404s for a scheduled job accessed through another org's token", async () => {
    const orgA = await registerOrgProjectQueue(app, "a@x.com");
    const orgB = await registerOrgProjectQueue(app, "b@x.com");
    const created = await request(app)
      .post(`/api/projects/${orgA.projectId}/queues/${orgA.queueId}/scheduled-jobs`)
      .set("Authorization", `Bearer ${orgA.token}`)
      .send({ name: "one", cronExpression: "0 0 * * *", jobType: "x", payloadTemplate: {} });

    const res = await request(app)
      .patch(`/api/projects/${orgA.projectId}/queues/${orgA.queueId}/scheduled-jobs/${created.body.id}`)
      .set("Authorization", `Bearer ${orgB.token}`)
      .send({ isEnabled: false });
    expect(res.status).toBe(404);
  });
});
