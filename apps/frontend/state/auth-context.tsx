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
import { apiClient, setAccessToken, setUnauthorizedHandler } from "@/lib/api-client";
import { decodeAccessToken } from "@/lib/auth/jwt";

export interface RegisterInput {
  name: string;
  phone: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  user: AuthUserDto | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  completeGoogleSignup: (pendingToken: string, phone: string) => Promise<void>;
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
      setUser(decoded ? { id: decoded.sub, email: decoded.email, role: decoded.role } : null);
      return res.accessToken;
    } catch {
      setAccessToken(null);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(refresh);
    // Restoring a session from the httpOnly refresh cookie on mount is inherently a one-shot
    // async check, not a subscription — there's no external-system event to subscribe to here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().finally(() => setIsLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiClient.post<LoginResponseDto>("/auth/login", { email, password });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const res = await apiClient.post<LoginResponseDto>("/auth/register", input);
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  // Second half of new-customer Google sign-up — see /register/google. The pendingToken proves
  // a verified Google identity server-side; this just supplies the phone number that identity
  // doesn't reliably come with.
  const completeGoogleSignup = useCallback(async (pendingToken: string, phone: string) => {
    const res = await apiClient.post<LoginResponseDto>("/auth/google/complete", {
      pendingToken,
      phone,
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout", {});
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, register, completeGoogleSignup, logout }}
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
