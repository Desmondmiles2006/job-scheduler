import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../app";
import { getTestPool, truncateAll } from "./testDb";
import { closePool } from "../lib/db";
import { registerOrgProjectQueue } from "./helpers";

const app = createApp();

describe("workers", () => {
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

  it("lists workers and marks a recently-seen one as online", async () => {
    const { token } = await registerOrgProjectQueue(app, "a@x.com");
    await pool.query(
      `INSERT INTO workers (hostname, pid, status, last_seen_at) VALUES ('host-1', 100, 'IDLE', now())`
    );

    const res = await request(app).get("/api/workers").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].isOnline).toBe(true);
  });

  it("marks a worker with a stale heartbeat as offline", async () => {
    const { token } = await registerOrgProjectQueue(app, "a@x.com");
    await pool.query(
      `INSERT INTO workers (hostname, pid, status, last_seen_at) VALUES ('host-2', 101, 'IDLE', now() - interval '5 minutes')`
    );

    const res = await request(app).get("/api/workers").set("Authorization", `Bearer ${token}`);
    expect(res.body.items[0].isOnline).toBe(false);
  });

  it("returns heartbeat history for a worker", async () => {
    const { token } = await registerOrgProjectQueue(app, "a@x.com");
    const worker = await pool.query(
      `INSERT INTO workers (hostname, pid, status) VALUES ('host-3', 102, 'IDLE') RETURNING id`
    );
    await pool.query(`INSERT INTO worker_heartbeats (worker_id) VALUES ($1)`, [worker.rows[0].id]);
    await pool.query(`INSERT INTO worker_heartbeats (worker_id) VALUES ($1)`, [worker.rows[0].id]);

    const res = await request(app)
      .get(`/api/workers/${worker.rows[0].id}/heartbeats`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(2);
  });

  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/workers");
    expect(res.status).toBe(401);
  });
});
