import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Layout } from "../components/Layout";
import { api } from "../api";
import type { Project, DashboardSummary } from "../api";
import { ApiError } from "../api/client";

function StatNumber({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</div>
      <div className="row-meta">{label}</div>
    </div>
  );
}

function ThroughputChart({ data }: { data: { hour: string; count: number }[] }) {
  const chartData = data.map((d) => ({
    hour: new Date(d.hour).toLocaleTimeString([], { hour: "numeric" }),
    count: d.count,
  }));

  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="hour"
          tick={{ fill: "var(--text-faint)", fontSize: 11 }}
          axisLine={{ stroke: "var(--border-strong)" }}
          tickLine={false}
          interval={2}
        />
        <YAxis allowDecimals={false} tick={{ fill: "var(--text-faint)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip
          contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border-strong)", borderRadius: 6, fontSize: 12 }}
          labelStyle={{ color: "var(--text)" }}
          itemStyle={{ color: "var(--text-muted)" }}
          cursor={{ fill: "var(--accent-dim)", opacity: 0.3 }}
        />
        <Bar dataKey="count" name="Completed" fill="var(--accent)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [page, dashboardSummary] = await Promise.all([api.listProjects(), api.getDashboardSummary()]);
    setProjects(page.items);
    setSummary(dashboardSummary);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await api.createProject(name);
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create project.");
    } finally {
      setCreating(false);
    }
  }

  async function handleRetry(projectId: string, dlqId: string) {
    setRetryError(null);
    setRetryingId(dlqId);
    try {
      await api.retryDeadLetterJob(projectId, dlqId);
      await load();
    } catch (err) {
      setRetryError(err instanceof ApiError ? err.message : "Could not retry job.");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Throughput and system health across all of your projects.</p>
        </div>
      </div>

      {summary && (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="nav-section-label" style={{ marginBottom: 12 }}>
              Jobs by status
            </div>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 20 }}>
              <StatNumber label="Queued" value={summary.statusCounts.QUEUED ?? 0} color="var(--text)" />
              <StatNumber label="Running" value={summary.statusCounts.RUNNING ?? 0} color="var(--accent)" />
              <StatNumber label="Completed" value={summary.statusCounts.COMPLETED ?? 0} color="var(--success)" />
              <StatNumber label="Failed" value={summary.statusCounts.FAILED ?? 0} color="var(--warning)" />
              <StatNumber label="Dead-lettered" value={summary.statusCounts.DEAD_LETTER ?? 0} color="var(--danger)" />
            </div>
            <div className="row-meta" style={{ marginBottom: 8 }}>
              Completed jobs, last 24 hours
            </div>
            <ThroughputChart data={summary.completedLastHours} />
          </div>

          <div className="card" style={{ marginBottom: 24 }}>
            <div className="nav-section-label" style={{ marginBottom: 12 }}>
              Workers
            </div>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              <StatNumber label="Online" value={summary.workersOnline} color="var(--success)" />
              <StatNumber label="Offline" value={summary.workersOffline} color="var(--text-muted)" />
            </div>
          </div>

          <div className="page-header">
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Recent dead-letter jobs</h2>
          </div>

          {retryError && <div className="error-banner">{retryError}</div>}

          {summary.recentDeadLetterJobs.length === 0 ? (
            <div className="empty-state">Nothing here - every job either succeeded or is still retrying.</div>
          ) : (
            <div className="list" style={{ marginBottom: 32 }}>
              {summary.recentDeadLetterJobs.map((d) => (
                <div key={d.id} className="row">
                  <div>
                    <div className="row-title mono">{d.jobType}</div>
                    <div className="row-meta">
                      {d.projectName} · {d.failureReason} · {d.attempts} attempts · {new Date(d.movedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleRetry(d.projectId, d.id)}
                    disabled={retryingId === d.id}
                  >
                    {retryingId === d.id ? "Retrying..." : "Retry"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="page-header">
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Projects</h2>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        {error && <div className="error-banner">{error}</div>}
        <form className="form-inline" onSubmit={handleCreate}>
          <div className="field" style={{ marginBottom: 0, flex: 1 }}>
            <label htmlFor="projectName">New project name</label>
            <input id="projectName" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? "Creating..." : "Create project"}
          </button>
        </form>
      </div>

      {loading ? (
        <div className="empty-state">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">No projects yet. Create one above to get started.</div>
      ) : (
        <div className="list">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="row" style={{ color: "inherit" }}>
              <span className="row-title">{p.name}</span>
              <span className="row-meta">{new Date(p.createdAt).toLocaleDateString()}</span>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
