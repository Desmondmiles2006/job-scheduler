import "dotenv/config";
import os from "os";
import pino from "pino";
import { createPool } from "./lib/db";
import { claimJobs, completeJob, extendLease, failJob, markRunning, reapExpiredLeases, ClaimedJob } from "./lib/claim";
import { getActiveQueues, availableCapacity } from "./lib/queues";
import { getHandler } from "./lib/handlers";

const log = pino({ name: "worker" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 1000);
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 10);
const LEASE_SECONDS = Number(process.env.LEASE_SECONDS ?? 300);
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 15000);
const QUEUE_IDS = (process.env.QUEUE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const pool = createPool(DATABASE_URL);

let workerId: string;
let shuttingDown = false;
const inFlightLeaseTimers = new Map<string, ReturnType<typeof setInterval>>();

async function registerWorker(): Promise<string> {
  const result = await pool.query(
    `INSERT INTO workers (hostname, pid, status) VALUES ($1, $2, 'IDLE') RETURNING id`,
    [os.hostname(), process.pid]
  );
  return result.rows[0].id;
}

async function heartbeat(): Promise<void> {
  await pool.query(`UPDATE workers SET last_seen_at = now() WHERE id = $1`, [workerId]);
  await pool.query(`INSERT INTO worker_heartbeats (worker_id) VALUES ($1)`, [workerId]);
}

async function executeJob(job: ClaimedJob): Promise<void> {
  const executionResult = await pool.query(
    `INSERT INTO job_executions (job_id, worker_id, attempt_number, status)
     VALUES ($1, $2, $3, 'RUNNING') RETURNING id`,
    [job.id, workerId, job.attempts]
  );
  const executionId = executionResult.rows[0].id;

  await markRunning(pool, job.id);

  // Extend the lease periodically for long-running jobs so the reaper never
  // mistakes a slow-but-alive job for a crashed worker.
  const leaseTimer = setInterval(() => {
    extendLease(pool, job.id, workerId, LEASE_SECONDS).catch((err) =>
      log.error({ err, jobId: job.id }, "failed to extend lease")
    );
  }, Math.floor((LEASE_SECONDS * 1000) / 2));
  inFlightLeaseTimers.set(job.id, leaseTimer);

  try {
    const handler = getHandler(job.type);
    const result = await handler(job.payload);

    await pool.query(
      `UPDATE job_executions SET status = 'SUCCEEDED', finished_at = now(), result = $2 WHERE id = $1`,
      [executionId, JSON.stringify(result ?? null)]
    );
    await completeJob(pool, job.id);
    log.info({ jobId: job.id, type: job.type }, "job completed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await pool.query(
      `UPDATE job_executions SET status = 'FAILED', finished_at = now(), error_message = $2 WHERE id = $1`,
      [executionId, message]
    );

    let retryPolicy = null;
    if (job.retry_policy_id) {
      const policyRow = await pool.query(
        `SELECT strategy, base_delay_ms, max_delay_ms, multiplier FROM retry_policies WHERE id = $1`,
        [job.retry_policy_id]
      );
      if (policyRow.rows[0]) {
        const p = policyRow.rows[0];
        retryPolicy = {
          strategy: p.strategy,
          baseDelayMs: p.base_delay_ms,
          maxDelayMs: p.max_delay_ms,
          multiplier: p.multiplier,
        };
      }
    }

    const outcome = await failJob(pool, job, message, retryPolicy);
    log.warn({ jobId: job.id, type: job.type, outcome, error: message }, "job failed");
  } finally {
    clearInterval(leaseTimer);
    inFlightLeaseTimers.delete(job.id);
  }
}

async function pollOnce(): Promise<void> {
  const queues = await getActiveQueues(pool, QUEUE_IDS.length > 0 ? QUEUE_IDS : undefined);

  for (const queue of queues) {
    if (shuttingDown) return;

    const capacity = await availableCapacity(pool, queue);
    if (capacity <= 0) continue;

    const batchSize = Math.min(BATCH_SIZE, capacity);
    const jobs = await claimJobs(pool, {
      queueId: queue.id,
      workerId,
      batchSize,
      leaseSeconds: LEASE_SECONDS,
    });

    // Execute claimed jobs concurrently - claiming already enforced the
    // concurrency ceiling, so no further gating is needed here.
    jobs.forEach((job) => {
      executeJob(job).catch((err) => log.error({ err, jobId: job.id }, "unhandled executeJob error"));
    });
  }
}

async function main(): Promise<void> {
  workerId = await registerWorker();
  log.info({ workerId }, "worker registered");

  const heartbeatTimer = setInterval(() => {
    heartbeat().catch((err) => log.error({ err }, "heartbeat failed"));
  }, HEARTBEAT_INTERVAL_MS);

  const reaperTimer = setInterval(() => {
    reapExpiredLeases(pool).then((n) => {
      if (n > 0) log.warn({ reclaimed: n }, "reaped jobs with expired leases");
    }).catch((err) => log.error({ err }, "reaper failed"));
  }, LEASE_SECONDS * 1000);

  const pollTimer = setInterval(() => {
    if (!shuttingDown) {
      pollOnce().catch((err) => log.error({ err }, "poll failed"));
    }
  }, POLL_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down gracefully, waiting for in-flight jobs");

    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    clearInterval(reaperTimer);

    const deadline = Date.now() + 30_000;
    while (inFlightLeaseTimers.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }

    await pool.query(`UPDATE workers SET status = 'OFFLINE' WHERE id = $1`, [workerId]);
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  log.error({ err }, "worker crashed on startup");
  process.exit(1);
});
