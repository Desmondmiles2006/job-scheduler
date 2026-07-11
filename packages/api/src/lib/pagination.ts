import { ValidationError } from "./errors";

export interface CursorPage {
  createdAt: string;
  id: string;
}

export function encodeCursor(page: CursorPage): string {
  return Buffer.from(JSON.stringify(page)).toString("base64url");
}

export function decodeCursor(cursor: string): CursorPage {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof decoded.createdAt !== "string" || typeof decoded.id !== "string") {
      throw new Error("malformed cursor");
    }
    return decoded;
  } catch {
    throw new ValidationError("Invalid pagination cursor");
  }
}

export function parseLimit(raw: unknown, { def = 20, max = 100 } = {}): number {
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new ValidationError(`limit must be an integer between 1 and ${max}`);
  }
  return n;
}
