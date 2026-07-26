const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // The parsed JSON response body, when the server sent one (e.g. NestJS's structured
    // exception payloads) — undefined for non-JSON or empty error responses. Most callers only
    // need `.status`; this exists for flows that need server-supplied structured data, like the
    // rate-management duplicate-conflict prompt.
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type UnauthorizedHandler = () => Promise<string | null>;

let currentAccessToken: string | null = null;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Called by AuthProvider whenever the access token changes (login, refresh, logout). */
export function setAccessToken(token: string | null): void {
  currentAccessToken = token;
}

/** Called by AuthProvider to install a one-shot refresh-and-retry handler for 401s. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include", // sends the httpOnly refresh cookie cross-origin
    headers: {
      "Content-Type": "application/json",
      ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {}),
      ...init?.headers,
    },
  });

  // Never trigger the refresh handler for the refresh call's own 401 — that path calls back
  // into this same request() function and would recurse indefinitely once a session expires.
  if (res.status === 401 && !isRetry && path !== "/auth/refresh" && onUnauthorized) {
    const refreshedToken = await onUnauthorized();
    if (refreshedToken) {
      return request<T>(path, init, true);
    }
  }

  if (!res.ok) {
    const body = await res
      .clone()
      .json()
      .catch(() => undefined);
    throw new ApiError(res.status, `Request to ${path} failed with status ${res.status}`, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
