import { Pool } from "pg";

export interface WorkerDto {
  id: string;
  hostname: string;
  pid: number;
  status: string;
  startedAt: string;
  lastSeenAt: string;
  isOnline: boolean;
}

// A worker is considered online if it has heartbeat within this window.
// Default heartbeat interval is 15s (see worker/.env.example) - 45s gives
// two missed beats of slack before we call it stale, to avoid flapping on
// momentary delays.
const ONLINE_THRESHOLD_SECONDS = 45;

function toDto(row: any): WorkerDto {
  const lastSeenAt = new Date(row.last_seen_at);
  const isOnline =
    row.status !== "OFFLINE" && Date.now() - lastSeenAt.getTime() < ONLINE_THRESHOLD_SECONDS * 1000;

  return {
    id: row.id,
    hostname: row.hostname,
    pid: row.pid,
    status: row.status,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
    isOnline,
  };
}

export async function listWorkers(pool: Pool): Promise<WorkerDto[]> {
  const result = await pool.query(`SELECT * FROM workers ORDER BY last_seen_at DESC`);
  return result.rows.map(toDto);
}

export interface WorkerHeartbeatDto {
  id: string;
  heartbeatAt: string;
  currentJobId: string | null;
}

export async function listWorkerHeartbeats(pool: Pool, workerId: string, limit = 50): Promise<WorkerHeartbeatDto[]> {
  const result = await pool.query(
    `SELECT * FROM worker_heartbeats WHERE worker_id = $1 ORDER BY heartbeat_at DESC LIMIT $2`,
    [workerId, limit]
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    heartbeatAt: row.heartbeat_at,
    currentJobId: row.current_job_id,
  }));
}
