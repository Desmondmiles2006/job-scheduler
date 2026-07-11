import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
});
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const listProjectsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  name: z.string().optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

export const projectIdParamsSchema = z.object({
  projectId: z.string().uuid(),
});
