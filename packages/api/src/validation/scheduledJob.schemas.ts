import { z } from "zod";

export const createScheduledJobSchema = z.object({
  name: z.string().min(1).max(200),
  cronExpression: z.string().min(1).max(200),
  timezone: z.string().min(1).max(100).default("UTC"),
  jobType: z.string().min(1).max(200),
  payloadTemplate: z.record(z.unknown()).default({}),
  isEnabled: z.boolean().default(true),
});
export type CreateScheduledJobInput = z.infer<typeof createScheduledJobSchema>;

export const updateScheduledJobSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  cronExpression: z.string().min(1).max(200).optional(),
  timezone: z.string().min(1).max(100).optional(),
  isEnabled: z.boolean().optional(),
});
export type UpdateScheduledJobInput = z.infer<typeof updateScheduledJobSchema>;

export const scheduledJobIdParamsSchema = z.object({
  projectId: z.string().uuid(),
  queueId: z.string().uuid(),
  scheduledJobId: z.string().uuid(),
});
