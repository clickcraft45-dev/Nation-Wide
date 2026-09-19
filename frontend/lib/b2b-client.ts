import { API_BASE_URL, ApiError, apiClient } from "@/lib/api-client";

/**
 * The B2B portal's own API client. The link token authenticates every call and travels in a
 * header, never in the API URL, so it stays out of access logs and Referer headers. There is no
 * session and no cookie: the link in the address bar is the whole credential.
 */
export function b2bClient(token: string) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE_URL}/b2b${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        "X-B2B-Token": token,
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const body = await res
        .clone()
        .json()
        .catch(() => undefined);
      const message = (body as { message?: unknown } | undefined)?.message;
      throw new ApiError(
        res.status,
        typeof message === "string"
          ? message
          : Array.isArray(message)
            ? message.filter((m) => typeof m === "string").join(". ")
            : `Request to ${path} failed with status ${res.status}`,
        body,
      );
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body: unknown) =>
      request<T>(path, { method: "POST", body: JSON.stringify(body) }),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  };
}

export type B2bClient = ReturnType<typeof b2bClient>;

/**
 * The same portal API for a signed-in business account: the ordinary session (JWT + refresh
 * handling) carries it, so there is no token to pass. Shaped like b2bClient so the portal does not
 * care which way its user got in.
 */
export const sessionB2bClient: B2bClient = {
  get: (path) => apiClient.get(`/b2b${path}`),
  post: (path, body) => apiClient.post(`/b2b${path}`, body),
  patch: (path, body) => apiClient.patch(`/b2b${path}`, body),
  delete: (path) => apiClient.delete(`/b2b${path}`),
};
