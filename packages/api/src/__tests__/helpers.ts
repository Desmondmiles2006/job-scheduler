import request from "supertest";
import { Express } from "express";

export async function registerOrgProjectQueue(
  app: Express,
  email: string,
  opts: { projectName?: string; queueName?: string } = {}
) {
  const register = await request(app).post("/api/auth/register").send({
    orgName: `Org for ${email}`,
    name: "Owner",
    email,
    password: "correct-horse-battery-staple",
  });
  const token = register.body.accessToken as string;

  const project = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: opts.projectName ?? "Default Project" });
  const projectId = project.body.id as string;

  const retryPolicy = await request(app)
    .post(`/api/projects/${projectId}/retry-policies`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "default", strategy: "FIXED", baseDelayMs: 1000, maxDelayMs: 60000, maxAttempts: 3 });

  const queue = await request(app)
    .post(`/api/projects/${projectId}/queues`)
    .set("Authorization", `Bearer ${token}`)
    .send({ name: opts.queueName ?? "default-queue", defaultRetryPolicyId: retryPolicy.body.id });
  const queueId = queue.body.id as string;

  return { token, projectId, queueId, retryPolicyId: retryPolicy.body.id as string };
}
