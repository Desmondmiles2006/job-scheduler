import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../app";
import { getTestPool, truncateAll } from "./testDb";
import { closePool } from "../lib/db";

const app = createApp();

async function registerOrg(email: string) {
  const res = await request(app).post("/api/auth/register").send({
    orgName: `Org for ${email}`,
    name: "Owner",
    email,
    password: "correct-horse-battery-staple",
  });
  return res.body.accessToken as string;
}

describe("projects", () => {
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

  it("creates a project", async () => {
    const token = await registerOrg("a@x.com");
    const res = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Payments Platform" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Payments Platform");
  });

  it("rejects duplicate project names within the same org", async () => {
    const token = await registerOrg("a@x.com");
    await request(app).post("/api/projects").set("Authorization", `Bearer ${token}`).send({ name: "Dup" });
    const res = await request(app).post("/api/projects").set("Authorization", `Bearer ${token}`).send({ name: "Dup" });
    expect(res.status).toBe(409);
  });

  it("paginates project listing with a cursor", async () => {
    const token = await registerOrg("a@x.com");
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post("/api/projects")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: `Project ${i}` });
    }

    const firstPage = await request(app)
      .get("/api/projects?limit=2")
      .set("Authorization", `Bearer ${token}`);
    expect(firstPage.body.items.length).toBe(2);
    expect(firstPage.body.nextCursor).not.toBeNull();

    const secondPage = await request(app)
      .get(`/api/projects?limit=2&cursor=${encodeURIComponent(firstPage.body.nextCursor)}`)
      .set("Authorization", `Bearer ${token}`);
    expect(secondPage.body.items.length).toBe(2);

    const firstIds = firstPage.body.items.map((p: { id: string }) => p.id);
    const secondIds = secondPage.body.items.map((p: { id: string }) => p.id);
    expect(firstIds.some((id: string) => secondIds.includes(id))).toBe(false);
  });

  it("returns a project by id", async () => {
    const token = await registerOrg("a@x.com");
    const created = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Getme" });

    const res = await request(app)
      .get(`/api/projects/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("returns 404 for a project belonging to a different org (tenant isolation)", async () => {
    const tokenA = await registerOrg("a@x.com");
    const tokenB = await registerOrg("b@x.com");

    const created = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Secret Project" });

    const res = await request(app)
      .get(`/api/projects/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it("updates a project name", async () => {
    const token = await registerOrg("a@x.com");
    const created = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Old Name" });

    const res = await request(app)
      .patch(`/api/projects/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
  });

  it("soft-deletes a project - subsequent GET returns 404", async () => {
    const token = await registerOrg("a@x.com");
    const created = await request(app)
      .post("/api/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "To Delete" });

    const del = await request(app)
      .delete(`/api/projects/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const getRes = await request(app)
      .get(`/api/projects/${created.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(404);

    const row = await pool.query(`SELECT deleted_at FROM projects WHERE id = $1`, [created.body.id]);
    expect(row.rows[0].deleted_at).not.toBeNull();
  });
});
