import jwt from "jsonwebtoken";
import crypto from "crypto";

export interface AccessTokenPayload {
  sub: string; // user id
  orgId: string;
  role: string;
}

function getAccessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error("JWT_ACCESS_SECRET is required");
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const ttlMin = Number(process.env.ACCESS_TOKEN_TTL_MIN ?? 15);
  return jwt.sign(payload, getAccessSecret(), { expiresIn: `${ttlMin}m` });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getAccessSecret()) as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings, not JWTs. The raw value is
 * returned to the client once and never stored; only its SHA-256 hash is
 * persisted in refresh_tokens, so a stolen database dump doesn't hand out
 * usable session tokens.
 */
export function generateRefreshToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(48).toString("hex");
  const hash = hashToken(raw);
  return { raw, hash };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function refreshTokenExpiryDate(): Date {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
