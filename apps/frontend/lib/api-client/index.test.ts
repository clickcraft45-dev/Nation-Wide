import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient, ApiError, setAccessToken, setUnauthorizedHandler } from "./index";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("apiClient", () => {
  beforeEach(() => {
    setAccessToken(null);
    setUnauthorizedHandler(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("get", () => {
    it("attaches the bearer token when one is set", async () => {
      setAccessToken("token-123");
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      await apiClient.get("/customers");

      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer token-123",
      );
    });

    it("throws ApiError with the parsed body on a non-ok response", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({ message: "Not found" }, { status: 404 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(apiClient.get("/customers/missing")).rejects.toMatchObject({
        status: 404,
        body: { message: "Not found" },
      });
    });

    it("returns undefined for a 204 No Content response", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(null, { status: 204 }));
      vi.stubGlobal("fetch", fetchMock);

      const result = await apiClient.get("/customers/1");
      expect(result).toBeUndefined();
    });

    it("retries once via the unauthorized handler on a 401, then succeeds", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, { status: 401 }))
        .mockResolvedValueOnce(jsonResponse({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);
      setUnauthorizedHandler(async () => {
        setAccessToken("refreshed-token");
        return "refreshed-token";
      });

      const result = await apiClient.get<{ ok: boolean }>("/customers");

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [, secondInit] = fetchMock.mock.calls[1];
      expect((secondInit.headers as Record<string, string>).Authorization).toBe(
        "Bearer refreshed-token",
      );
    });

    it("never triggers the unauthorized handler for /auth/refresh itself", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ message: "Unauthorized" }, { status: 401 }));
      vi.stubGlobal("fetch", fetchMock);
      const handler = vi.fn();
      setUnauthorizedHandler(handler);

      await expect(apiClient.get("/auth/refresh")).rejects.toBeInstanceOf(ApiError);
      expect(handler).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("getWithHeaders", () => {
    it("returns both the parsed body and the raw response headers", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse([{ id: "1" }], { headers: { "X-Total-Count": "42" } }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const { data, headers } = await apiClient.getWithHeaders<{ id: string }[]>(
        "/orders?page=1&pageSize=25",
      );

      expect(data).toEqual([{ id: "1" }]);
      expect(headers.get("X-Total-Count")).toBe("42");
    });
  });

  describe("postForm", () => {
    it("does not set a Content-Type header for FormData bodies", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
      vi.stubGlobal("fetch", fetchMock);

      await apiClient.postForm("/admin/company-settings/logo", new FormData());

      const [, init] = fetchMock.mock.calls[0];
      expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    });
  });
});
