import { apiFetch } from "./client";
import type { AuthUser, Tokens } from "./client";

export interface Project {
  id: string;
  orgId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface Queue {
  id: string;
  projectId: string;
  name: string;
  priority: number;
  maxConcurrency: number;
  isPaused: boolean;
  defaultRetryPolicyId: string | null;
  createdAt: string;
}

export interface RetryPolicy {
  id: string;
  projectId: string;
  name: string;
  strategy: "FIXED" | "LINEAR" | "EXPONENTIAL";
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  multiplier: number;
  createdAt: string;
}

export interface Job {
  id: string;
  queueId: string;
  type: string;
  payload: unknown;
  status: string;
  priority: number;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  retryPolicyId: string | null;
  claimedBy: string | null;
  idempotencyKey: string | null;
  scheduledJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  workerId: string | null;
  attemptNumber: number;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  result: unknown;
}

export interface JobLog {
  id: string;
  level: string;
  message: string;
  loggedAt: string;
}

export interface ScheduledJob {
  id: string;
  queueId: string;
  name: string;
  cronExpression: string;
  timezone: string;
  jobType: string;
  payloadTemplate: unknown;
  isEnabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  createdAt: string;
}

export interface DeadLetterJob {
  id: string;
  originalJobId: string | null;
  queueId: string;
  jobType: string;
  payload: unknown;
  failureReason: string;
  attempts: number;
  movedAt: string;
}

export interface Worker {
  id: string;
  hostname: string;
  pid: number;
  status: string;
  startedAt: string;
  lastSeenAt: string;
  isOnline: boolean;
}


interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

interface AuthResponse extends Tokens {
  user: AuthUser;
}

export const api = {
  register: (input: { orgName: string; name: string; email: string; password: string }) =>
    apiFetch<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) }),

  login: (input: { email: string; password: string }) =>
    apiFetch<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) }),

  listProjects: (cursor?: string) =>
    apiFetch<Page<Project>>(`/projects${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`),

  createProject: (name: string) =>
    apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ name }) }),

  getProject: (projectId: string) => apiFetch<Project>(`/projects/${projectId}`),

  listQueues: (projectId: string) => apiFetch<Page<Queue>>(`/projects/${projectId}/queues`),

  getQueue: (projectId: string, queueId: string) => apiFetch<Queue>(`/projects/${projectId}/queues/${queueId}`),

  createQueue: (
    projectId: string,
    input: { name: string; priority?: number; maxConcurrency?: number; defaultRetryPolicyId?: string }
  ) => apiFetch<Queue>(`/projects/${projectId}/queues`, { method: "POST", body: JSON.stringify(input) }),

  updateQueue: (projectId: string, queueId: string, input: Partial<{ isPaused: boolean; priority: number; maxConcurrency: number }>) =>
    apiFetch<Queue>(`/projects/${projectId}/queues/${queueId}`, { method: "PATCH", body: JSON.stringify(input) }),

  deleteQueue: (projectId: string, queueId: string) =>
    apiFetch<void>(`/projects/${projectId}/queues/${queueId}`, { method: "DELETE" }),

  listRetryPolicies: (projectId: string) =>
    apiFetch<{ items: RetryPolicy[] }>(`/projects/${projectId}/retry-policies`),

  createRetryPolicy: (
    projectId: string,
    input: { name: string; strategy: string; baseDelayMs: number; maxDelayMs: number; maxAttempts: number; multiplier?: number }
  ) => apiFetch<RetryPolicy>(`/projects/${projectId}/retry-policies`, { method: "POST", body: JSON.stringify(input) }),

  createJob: (
    projectId: string,
    queueId: string,
    input: { type: string; payload: unknown; runAt?: string; maxAttempts?: number; retryPolicyId?: string; priority?: number }
  ) => apiFetch<Job>(`/projects/${projectId}/queues/${queueId}/jobs`, { method: "POST", body: JSON.stringify(input) }),

  listJobs: (projectId: string, queueId: string, opts: { cursor?: string; status?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.cursor) params.set("cursor", opts.cursor);
    if (opts.status) params.set("status", opts.status);
    const qs = params.toString();
    return apiFetch<Page<Job>>(`/projects/${projectId}/queues/${queueId}/jobs${qs ? `?${qs}` : ""}`);
  },

  getJob: (projectId: string, queueId: string, jobId: string) =>
    apiFetch<Job>(`/projects/${projectId}/queues/${queueId}/jobs/${jobId}`),

  listExecutions: (projectId: string, queueId: string, jobId: string) =>
    apiFetch<{ items: JobExecution[] }>(`/projects/${projectId}/queues/${queueId}/jobs/${jobId}/executions`),

  listExecutionLogs: (projectId: string, queueId: string, jobId: string, executionId: string) =>
    apiFetch<{ items: JobLog[] }>(
      `/projects/${projectId}/queues/${queueId}/jobs/${jobId}/executions/${executionId}/logs`
    ),

  cancelJob: (projectId: string, queueId: string, jobId: string) =>
    apiFetch<Job>(`/projects/${projectId}/queues/${queueId}/jobs/${jobId}/cancel`, { method: "POST" }),

  listScheduledJobs: (projectId: string, queueId: string) =>
    apiFetch<{ items: ScheduledJob[] }>(`/projects/${projectId}/queues/${queueId}/scheduled-jobs`),

  createScheduledJob: (
    projectId: string,
    queueId: string,
    input: { name: string; cronExpression: string; timezone?: string; jobType: string; payloadTemplate: unknown }
  ) =>
    apiFetch<ScheduledJob>(`/projects/${projectId}/queues/${queueId}/scheduled-jobs`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateScheduledJob: (
    projectId: string,
    queueId: string,
    scheduledJobId: string,
    input: Partial<{ isEnabled: boolean; cronExpression: string; timezone: string; name: string }>
  ) =>
    apiFetch<ScheduledJob>(`/projects/${projectId}/queues/${queueId}/scheduled-jobs/${scheduledJobId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  deleteScheduledJob: (projectId: string, queueId: string, scheduledJobId: string) =>
    apiFetch<void>(`/projects/${projectId}/queues/${queueId}/scheduled-jobs/${scheduledJobId}`, {
      method: "DELETE",
    }),

  listDeadLetterJobs: (projectId: string, cursor?: string) =>
    apiFetch<Page<DeadLetterJob>>(
      `/projects/${projectId}/dead-letter-jobs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`
    ),

  retryDeadLetterJob: (projectId: string, dlqId: string) =>
    apiFetch<{ jobId: string }>(`/projects/${projectId}/dead-letter-jobs/${dlqId}/retry`, { method: "POST" }),

  listWorkers: () => apiFetch<{ items: Worker[] }>("/workers"),
};
