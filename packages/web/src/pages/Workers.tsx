import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { StatusPill } from "../components/StatusPill";
import { api } from "../api";
import type { Worker } from "../api";

export function Workers() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await api.listWorkers();
    setWorkers(res.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Workers</h1>
          <p className="page-subtitle">Fleet status across all worker processes, refreshed every 10s.</p>
        </div>
      </div>

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : workers.length === 0 ? (
        <div className="empty-state">No workers have registered yet. Start one with `npm run dev:worker`.</div>
      ) : (
        <div className="list">
          {workers.map((w) => (
            <div key={w.id} className="row">
              <div>
                <div className="row-title mono">{w.hostname}</div>
                <div className="row-meta">
                  pid {w.pid} · last seen {new Date(w.lastSeenAt).toLocaleTimeString()}
                </div>
              </div>
              <StatusPill label={w.isOnline ? "online" : "offline"} variant={w.isOnline ? "active" : "neutral"} />
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
