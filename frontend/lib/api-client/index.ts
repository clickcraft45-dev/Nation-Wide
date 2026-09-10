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

/**
 * Pulls the server's own user-facing reason out of a NestJS error body. It arrives as a plain
 * string for a thrown HttpException ("An account with this email or phone number already
 * exists"), and as a string[] when class-validator rejects a DTO — one entry per failed rule.
 */
function serverMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (Array.isArray(message)) {
    const parts = message.filter(
      (part): part is string => typeof part === "string" && part.trim().length > 0,
    );
    if (parts.length > 0) return parts.join(". ");
  }
  return undefined;
}

async function throwIfError(res: Response, path: string): Promise<void> {
  if (res.ok) return;
  const body = await res
    .clone()
    .json()
    .catch(() => undefined);
  // Prefer the server's message over a developer string. Without this every caller sees only
  // "Request to /x failed with status 409" and has no choice but to invent its own generic
  // copy — which is exactly what every page was doing.
  throw new ApiError(
    res.status,
    serverMessage(body) ?? `Request to ${path} failed with status ${res.status}`,
    body,
  );
}

/** The backend stamps every error response with a request id; it is also in the server logs. */
function requestIdOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const id = (body as { requestId?: unknown }).requestId;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

/**
 * The message to show a user for a failed request.
 *
 * A 4xx carries a precise, already user-facing reason from the server — a duplicate account, a
 * password below the minimum, a malformed phone — so it wins outright.
 *
 * A 5xx does not, and must not: the backend's exception filter masks internals deliberately,
 * because raw exception text leaks table and column names. There is no safe specific message to
 * show, so the caller's fallback stands — but the request id rides along, which turns an
 * unactionable "something went wrong" into something a user can quote and support can grep for.
 *
 * Network failures never produce an ApiError at all, and fall back with no id.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status < 500 && error.message) return error.message;
  const id = requestIdOf(error.body);
  return id ? `${fallback} (reference: ${id})` : fallback;
}

/**
 * The server's rejection, split per field — `{ pickupContactPhone: "Must be shorter than or
 * equal to 20 characters" }`.
 *
 * class-validator emits one sentence per broken rule and each one starts with the property name
 * ("pickupContactPhone must be shorter than or equal to 20 characters"). Joined into a single
 * banner, as `errorMessage` does, that is a wall of text at the bottom of a long form telling
 * you something is wrong somewhere above; split per field it lands under the input that caused
 * it. Both are worth showing, and a form usually wants this one.
 *
 * The leading property name is stripped, because the field's own <Label> already says it — what
 * is left reads as a sentence about that field. Only the FIRST rule per field survives: a value
 * that breaks two rules is still one thing for the user to fix.
 *
 * Returns {} for anything that is not a class-validator array — a thrown HttpException carries a
 * single prose message with no field attached, which belongs in the banner and nowhere else.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const body = error.body;
  if (typeof body !== "object" || body === null) return {};
  const message = (body as { message?: unknown }).message;
  if (!Array.isArray(message)) return {};

  const result: Record<string, string> = {};
  for (const entry of message) {
    if (typeof entry !== "string") continue;
    // "<property> <the rest of the sentence>" — the property is always the first token, and is
    // always the DTO's own camelCase field name, which is what the form's state is keyed by.
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/.exec(entry.trim());
    if (!match) continue;
    const [, field, reason] = match;
    if (field in result) continue;
    result[field] = reason.charAt(0).toUpperCase() + reason.slice(1) + (reason.endsWith(".") ? "" : ".");
  }
  return result;
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
