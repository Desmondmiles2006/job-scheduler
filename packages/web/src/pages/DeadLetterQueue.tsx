import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api } from "../api";
import type { DeadLetterJob } from "../api";
import { ApiError } from "../api/client";

export function DeadLetterQueue() {
  const { projectId } = useParams<{ projectId: string }>();
  const [items, setItems] = useState<DeadLetterJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  async function load() {
    if (!projectId) return;
    setLoading(true);
    const page = await api.listDeadLetterJobs(projectId);
    setItems(page.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleRetry(dlqId: string) {
    if (!projectId) return;
    setError(null);
    setRetryingId(dlqId);
    try {
      await api.retryDeadLetterJob(projectId, dlqId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not retry job.");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dead letter queue</h1>
          <p className="page-subtitle">Jobs that exhausted every retry attempt. Retrying requeues them from scratch.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nothing here - every job either succeeded or is still retrying.</div>
      ) : (
        <div className="list">
          {items.map((d) => (
            <div key={d.id} className="row">
              <div>
                <div className="row-title mono">{d.jobType}</div>
                <div className="row-meta">
                  {d.failureReason} · {d.attempts} attempts · {new Date(d.movedAt).toLocaleString()}
                </div>
              </div>
              <button className="btn btn-primary" onClick={() => handleRetry(d.id)} disabled={retryingId === d.id}>
                {retryingId === d.id ? "Retrying..." : "Retry"}
              </button>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
