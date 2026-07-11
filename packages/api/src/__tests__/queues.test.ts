import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../app";
import { getTestPool, truncateAll } from "./testDb";
import { closePool } from "../lib/db";

const app = createApp();

async function registerOrgAndProject(email: string, projectName = "Default Project") {
  const register = await request(app).post("/api/auth/register").send({
    orgName: `Org for ${email}`,
    name: "Owner",
    email,
    password: "correct-horse-battery-staple",
  });
  const token = register.body.accessToken as string;
  const project = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: projectName });
  return { token, projectId: project.body.id as string };
}

describe("queues", () => {
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

  it("creates a queue with default concurrency/priority", async () => {
    const { token, projectId } = await registerOrgAndProject("a@x.com");
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "emails" });

    expect(res.status).toBe(201);
    expect(res.body.priority).toBe(0);
    expect(res.body.maxConcurrency).toBe(5);
    expect(res.body.isPaused).toBe(false);
  });

  it("creates a queue with a linked retry policy", async () => {
    const { token, projectId } = await registerOrgAndProject("a@x.com");
    const policy = await request(app)
      .post(`/api/projects/${projectId}/retry-policies`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "standard", strategy: "EXPONENTIAL", baseDelayMs: 1000, maxDelayMs: 60000, maxAttempts: 5 });

    const queue = await request(app)
      .post(`/api/projects/${projectId}/queues`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "emails", defaultRetryPolicyId: policy.body.id });

    expect(queue.status).toBe(201);
    expect(queue.body.defaultRetryPolicyId).toBe(policy.body.id);
  });

  it("404s creating a queue under a project from a different org", async () => {
    const { projectId } = await registerOrgAndProject("a@x.com");
    const { token: tokenB } = await registerOrgAndProject("b@x.com");

    const res = await request(app)
      .post(`/api/projects/${projectId}/queues`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ name: "emails" });
    expect(res.status).toBe(404);
  });

  it("lists queues for a project", async () => {
    const { token, projectId } = await registerOrgAndProject("a@x.com");
    await request(app).post(`/api/projects/${projectId}/queues`).set("Authorization", `Bearer ${token}`).send({ name: "q1" });
    await request(app).post(`/api/projects/${projectId}/queues`).set("Authorization", `Bearer ${token}`).send({ name: "q2" });

    const res = await request(app)
      .get(`/api/projects/${projectId}/queues`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
  });

  it("updates queue config - pause/resume, priority, concurrency", async () => {
    const { token, projectId } = await registerOrgAndProject("a@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "emails" });

    const res = await request(app)
      .patch(`/api/projects/${projectId}/queues/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ isPaused: true, priority: 10, maxConcurrency: 50 });

    expect(res.status).toBe(200);
    expect(res.body.isPaused).toBe(true);
    expect(res.body.priority).toBe(10);
    expect(res.body.maxConcurrency).toBe(50);
  });

  it("404s fetching a queue that belongs to another org", async () => {
    const { token, projectId } = await registerOrgAndProject("a@x.com");
    const { token: tokenB } = await registerOrgAndProject("b@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "emails" });

    const res = await request(app)
      .get(`/api/projects/${projectId}/queues/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("deletes a queue", async () => {
    const { token, projectId } = await registerOrgAndProject("a@x.com");
    const created = await request(app)
      .post(`/api/projects/${projectId}/queues`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "emails" });

    const del = await request(app)
      .delete(`/api/projects/${projectId}/queues/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const res = await request(app)
      .get(`/api/projects/${projectId}/queues/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("rejects invalid queue config (negative concurrency)", async () => {
    const { token, projectId } = await registerOrgAndProject("a@x.com");
    const res = await request(app)
      .post(`/api/projects/${projectId}/queues`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "emails", maxConcurrency: -1 });
    expect(res.status).toBe(400);
  });
});
