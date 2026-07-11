import { Pool } from "pg";
import { tick } from "../lib/tick";
import { computeNextRun } from "../lib/cron";
import { getTestPool, truncateAll, seedProjectAndQueue } from "./testDb";

async function insertScheduledJob(
  pool: Pool,
  queueId: string,
  overrides: Partial<{ cronExpression: string; nextRunAt: Date; isEnabled: boolean; name: string }> = {}
) {
  const {
    cronExpression = "*/5 * * * *",
    nextRunAt = new Date(Date.now() - 1000), // due 1s ago
    isEnabled = true,
    name = "nightly-report",
  } = overrides;

  const result = await pool.query(
    `INSERT INTO scheduled_jobs (queue_id, name, cron_expression, timezone, job_type, payload_template, is_enabled, next_run_at)
     VALUES ($1, $2, $3, 'UTC', 'send_report', '{"kind":"nightly"}'::jsonb, $4, $5)
     RETURNING id`,
    [queueId, name, cronExpression, isEnabled, nextRunAt]
  );
  return result.rows[0].id as string;
}

describe("scheduler tick", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = getTestPool();
  });
  afterAll(async () => {
    await pool.end();
  });
  beforeEach(async () => {
    await truncateAll(pool);
  });

  it("enqueues a job for a due scheduled_job and advances next_run_at into the future", async () => {
    const { queueId } = await seedProjectAndQueue(pool);
    const scheduledId = await insertScheduledJob(pool, queueId);

    const result = await tick(pool);
    expect(result.enqueued).toBe(1);

    const jobs = await pool.query(`SELECT * FROM jobs WHERE scheduled_job_id = $1`, [scheduledId]);
    expect(jobs.rows.length).toBe(1);
    expect(jobs.rows[0].status).toBe("QUEUED");
    expect(jobs.rows[0].type).toBe("send_report");
    expect(jobs.rows[0].payload).toEqual({ kind: "nightly" });

    const sched = await pool.query(`SELECT next_run_at, last_run_at FROM scheduled_jobs WHERE id = $1`, [
      scheduledId,
    ]);
    expect(new Date(sched.rows[0].next_run_at).getTime()).toBeGreaterThan(Date.now());
    expect(sched.rows[0].last_run_at).not.toBeNull();
  });

  it("does not enqueue anything for scheduled_jobs that are not yet due", async () => {
    const { queueId } = await seedProjectAndQueue(pool);
    await insertScheduledJob(pool, queueId, { nextRunAt: new Date(Date.now() + 60_000) });

    const result = await tick(pool);
    expect(result.enqueued).toBe(0);
  });

  it("does not enqueue anything for disabled scheduled_jobs", async () => {
    const { queueId } = await seedProjectAndQueue(pool);
    await insertScheduledJob(pool, queueId, { isEnabled: false });

    const result = await tick(pool);
    expect(result.enqueued).toBe(0);
  });

  it("running tick twice in a row does not double-enqueue the same due run", async () => {
    const { queueId } = await seedProjectAndQueue(pool);
    const scheduledId = await insertScheduledJob(pool, queueId, { cronExpression: "0 0 1 1 *" }); // yearly, far future next time

    const first = await tick(pool);
    expect(first.enqueued).toBe(1);

    // Second tick immediately after: next_run_at has already been advanced
    // into the future by the first tick, so nothing should fire again.
    const second = await tick(pool);
    expect(second.enqueued).toBe(0);

    const jobs = await pool.query(`SELECT * FROM jobs WHERE scheduled_job_id = $1`, [scheduledId]);
    expect(jobs.rows.length).toBe(1);
  });

  it("concurrent ticks never double-enqueue the same due scheduled_job (SKIP LOCKED)", async () => {
    const { queueId } = await seedProjectAndQueue(pool);
    const scheduledId = await insertScheduledJob(pool, queueId);

    // Simulate two scheduler processes both believing they are leader at the
    // same instant and ticking concurrently.
    const [r1, r2] = await Promise.all([tick(pool), tick(pool)]);

    const totalEnqueued = r1.enqueued + r2.enqueued;
    expect(totalEnqueued).toBe(1);

    const jobs = await pool.query(`SELECT * FROM jobs WHERE scheduled_job_id = $1`, [scheduledId]);
    expect(jobs.rows.length).toBe(1);
  });
});

describe("computeNextRun", () => {
  it("computes the next occurrence after a given reference time", () => {
    const next = computeNextRun("*/5 * * * *", "UTC", new Date("2026-07-11T00:00:00Z"));
    expect(next.toISOString()).toBe("2026-07-11T00:05:00.000Z");
  });
});
