export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

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

function buildHeaders(init?: RequestInit): HeadersInit {
  return {
    // FormData bodies (file uploads) must NOT get a manual Content-Type — the browser sets its
    // own multipart boundary, which a hardcoded "application/json" would silently break.
    ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {}),
    ...init?.headers,
  };
}

async function throwIfError(res: Response, path: string): Promise<void> {
  if (res.ok) return;
  const body = await res
    .clone()
    .json()
    .catch(() => undefined);
  throw new ApiError(res.status, `Request to ${path} failed with status ${res.status}`, body);
}

async function request<T>(path: string, init?: RequestInit, isRetry = false): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include", // sends the httpOnly refresh cookie cross-origin
    headers: buildHeaders(init),
  });

  // Never trigger the refresh handler for the refresh call's own 401 — that path calls back
  // into this same request() function and would recurse indefinitely once a session expires.
  if (res.status === 401 && !isRetry && path !== "/auth/refresh" && onUnauthorized) {
    const refreshedToken = await onUnauthorized();
    if (refreshedToken) {
      return request<T>(path, init, true);
    }
  }

  await throwIfError(res, path);

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// For paginated list endpoints — the caller also gets the raw Headers so it can read
// X-Total-Count, which a browser only exposes to fetch() when the server opts it into CORS
// (see main.ts's exposedHeaders).
async function requestWithHeaders<T>(
  path: string,
  init?: RequestInit,
  isRetry = false,
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: buildHeaders(init),
  });

  if (res.status === 401 && !isRetry && onUnauthorized) {
    const refreshedToken = await onUnauthorized();
    if (refreshedToken) {
      return requestWithHeaders<T>(path, init, true);
    }
  }

  await throwIfError(res, path);

  return { data: (await res.json()) as T, headers: res.headers };
}

// For endpoints that return a binary body (PDF generation) instead of JSON — the caller also
// gets the raw Headers so it can read response metadata like X-Rate-Card-Id/X-Rate-Card-Version,
// which a browser only exposes to fetch() when the server opts them into CORS (see main.ts).
async function requestBlob(
  path: string,
  init?: RequestInit,
  isRetry = false,
): Promise<{ blob: Blob; headers: Headers }> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: buildHeaders(init),
  });

  if (res.status === 401 && !isRetry && onUnauthorized) {
    const refreshedToken = await onUnauthorized();
    if (refreshedToken) {
      return requestBlob(path, init, true);
    }
  }

  await throwIfError(res, path);

  return { blob: await res.blob(), headers: res.headers };
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  getWithHeaders: <T>(path: string) => requestWithHeaders<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
  postBlob: (path: string, body: unknown) =>
    requestBlob(path, { method: "POST", body: JSON.stringify(body) }),
  getBlob: (path: string) => requestBlob(path),
};
