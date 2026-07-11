const TOKENS_KEY = "job-scheduler:tokens";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
}

export function loadTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function saveTokens(tokens: Tokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let refreshInFlight: Promise<Tokens | null> | null = null;

async function refreshTokens(): Promise<Tokens | null> {
  const current = loadTokens();
  if (!current) return null;

  const res = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });
  if (!res.ok) {
    clearTokens();
    return null;
  }
  const body = await res.json();
  const tokens = { accessToken: body.accessToken, refreshToken: body.refreshToken };
  saveTokens(tokens);
  return tokens;
}

/**
 * Fetch wrapper: attaches the access token, and on a 401 transparently
 * refreshes once (de-duplicated across concurrent requests) and retries.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = async (tokens: Tokens | null): Promise<Response> => {
    return fetch(`/api${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
        ...init.headers,
      },
    });
  };

  let tokens = loadTokens();
  let res = await doFetch(tokens);

  if (res.status === 401 && tokens) {
    if (!refreshInFlight) {
      refreshInFlight = refreshTokens().finally(() => {
        refreshInFlight = null;
      });
    }
    tokens = await refreshInFlight;
    if (tokens) {
      res = await doFetch(tokens);
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? "UNKNOWN", body?.error?.message ?? res.statusText, body?.error?.details);
  }

  return body as T;
}
