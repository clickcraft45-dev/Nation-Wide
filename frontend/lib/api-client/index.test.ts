import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiClient,
  ApiError,
  errorMessage,
  fieldErrors,
  setAccessToken,
  setUnauthorizedHandler,
} from "./index";

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

  describe("error messages shown to users", () => {
    async function failWith(body: unknown, status: number): Promise<unknown> {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body, { status })));
      return apiClient.get("/anything").then(
        () => undefined,
        (error: unknown) => error,
      );
    }

    it("carries the server's own message rather than a developer string", async () => {
      const error = await failWith(
        { message: "An account with this email or phone number already exists" },
        409,
      );
      expect((error as ApiError).message).toBe(
        "An account with this email or phone number already exists",
      );
    });

    it("joins class-validator's array of field errors into one sentence", async () => {
      const error = await failWith(
        { message: ["password must be longer than or equal to 10 characters"] },
        400,
      );
      expect(errorMessage(error, "fallback")).toBe(
        "password must be longer than or equal to 10 characters",
      );
    });

    it("prefers the server reason for a 4xx", async () => {
      const error = await failWith({ message: "Invalid credentials" }, 401);
      expect(errorMessage(error, "Failed to load invoices.")).toBe("Invalid credentials");
    });

    it("keeps the caller's context for a 5xx and appends the request id", async () => {
      // The backend masks 5xx internals on purpose, so its message carries no information —
      // but the request id it stamps on the body is traceable in the server logs.
      const error = await failWith(
        { message: "Something went wrong. Please try again.", requestId: "8e410bbe" },
        500,
      );
      expect(errorMessage(error, "Failed to load invoices.")).toBe(
        "Failed to load invoices. (reference: 8e410bbe)",
      );
    });

    it("falls back when the failure never reached the server", () => {
      expect(errorMessage(new TypeError("fetch failed"), "Check your connection.")).toBe(
        "Check your connection.",
      );
    });
  });

  describe("fieldErrors", () => {
    async function failWith(body: unknown, status: number): Promise<unknown> {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body, { status })));
      return apiClient.get("/anything").then(
        () => undefined,
        (error: unknown) => error,
      );
    }

    it("splits a class-validator rejection into one message per field", async () => {
      const error = await failWith(
        {
          message: [
            "pickupContactPhone must be shorter than or equal to 20 characters",
            "pickupCity should not be empty",
          ],
        },
        400,
      );
      expect(fieldErrors(error)).toEqual({
        pickupContactPhone: "Must be shorter than or equal to 20 characters.",
        pickupCity: "Should not be empty.",
      });
    });

    it("keeps only the first broken rule for a field", async () => {
      // One value, one thing to fix — listing every rule it broke is noise under the input.
      const error = await failWith(
        {
          message: [
            "pickupPostalCode must be a number string",
            "pickupPostalCode must be shorter than or equal to 20 characters",
          ],
        },
        400,
      );
      expect(fieldErrors(error)).toEqual({
        pickupPostalCode: "Must be a number string.",
      });
    });

    it("returns nothing for a prose message, which belongs in the banner", async () => {
      const error = await failWith({ message: "This quote already has a pickup request" }, 409);
      expect(fieldErrors(error)).toEqual({});
    });

    it("returns nothing for a failure that never reached the server", () => {
      expect(fieldErrors(new TypeError("fetch failed"))).toEqual({});
    });
  });
});
