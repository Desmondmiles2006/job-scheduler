export type JobHandler = (payload: unknown) => Promise<unknown>;

const registry = new Map<string, JobHandler>();

export function registerHandler(jobType: string, handler: JobHandler): void {
  registry.set(jobType, handler);
}

export function getHandler(jobType: string): JobHandler {
  const handler = registry.get(jobType);
  if (!handler) {
    throw new Error(`No handler registered for job type "${jobType}"`);
  }
  return handler;
}

// Example handlers - real handlers live wherever the business logic does and
// get registered at worker startup. These exist so the worker is runnable
// out of the box.
registerHandler("send_email", async (payload) => {
  return { sent: true, payload };
});

registerHandler("noop", async () => {
  return { ok: true };
});
