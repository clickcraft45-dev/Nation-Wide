"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthUserDto, LoginResponseDto } from "@nationwide/shared-types";
import { ApiError, apiClient, setAccessToken, setUnauthorizedHandler } from "@/lib/api-client";
import { decodeAccessToken } from "@/lib/auth/jwt";
import { readSessionHint, writeSessionHint } from "@/lib/auth/session-hint";

export interface RegisterInput {
  name: string;
  phone: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUserDto | null;
  isLoading: boolean;
  /** `headers` carries the Turnstile token from useTurnstile(). */
  login: (email: string, password: string, headers?: Record<string, string>) => Promise<void>;
  register: (input: RegisterInput, headers?: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // POST /auth/refresh only returns a new access token (not the user profile), so we recover
  // the display claims by decoding it — the backend independently re-verifies every request.
  const refresh = useCallback(async (): Promise<string | null> => {
    try {
      const res = await apiClient.post<{ accessToken: string }>("/auth/refresh", {});
      setAccessToken(res.accessToken);
      const decoded = decodeAccessToken(res.accessToken);
      setUser(
        decoded
          ? {
              id: decoded.sub,
              email: decoded.email,
              role: decoded.role,
              isB2b: decoded.isB2b,
            }
          : null,
      );
      writeSessionHint(true);
      return res.accessToken;
    } catch (err) {
      setAccessToken(null);
      setUser(null);
      // Only a real refusal means signed out. A network blip must not mark a signed-in browser
      // as signed out, or the next visit would skip restoring a session that still exists.
      if (err instanceof ApiError) writeSessionHint(false);
      return null;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(refresh);
    // A browser known to be signed out skips the call entirely (see lib/auth/session-hint.ts).
    if (readSessionHint() === "0") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoading(false);
    } else {
      // Restoring a session from the httpOnly refresh cookie on mount is inherently a one-shot
      // async check, not a subscription — there's no external-system event to subscribe to here.
      void refresh().finally(() => setIsLoading(false));
    }
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string, headers?: Record<string, string>) => {
      const res = await apiClient.post<LoginResponseDto>(
        "/auth/login",
        { email, password },
        headers,
      );
      setAccessToken(res.accessToken);
      setUser(res.user);
      writeSessionHint(true);
    },
    [],
  );

  const register = useCallback(async (input: RegisterInput, headers?: Record<string, string>) => {
    const res = await apiClient.post<LoginResponseDto>("/auth/register", input, headers);
    setAccessToken(res.accessToken);
    setUser(res.user);
    writeSessionHint(true);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout", {});
    } finally {
      setAccessToken(null);
      setUser(null);
      writeSessionHint(false);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
