import { Pool, PoolClient } from "pg";

// Arbitrary fixed 64-bit key identifying "the scheduler leader lock". Any
// number works as long as every scheduler instance uses the same one and
// nothing else in the system reuses it.
const SCHEDULER_LOCK_KEY = 918_273_645;

/**
 * Holds a dedicated connection and tries to acquire a session-level advisory
 * lock. Advisory locks are automatically released if the connection drops,
 * so a crashed scheduler instance can never leave the lock stuck held -
 * another instance picks it up on its next attempt.
 */
export class LeaderElection {
  private client: PoolClient | null = null;
  private isLeaderFlag = false;

  constructor(private pool: Pool) {}

  async tryAcquire(): Promise<boolean> {
    if (this.isLeaderFlag) return true;

    this.client = await this.pool.connect();
    const result = await this.client.query<{ pg_try_advisory_lock: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS pg_try_advisory_lock",
      [SCHEDULER_LOCK_KEY]
    );
    this.isLeaderFlag = result.rows[0].pg_try_advisory_lock;

    if (!this.isLeaderFlag) {
      this.client.release();
      this.client = null;
    }
    return this.isLeaderFlag;
  }

  isLeader(): boolean {
    return this.isLeaderFlag;
  }

  async release(): Promise<void> {
    if (this.client) {
      await this.client.query("SELECT pg_advisory_unlock($1)", [SCHEDULER_LOCK_KEY]);
      this.client.release();
      this.client = null;
    }
    this.isLeaderFlag = false;
  }
}
