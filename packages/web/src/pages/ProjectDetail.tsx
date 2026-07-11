import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { StatusPill } from "../components/StatusPill";
import { api } from "../api";
import type { Project, Queue, RetryPolicy } from "../api";
import { ApiError } from "../api/client";

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [retryPolicies, setRetryPolicies] = useState<RetryPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [maxConcurrency, setMaxConcurrency] = useState(5);
  const [retryPolicyId, setRetryPolicyId] = useState<string>("");
  const [creating, setCreating] = useState(false);

  async function load() {
    if (!projectId) return;
    setLoading(true);
    const [proj, queuePage, policies] = await Promise.all([
      api.getProject(projectId),
      api.listQueues(projectId),
      api.listRetryPolicies(projectId),
    ]);
    setProject(proj);
    setQueues(queuePage.items);
    setRetryPolicies(policies.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function ensureDefaultRetryPolicy(): Promise<string | undefined> {
    if (retryPolicyId) return retryPolicyId;
    if (retryPolicies.length > 0) return retryPolicies[0].id;
    if (!projectId) return undefined;
    // First queue in a fresh project: create a sensible default policy so
    // the queue isn't left without one.
    const policy = await api.createRetryPolicy(projectId, {
      name: "default",
      strategy: "EXPONENTIAL",
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      maxAttempts: 5,
      multiplier: 2,
    });
    setRetryPolicies((prev) => [policy, ...prev]);
    return policy.id;
  }

  async function handleCreateQueue(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setError(null);
    setCreating(true);
    try {
      const policyId = await ensureDefaultRetryPolicy();
      await api.createQueue(projectId, { name, maxConcurrency, defaultRetryPolicyId: policyId });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create queue.");
    } finally {
      setCreating(false);
    }
  }

  async function togglePause(queue: Queue) {
    if (!projectId) return;
    await api.updateQueue(projectId, queue.id, { isPaused: !queue.isPaused });
    await load();
  }

  if (loading) {
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
          <h1 className="page-title">{project?.name}</h1>
          <p className="page-subtitle">Queues determine concurrency, priority, and retry behavior for jobs.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to={`/projects/${projectId}/retry-policies`} className="btn">
            Retry policies
          </Link>
          <Link to={`/projects/${projectId}/dead-letter-jobs`} className="btn">
            Dead letter queue
          </Link>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        {error && <div className="error-banner">{error}</div>}
        <form className="form-inline" onSubmit={handleCreateQueue}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="queueName">Queue name</label>
            <input id="queueName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 140 }}>
            <label htmlFor="maxConcurrency">Max concurrency</label>
            <input
              id="maxConcurrency"
              type="number"
              min={1}
              value={maxConcurrency}
              onChange={(e) => setMaxConcurrency(Number(e.target.value))}
            />
          </div>
          {retryPolicies.length > 0 && (
            <div className="field" style={{ marginBottom: 0, width: 200 }}>
              <label htmlFor="retryPolicy">Retry policy</label>
              <select id="retryPolicy" value={retryPolicyId} onChange={(e) => setRetryPolicyId(e.target.value)}>
                <option value="">Default ({retryPolicies[0].name})</option>
                {retryPolicies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.strategy.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create queue"}
          </button>
        </form>
      </div>

      {queues.length === 0 ? (
        <div className="empty-state">No queues yet. Create one above.</div>
      ) : (
        <div className="list">
          {queues.map((q) => (
            <div key={q.id} className="row">
              <Link to={`/projects/${projectId}/queues/${q.id}`} style={{ color: "inherit" }}>
                <div className="row-title">{q.name}</div>
                <div className="row-meta">
                  priority {q.priority} · concurrency {q.maxConcurrency}
                </div>
              </Link>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <StatusPill label={q.isPaused ? "paused" : "active"} variant={q.isPaused ? "paused" : "active"} />
                <button className="btn" onClick={() => togglePause(q)}>
                  {q.isPaused ? "Resume" : "Pause"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
