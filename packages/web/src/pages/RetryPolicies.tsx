import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { api } from "../api";
import type { RetryPolicy } from "../api";
import { ApiError } from "../api/client";

const STRATEGIES = ["FIXED", "LINEAR", "EXPONENTIAL"] as const;

export function RetryPolicies() {
  const { projectId } = useParams<{ projectId: string }>();
  const [policies, setPolicies] = useState<RetryPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState<(typeof STRATEGIES)[number]>("EXPONENTIAL");
  const [baseDelayMs, setBaseDelayMs] = useState(1000);
  const [maxDelayMs, setMaxDelayMs] = useState(60000);
  const [maxAttempts, setMaxAttempts] = useState(5);
  const [multiplier, setMultiplier] = useState(2);

  async function load() {
    if (!projectId) return;
    setLoading(true);
    const page = await api.listRetryPolicies(projectId);
    setPolicies(page.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!projectId) return;
    setError(null);
    setCreating(true);
    try {
      await api.createRetryPolicy(projectId, { name, strategy, baseDelayMs, maxDelayMs, maxAttempts, multiplier });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create retry policy.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Retry policies</h1>
          <p className="page-subtitle">Reusable retry/backoff configurations that queues can use as their default.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        {error && <div className="error-banner">{error}</div>}
        <form className="form-inline" onSubmit={handleCreate}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="policyName">Name</label>
            <input id="policyName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 160 }}>
            <label htmlFor="strategy">Strategy</label>
            <select id="strategy" value={strategy} onChange={(e) => setStrategy(e.target.value as (typeof STRATEGIES)[number])}>
              {STRATEGIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0, width: 130 }}>
            <label htmlFor="baseDelayMs">Base delay (ms)</label>
            <input
              id="baseDelayMs"
              type="number"
              min={0}
              value={baseDelayMs}
              onChange={(e) => setBaseDelayMs(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 130 }}>
            <label htmlFor="maxDelayMs">Max delay (ms)</label>
            <input
              id="maxDelayMs"
              type="number"
              min={0}
              value={maxDelayMs}
              onChange={(e) => setMaxDelayMs(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 110 }}>
            <label htmlFor="maxAttempts">Max attempts</label>
            <input
              id="maxAttempts"
              type="number"
              min={1}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 110 }}>
            <label htmlFor="multiplier">Multiplier</label>
            <input
              id="multiplier"
              type="number"
              min={1}
              step={0.1}
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create policy"}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : policies.length === 0 ? (
        <div className="empty-state">No retry policies yet. Create one above.</div>
      ) : (
        <div className="list">
          {policies.map((p) => (
            <div key={p.id} className="row">
              <div>
                <div className="row-title">{p.name}</div>
                <div className="row-meta">
                  {p.strategy.toLowerCase()} · base {p.baseDelayMs}ms · max {p.maxDelayMs}ms · x{p.multiplier} ·{" "}
                  {p.maxAttempts} attempts
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
