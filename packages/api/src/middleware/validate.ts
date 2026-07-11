import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { ValidationError } from "../lib/errors";

type Target = "body" | "query" | "params";

export function validate(schema: ZodSchema, target: Target = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return next(new ValidationError("Request validation failed", result.error.flatten()));
    }
    // Replace with parsed (and coerced/defaulted) data.
    (req as unknown as Record<Target, unknown>)[target] = result.data;
    next();
  };
}
