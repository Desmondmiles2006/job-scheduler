import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../app";
import { getTestPool, truncateAll } from "./testDb";
import { closePool } from "../lib/db";

const app = createApp();

describe("auth", () => {
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

  const validRegister = {
    orgName: "Acme Inc",
    name: "Alice Admin",
    email: "alice@acme.com",
    password: "correct-horse-battery-staple",
  };

  it("registers a new org + owner user and returns tokens", async () => {
    const res = await request(app).post("/api/auth/register").send(validRegister);
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(validRegister.email);
    expect(res.body.user.role).toBe("OWNER");
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
  });

  it("rejects registration with an invalid payload", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...validRegister, password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects duplicate email registration", async () => {
    await request(app).post("/api/auth/register").send(validRegister);
    const res = await request(app).post("/api/auth/register").send(validRegister);
    expect(res.status).toBe(409);
  });

  it("logs in with correct credentials", async () => {
    await request(app).post("/api/auth/register").send(validRegister);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validRegister.email, password: validRegister.password });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("rejects login with wrong password", async () => {
    await request(app).post("/api/auth/register").send(validRegister);
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: validRegister.email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects login for a nonexistent email", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@x.com", password: "whatever" });
    expect(res.status).toBe(401);
  });

  it("rejects access to a protected route without a token", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
  });

  it("allows access to a protected route with a valid access token", async () => {
    const register = await request(app).post("/api/auth/register").send(validRegister);
    const res = await request(app)
      .get("/api/projects")
      .set("Authorization", `Bearer ${register.body.accessToken}`);
    expect(res.status).toBe(200);
  });

  it("refresh issues new tokens and rotates the old refresh token out", async () => {
    const register = await request(app).post("/api/auth/register").send(validRegister);
    const oldRefreshToken = register.body.refreshToken;

    const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken: oldRefreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(oldRefreshToken);

    // Reusing the rotated-out token must fail.
    const reuse = await request(app).post("/api/auth/refresh").send({ refreshToken: oldRefreshToken });
    expect(reuse.status).toBe(401);
  });

  it("rejects an unknown refresh token", async () => {
    const res = await request(app).post("/api/auth/refresh").send({ refreshToken: "not-a-real-token" });
    expect(res.status).toBe(401);
  });

  it("logout revokes the refresh token", async () => {
    const register = await request(app).post("/api/auth/register").send(validRegister);
    const { accessToken, refreshToken } = register.body;

    const logoutRes = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(204);

    const refreshAfterLogout = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });
});
