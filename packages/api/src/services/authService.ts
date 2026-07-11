import { Pool } from "pg";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiryDate,
} from "../lib/jwt";
import { ConflictError, UnauthorizedError } from "../lib/errors";
import { RegisterInput, LoginInput } from "../validation/auth.schemas";

export interface AuthResult {
  user: { id: string; orgId: string; name: string; email: string; role: string };
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(pool: Pool, user: { id: string; org_id: string; role: string }) {
  const accessToken = signAccessToken({ sub: user.id, orgId: user.org_id, role: user.role });
  const { raw, hash } = generateRefreshToken();

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, hash, refreshTokenExpiryDate()]
  );

  return { accessToken, refreshToken: raw };
}

export async function register(pool: Pool, input: RegisterInput): Promise<AuthResult> {
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, [input.email]);
  if (existing.rows.length > 0) {
    throw new ConflictError("An account with this email already exists");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const org = await client.query(`INSERT INTO organizations (name) VALUES ($1) RETURNING id`, [
      input.orgName,
    ]);
    const orgId = org.rows[0].id;

    const passwordHash = await hashPassword(input.password);
    const user = await client.query(
      `INSERT INTO users (org_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'OWNER') RETURNING id, org_id, email, name, role`,
      [orgId, input.email, passwordHash, input.name]
    );

    await client.query("COMMIT");

    const tokens = await issueTokens(pool, user.rows[0]);
    return { user: toUserDto(user.rows[0]), ...tokens };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function login(pool: Pool, input: LoginInput): Promise<AuthResult> {
  const result = await pool.query(
    `SELECT id, org_id, email, password_hash, name, role FROM users WHERE email = $1`,
    [input.email]
  );
  const user = result.rows[0];
  if (!user || !(await verifyPassword(input.password, user.password_hash))) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const tokens = await issueTokens(pool, user);
  return { user: toUserDto(user), ...tokens };
}

export async function refresh(pool: Pool, refreshToken: string): Promise<AuthResult> {
  const hash = hashToken(refreshToken);
  const result = await pool.query(
    `SELECT rt.id AS token_id, rt.expires_at, rt.revoked_at, u.id, u.org_id, u.email, u.name, u.role
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [hash]
  );
  const row = result.rows[0];
  if (!row || row.revoked_at || new Date(row.expires_at) < new Date()) {
    throw new UnauthorizedError("Refresh token is invalid, expired, or revoked");
  }

  // Rotate: revoke the used token and issue a fresh one. If a stolen token is
  // ever replayed after the legitimate client already rotated it, this token
  // will already show revoked_at set and the reuse gets rejected above.
  await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`, [row.token_id]);

  const tokens = await issueTokens(pool, row);
  return { user: toUserDto(row), ...tokens };
}

export async function logout(pool: Pool, refreshToken: string): Promise<void> {
  const hash = hashToken(refreshToken);
  await pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [
    hash,
  ]);
}

function toUserDto(row: { id: string; org_id: string; email: string; name: string; role: string }) {
  return { id: row.id, orgId: row.org_id, email: row.email, name: row.name, role: row.role };
}
