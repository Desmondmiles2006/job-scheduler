import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Layout } from "../components/Layout";
import { JobStatusPill } from "../components/StatusPill";
import { RunAtCountdown, LeaseCountdown } from "../components/Countdown";
import { api } from "../api";
import type { Job, JobExecution, JobLog } from "../api";
import { ApiError } from "../api/client";

const PIPELINE_STEPS = ["QUEUED", "SCHEDULED", "CLAIMED", "RUNNING", "COMPLETED"];

function LifecycleStepLabel({ step, isCurrent }: { step: string; isCurrent: boolean }) {
  if (isCurrent) return <JobStatusPill status={step} />;
  return (
    <span className="row-meta" style={{ color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
      {step.toLowerCase().replace("_", " ")}
    </span>
  );
}

function JobLifecycle({ status }: { status: string }) {
  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="nav-section-label" style={{ marginBottom: 16 }}>
        Lifecycle
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {PIPELINE_STEPS.map((step, i) => (
          <div key={step} style={{ display: "flex", alignItems: "center", flex: i === PIPELINE_STEPS.length - 1 ? "0 0 auto" : 1 }}>
            <LifecycleStepLabel step={step} isCurrent={step === status} />
            {i < PIPELINE_STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: "var(--border-strong)", margin: "0 12px" }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)" }}>
        <span className="row-meta" style={{ color: "var(--text-faint)" }}>on failure:</span>
        <LifecycleStepLabel step="FAILED" isCurrent={status === "FAILED"} />
        <span className="row-meta" style={{ color: "var(--text-faint)" }}>→ retry ↻ back to scheduled, or once attempts are exhausted →</span>
        <LifecycleStepLabel step="DEAD_LETTER" isCurrent={status === "DEAD_LETTER"} />
        <span className="row-meta" style={{ color: "var(--text-faint)", marginLeft: 16 }}>or, if cancelled before it runs:</span>
        <LifecycleStepLabel step="CANCELLED" isCurrent={status === "CANCELLED"} />
      </div>
    </div>
  );
}

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
            <JobStatusPill status={job.status} />{" "}
            {(job.status === "QUEUED" || job.status === "SCHEDULED") && <RunAtCountdown runAt={job.runAt} />}
            {(job.status === "CLAIMED" || job.status === "RUNNING") && <LeaseCountdown lockedUntil={job.lockedUntil} />}
            &nbsp; attempt {job.attempts}/{job.maxAttempts}
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

      <JobLifecycle status={job.status} />

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
