import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { UnauthorizedError } from "../lib/errors";

export interface AuthenticatedUser {
  id: string;
  orgId: string;
  role: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Missing bearer token"));
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, orgId: payload.orgId, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired access token"));
  }
}
