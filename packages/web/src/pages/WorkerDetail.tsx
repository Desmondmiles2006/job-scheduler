import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { StatusPill } from "../components/StatusPill";
import { api } from "../api";
import type { Worker, WorkerHeartbeat } from "../api";

export function WorkerDetail() {
  const { workerId } = useParams<{ workerId: string }>();
  const [worker, setWorker] = useState<Worker | null>(null);
  const [heartbeats, setHeartbeats] = useState<WorkerHeartbeat[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!workerId) return;
    setLoading(true);
    const [workers, heartbeatPage] = await Promise.all([api.listWorkers(), api.listWorkerHeartbeats(workerId)]);
    setWorker(workers.items.find((w) => w.id === workerId) ?? null);
    setHeartbeats(heartbeatPage.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workerId]);

  if (loading || !worker) {
    return (
      <Layout>
        <div className="empty-state">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title mono">{worker.hostname}</h1>
          <p className="page-subtitle">
            <StatusPill label={worker.isOnline ? "online" : "offline"} variant={worker.isOnline ? "active" : "neutral"} />
            &nbsp; pid {worker.pid} · started {new Date(worker.startedAt).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="nav-section-label" style={{ marginBottom: 12 }}>
        Heartbeat history
      </div>

      {heartbeats.length === 0 ? (
        <div className="empty-state">No heartbeats recorded yet.</div>
      ) : (
        <div className="list">
          {heartbeats.map((h) => (
            <div key={h.id} className="row">
              <div className="row-title">{new Date(h.heartbeatAt).toLocaleString()}</div>
              <div className="row-meta mono">{h.currentJobId ? `job ${h.currentJobId}` : "idle"}</div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
