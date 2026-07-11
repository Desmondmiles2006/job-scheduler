import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { JobStatusPill } from "../components/StatusPill";
import { api } from "../api";
import type { Job, JobExecution, JobLog } from "../api";
import { ApiError } from "../api/client";

export function JobDetail() {
  const { projectId, queueId, jobId } = useParams<{ projectId: string; queueId: string; jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, JobLog[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!projectId || !queueId || !jobId) return;
    setLoading(true);
    const [jobData, executionData] = await Promise.all([
      api.getJob(projectId, queueId, jobId),
      api.listExecutions(projectId, queueId, jobId),
    ]);
    setJob(jobData);
    setExecutions(executionData.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, queueId, jobId]);

  async function toggleExecution(executionId: string) {
    if (expandedExecution === executionId) {
      setExpandedExecution(null);
      return;
    }
    setExpandedExecution(executionId);
    if (!logs[executionId] && projectId && queueId && jobId) {
      const res = await api.listExecutionLogs(projectId, queueId, jobId, executionId);
      setLogs((prev) => ({ ...prev, [executionId]: res.items }));
    }
  }

  async function handleCancel() {
    if (!projectId || !queueId || !jobId) return;
    setError(null);
    try {
      await api.cancelJob(projectId, queueId, jobId);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel job.");
    }
  }

  if (loading || !job) {
    return (
      <Layout>
        <div className="empty-state">Loading...</div>
      </Layout>
    );
  }

  const cancellable = job.status === "QUEUED" || job.status === "SCHEDULED";

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1 className="page-title mono">{job.type}</h1>
          <p className="page-subtitle">
            <JobStatusPill status={job.status} /> &nbsp; attempt {job.attempts}/{job.maxAttempts}
          </p>
        </div>
        {cancellable && (
          <button className="btn btn-danger" onClick={handleCancel}>
            Cancel job
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="nav-section-label" style={{ marginBottom: 8 }}>
          Payload
        </div>
        <pre className="mono" style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 12, color: "var(--text-muted)" }}>
          {JSON.stringify(job.payload, null, 2)}
        </pre>
      </div>

      <div className="nav-section-label" style={{ marginBottom: 12 }}>
        Execution history
      </div>

      {executions.length === 0 ? (
        <div className="empty-state">No execution attempts yet.</div>
      ) : (
        <div className="list">
          {executions.map((ex) => (
            <div key={ex.id} className="card" style={{ padding: 0 }}>
              <div
                className="row"
                style={{ border: "none", cursor: "pointer" }}
                onClick={() => toggleExecution(ex.id)}
              >
                <div>
                  <div className="row-title">Attempt {ex.attemptNumber}</div>
                  <div className="row-meta">
                    {new Date(ex.startedAt).toLocaleString()}
                    {ex.finishedAt ? ` → ${new Date(ex.finishedAt).toLocaleTimeString()}` : ""}
                    {ex.errorMessage ? ` · ${ex.errorMessage}` : ""}
                  </div>
                </div>
                <JobStatusPill status={ex.status === "SUCCEEDED" ? "COMPLETED" : ex.status} />
              </div>
              {expandedExecution === ex.id && (
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                  {!logs[ex.id] ? (
                    <div className="empty-state">Loading logs...</div>
                  ) : logs[ex.id].length === 0 ? (
                    <div className="empty-state">No log lines recorded for this attempt.</div>
                  ) : (
                    <div className="mono" style={{ fontSize: 12, marginTop: 12 }}>
                      {logs[ex.id].map((l) => (
                        <div key={l.id} style={{ display: "flex", gap: 8, padding: "2px 0", color: "var(--text-muted)" }}>
                          <span style={{ color: "var(--text-faint)" }}>{new Date(l.loggedAt).toLocaleTimeString()}</span>
                          <span style={{ color: l.level === "ERROR" ? "var(--danger)" : "var(--text-muted)" }}>
                            [{l.level}]
                          </span>
                          <span>{l.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
