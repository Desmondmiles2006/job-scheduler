import "dotenv/config";
import { Pool } from "pg";
import pino from "pino";
import { LeaderElection } from "./lib/leaderElection";
import { tick } from "./lib/tick";

const log = pino({ name: "scheduler" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS ?? 5000);

const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
const election = new LeaderElection(pool);
let shuttingDown = false;

async function loop(): Promise<void> {
  const acquired = await election.tryAcquire();
  if (!acquired) {
    log.debug("not leader this tick, standing by");
    return;
  }

  try {
    const result = await tick(pool);
    if (result.enqueued > 0) {
      log.info({ enqueued: result.enqueued }, "enqueued scheduled jobs");
    }
  } catch (err) {
    log.error({ err }, "tick failed");
  }
}

async function main(): Promise<void> {
  log.info("scheduler starting, attempting leadership");
  const timer = setInterval(() => {
    if (!shuttingDown) loop().catch((err) => log.error({ err }, "loop error"));
  }, TICK_INTERVAL_MS);

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, "shutting down");
    clearInterval(timer);
    await election.release();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  log.error({ err }, "scheduler crashed on startup");
  process.exit(1);
});
