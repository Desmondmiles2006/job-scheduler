import { Pool } from "pg";
import { LeaderElection } from "../lib/leaderElection";
import { getTestPool } from "./testDb";

describe("LeaderElection", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool();
  });
  afterAll(async () => {
    await pool.end();
  });

  it("only one of several concurrent instances acquires leadership", async () => {
    const instances = Array.from({ length: 5 }, () => new LeaderElection(pool));

    const results = await Promise.all(instances.map((e) => e.tryAcquire()));
    const leaders = results.filter(Boolean);

    expect(leaders.length).toBe(1);

    await Promise.all(instances.map((e) => e.release()));
  });

  it("releasing leadership allows another instance to acquire it", async () => {
    const a = new LeaderElection(pool);
    const b = new LeaderElection(pool);

    expect(await a.tryAcquire()).toBe(true);
    expect(await b.tryAcquire()).toBe(false);

    await a.release();

    expect(await b.tryAcquire()).toBe(true);
    await b.release();
  });
});
