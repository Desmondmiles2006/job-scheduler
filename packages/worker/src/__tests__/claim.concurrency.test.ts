import { Pool } from "pg";
import { claimJobs, reapExpiredLeases, failJob, ClaimedJob } from "../lib/claim";
import { getTestPool, truncateAll, seedProjectAndQueue, seedJobs, seedWorkers } from "./testDb";

describe("claimJobs concurrency", () => {
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

  it("never assigns the same job to two concurrent claimants", async () => {
    const { queueId, retryPolicyId } = await seedProjectAndQueue(pool);
    const totalJobs = 100;
    await seedJobs(pool, queueId, retryPolicyId, totalJobs);

    const workerCount = 10;
    const batchSize = 10; // workerCount * batchSize === totalJobs, exact capacity
    const workerIds = await seedWorkers(pool, workerCount);

    // Fire all claims concurrently - this is the scenario that would produce
    // duplicate execution if the claim query had a read/write race.
    const results = await Promise.all(
      workerIds.map((workerId) =>
        claimJobs(pool, { queueId, workerId, batchSize, leaseSeconds: 300 })
      )
    );

    const allClaimed = results.flat();
    const uniqueIds = new Set(allClaimed.map((j) => j.id));

    expect(allClaimed.length).toBe(totalJobs);
    expect(uniqueIds.size).toBe(totalJobs); // no duplicates across workers

    // Every job should now be CLAIMED with a claimed_by matching some worker
    const { rows } = await pool.query(`SELECT status, claimed_by FROM jobs`);
    expect(rows.every((r) => r.status === "CLAIMED")).toBe(true);
    expect(rows.every((r) => workerIds.includes(r.claimed_by))).toBe(true);
  });

  it("returns nothing on a second claim attempt once all jobs are taken", async () => {
    const { queueId, retryPolicyId } = await seedProjectAndQueue(pool);
    await seedJobs(pool, queueId, retryPolicyId, 5);
    const [workerA, workerB] = await seedWorkers(pool, 2);

    const first = await claimJobs(pool, { queueId, workerId: workerA, batchSize: 10, leaseSeconds: 300 });
    expect(first.length).toBe(5);

    const second = await claimJobs(pool, { queueId, workerId: workerB, batchSize: 10, leaseSeconds: 300 });
    expect(second.length).toBe(0);
  });

  it("respects priority ordering - higher priority claimed first when batch is smaller than supply", async () => {
    const { queueId, retryPolicyId } = await seedProjectAndQueue(pool);
    await seedJobs(pool, queueId, retryPolicyId, 3);
    await pool.query(`UPDATE jobs SET priority = 5 WHERE id = (SELECT id FROM jobs ORDER BY created_at LIMIT 1)`);
    const [workerA] = await seedWorkers(pool, 1);

    const claimed = await claimJobs(pool, { queueId, workerId: workerA, batchSize: 1, leaseSeconds: 300 });
    expect(claimed.length).toBe(1);
    expect(claimed[0].priority).toBe(5);
  });

  it("does not claim jobs whose run_at is in the future", async () => {
    const { queueId, retryPolicyId } = await seedProjectAndQueue(pool);
    await seedJobs(pool, queueId, retryPolicyId, 2);
    await pool.query(`UPDATE jobs SET status = 'SCHEDULED', run_at = now() + interval '1 hour'`);
    const [workerA] = await seedWorkers(pool, 1);

    const claimed = await claimJobs(pool, { queueId, workerId: workerA, batchSize: 10, leaseSeconds: 300 });
    expect(claimed.length).toBe(0);
  });
});

describe("reapExpiredLeases", () => {
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

  it("reclaims jobs whose lease expired (simulated crashed worker)", async () => {
    const { queueId, retryPolicyId } = await seedProjectAndQueue(pool);
    await seedJobs(pool, queueId, retryPolicyId, 1);
    const [workerA] = await seedWorkers(pool, 1);

    const [job] = await claimJobs(pool, { queueId, workerId: workerA, batchSize: 1, leaseSeconds: 300 });
    expect(job.status).toBe("CLAIMED");

    // Simulate the worker crashing: force the lease into the past.
    await pool.query(`UPDATE jobs SET locked_until = now() - interval '1 minute' WHERE id = $1`, [job.id]);

    const reclaimedCount = await reapExpiredLeases(pool);
    expect(reclaimedCount).toBe(1);

    const { rows } = await pool.query(`SELECT status, claimed_by, locked_until FROM jobs WHERE id = $1`, [job.id]);
    expect(rows[0].status).toBe("QUEUED");
    expect(rows[0].claimed_by).toBeNull();
    expect(rows[0].locked_until).toBeNull();
  });

  it("does not touch jobs whose lease is still valid", async () => {
    const { queueId, retryPolicyId } = await seedProjectAndQueue(pool);
    await seedJobs(pool, queueId, retryPolicyId, 1);
    const [workerA] = await seedWorkers(pool, 1);

    await claimJobs(pool, { queueId, workerId: workerA, batchSize: 1, leaseSeconds: 300 });
    const reclaimedCount = await reapExpiredLeases(pool);
    expect(reclaimedCount).toBe(0);
  });
});

describe("failJob", () => {
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

  const retryPolicy = { strategy: "EXPONENTIAL" as const, baseDelayMs: 1000, maxDelayMs: 60000, multiplier: 2 };

  it("reschedules with backoff when attempts remain", async () => {
    const { queueId, retryPolicyId } = await seedProjectAndQueue(pool);
    await seedJobs(pool, queueId, retryPolicyId, 1);
    const [workerA] = await seedWorkers(pool, 1);
    const [job] = await claimJobs(pool, { queueId, workerId: workerA, batchSize: 1, leaseSeconds: 300 });

    const outcome = await failJob(pool, job as ClaimedJob, "boom", retryPolicy);
    expect(outcome).toBe("RESCHEDULED");

    const { rows } = await pool.query(`SELECT status, run_at FROM jobs WHERE id = $1`, [job.id]);
    expect(rows[0].status).toBe("SCHEDULED");
    expect(new Date(rows[0].run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("moves to dead letter queue once max attempts are exhausted", async () => {
    const { queueId, retryPolicyId } = await seedProjectAndQueue(pool);
    await seedJobs(pool, queueId, retryPolicyId, 1);
    await pool.query(`UPDATE jobs SET max_attempts = 1`);
    const [workerA] = await seedWorkers(pool, 1);
    const [job] = await claimJobs(pool, { queueId, workerId: workerA, batchSize: 1, leaseSeconds: 300 });
    // attempts is now 1 (claimJobs increments it), equal to max_attempts -> permanent failure

    const outcome = await failJob(pool, job as ClaimedJob, "permanent boom", retryPolicy);
    expect(outcome).toBe("DEAD_LETTERED");

    const jobRow = await pool.query(`SELECT status FROM jobs WHERE id = $1`, [job.id]);
    expect(jobRow.rows[0].status).toBe("DEAD_LETTER");

    const dlq = await pool.query(`SELECT * FROM dead_letter_jobs WHERE original_job_id = $1`, [job.id]);
    expect(dlq.rows.length).toBe(1);
    expect(dlq.rows[0].failure_reason).toBe("permanent boom");
  });
});
