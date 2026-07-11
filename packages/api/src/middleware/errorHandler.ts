import { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";
import pino from "pino";

const log = pino({ name: "api-error" });

// Postgres unique_violation / foreign_key_violation codes, mapped to clean
// HTTP responses instead of leaking raw SQL errors to clients.
const PG_UNIQUE_VIOLATION = "23505";
const PG_FOREIGN_KEY_VIOLATION = "23503";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  const pgErr = err as { code?: string; constraint?: string };
  if (pgErr?.code === PG_UNIQUE_VIOLATION) {
    res.status(409).json({
      error: { code: "CONFLICT", message: "A resource with these values already exists" },
    });
    return;
  }
  if (pgErr?.code === PG_FOREIGN_KEY_VIOLATION) {
    res.status(400).json({
      error: { code: "INVALID_REFERENCE", message: "Referenced resource does not exist" },
    });
    return;
  }

  log.error({ err, path: req.path, method: req.method }, "unhandled error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}
