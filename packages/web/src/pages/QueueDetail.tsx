import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { JobStatusPill, StatusPill } from "../components/StatusPill";
import { api } from "../api";
import type { Queue, Job, ScheduledJob } from "../api";
import { ApiError } from "../api/client";

const JOB_STATUSES = ["QUEUED", "SCHEDULED", "CLAIMED", "RUNNING", "COMPLETED", "FAILED", "DEAD_LETTER", "CANCELLED"];

export function QueueDetail() {
  const { projectId, queueId } = useParams<{ projectId: string; queueId: string }>();
  const [queue, setQueue] = useState<Queue | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jobType, setJobType] = useState("");
  const [jobPayload, setJobPayload] = useState("{}");
  const [delayMinutes, setDelayMinutes] = useState<number | "">("");
  const [submittingJob, setSubmittingJob] = useState(false);

  const [cronName, setCronName] = useState("");
  const [cronExpr, setCronExpr] = useState("0 0 * * *");
  const [cronJobType, setCronJobType] = useState("");
  const [submittingCron, setSubmittingCron] = useState(false);

  async function load() {
    if (!projectId || !queueId) return;
    setLoading(true);
    const [q, jobPage, scheduled] = await Promise.all([
      api.getQueue(projectId, queueId),
      api.listJobs(projectId, queueId, { status: statusFilter || undefined }),
      api.listScheduledJobs(projectId, queueId),
    ]);
    setQueue(q);
    setJobs(jobPage.items);
    setScheduledJobs(scheduled.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, queueId, statusFilter]);

  async function handleSubmitJob(e: FormEvent) {
    e.preventDefault();
    if (!projectId || !queueId) return;
    setError(null);
    setSubmittingJob(true);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(jobPayload);
      } catch {
        throw new Error("Payload must be valid JSON");
      }
      const runAt =
        delayMinutes && Number(delayMinutes) > 0
          ? new Date(Date.now() + Number(delayMinutes) * 60_000).toISOString()
          : undefined;

      await api.createJob(projectId, queueId, { type: jobType, payload, runAt });
      setJobType("");
      setJobPayload("{}");
      setDelayMinutes("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not submit job.");
    } finally {
      setSubmittingJob(false);
    }
  }

  async function handleCreateScheduledJob(e: FormEvent) {
    e.preventDefault();
    if (!projectId || !queueId) return;
    setError(null);
    setSubmittingCron(true);
    try {
      await api.createScheduledJob(projectId, queueId, {
        name: cronName,
        cronExpression: cronExpr,
        jobType: cronJobType,
        payloadTemplate: {},
      });
      setCronName("");
      setCronJobType("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create scheduled job.");
    } finally {
      setSubmittingCron(false);
    }
  }

  async function toggleScheduledJob(sj: ScheduledJob) {
    if (!projectId || !queueId) return;
    await api.updateScheduledJob(projectId, queueId, sj.id, { isEnabled: !sj.isEnabled });
    await load();
  }

  async function removeScheduledJob(sj: ScheduledJob) {
    if (!projectId || !queueId) return;
    await api.deleteScheduledJob(projectId, queueId, sj.id);
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
          <h1 className="page-title">{queue?.name}</h1>
          <p className="page-subtitle">
            priority {queue?.priority} · concurrency {queue?.maxConcurrency} ·{" "}
            <StatusPill label={queue?.isPaused ? "paused" : "active"} variant={queue?.isPaused ? "paused" : "active"} />
          </p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="nav-section-label" style={{ marginBottom: 12 }}>
          Submit a job
        </div>
        <form className="form-inline" onSubmit={handleSubmitJob}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="jobType">Type</label>
            <input id="jobType" required value={jobType} onChange={(e) => setJobType(e.target.value)} placeholder="send_email" />
          </div>
          <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
            <label htmlFor="jobPayload">Payload (JSON)</label>
            <input id="jobPayload" value={jobPayload} onChange={(e) => setJobPayload(e.target.value)} className="mono" />
          </div>
          <div className="field" style={{ marginBottom: 0, width: 140 }}>
            <label htmlFor="delayMinutes">Delay (minutes)</label>
            <input
              id="delayMinutes"
              type="number"
              min={0}
              value={delayMinutes}
              onChange={(e) => setDelayMinutes(e.target.value ? Number(e.target.value) : "")}
              placeholder="0 = now"
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submittingJob}>
            {submittingJob ? "Submitting..." : "Submit job"}
          </button>
        </form>
      </div>

      <div className="page-header">
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Jobs</h2>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: 6, padding: "6px 10px" }}>
          <option value="">All statuses</option>
          {JOB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state">No jobs yet. Submit one above.</div>
      ) : (
        <div className="list" style={{ marginBottom: 32 }}>
          {jobs.map((j) => (
            <Link
              key={j.id}
              to={`/projects/${projectId}/queues/${queueId}/jobs/${j.id}`}
              className="row"
              style={{ color: "inherit" }}
            >
              <div>
                <div className="row-title mono">{j.type}</div>
                <div className="row-meta">
                  attempt {j.attempts}/{j.maxAttempts} · {new Date(j.createdAt).toLocaleString()}
                </div>
              </div>
              <JobStatusPill status={j.status} />
            </Link>
          ))}
        </div>
      )}

      <div className="page-header">
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Recurring jobs (cron)</h2>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <form className="form-inline" onSubmit={handleCreateScheduledJob}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="cronName">Name</label>
            <input id="cronName" required value={cronName} onChange={(e) => setCronName(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="cronExpr">Cron expression</label>
            <input id="cronExpr" required value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} className="mono" style={{ width: 140 }} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="cronJobType">Job type</label>
            <input id="cronJobType" required value={cronJobType} onChange={(e) => setCronJobType(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submittingCron}>
            {submittingCron ? "Creating..." : "Create schedule"}
          </button>
        </form>
      </div>

      {scheduledJobs.length === 0 ? (
        <div className="empty-state">No recurring jobs configured.</div>
      ) : (
        <div className="list">
          {scheduledJobs.map((sj) => (
            <div key={sj.id} className="row">
              <div>
                <div className="row-title">{sj.name}</div>
                <div className="row-meta">
                  <span className="mono">{sj.cronExpression}</span> · next run {new Date(sj.nextRunAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <StatusPill label={sj.isEnabled ? "enabled" : "disabled"} variant={sj.isEnabled ? "active" : "neutral"} />
                <button className="btn" onClick={() => toggleScheduledJob(sj)}>
                  {sj.isEnabled ? "Disable" : "Enable"}
                </button>
                <button className="btn btn-danger" onClick={() => removeScheduledJob(sj)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
