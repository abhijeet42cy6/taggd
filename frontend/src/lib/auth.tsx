import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearApiCache } from "./api";

const TOKEN_KEY = "tgddata_access_token";

export type AuthRole = "admin" | "executive" | "manager";

export type AuthUser = {
  id: number;
  email: string;
  role: AuthRole;
};

export type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  /** Present for executive & manager; null means unrestricted (admin only). */
  projectIds: number[] | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [projectIds, setProjectIds] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);

  const applyToken = useCallback((t: string | null) => {
    setToken(t);
    if (t) {
      localStorage.setItem(TOKEN_KEY, t);
      api.defaults.headers.common.Authorization = `Bearer ${t}`;
    } else {
      localStorage.removeItem(TOKEN_KEY);
      delete api.defaults.headers.common.Authorization;
    }
  }, []);

  const refreshMe = useCallback(async () => {
    const t = readStoredToken();
    if (!t) {
      setUser(null);
      setProjectIds(null);
      return;
    }
    applyToken(t);
    const { data } = await api.get<{
      id: number;
      email: string;
      role: AuthRole;
      project_ids: number[] | null;
    }>("/auth/me");
    setUser({ id: data.id, email: data.email, role: data.role });
    setProjectIds(data.project_ids);
  }, [applyToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshMe();
      } catch {
        if (!cancelled) {
          applyToken(null);
          setUser(null);
          setProjectIds(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyToken, refreshMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      clearApiCache();
      const { data } = await api.post<{
        access_token: string;
        token_type: string;
        user: AuthUser;
      }>("/auth/login", { email, password });
      applyToken(data.access_token);
      setUser(data.user);
      await refreshMe();
      clearApiCache();
    },
    [applyToken, refreshMe]
  );

  const logout = useCallback(() => {
    clearApiCache();
    applyToken(null);
    setUser(null);
    setProjectIds(null);
  }, [applyToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      projectIds,
      loading,
      login,
      logout,
      refreshMe,
    }),
    [token, user, projectIds, loading, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Route prefixes allowed per role (backend enforces data scope). */
export const ROLE_NAV_PATHS: Record<AuthRole, string[]> = {
  admin: [
    "/",
    "/portfolio",
    "/clients",
    "/client-contracts",
    "/requisitions",
    "/finance",
    "/revenue-trackers",
    "/billing",
    "/sla-performance",
    "/wfm",
    "/data-operations",
    "/ingestion",
    "/activity",
    "/agent",
    "/admin/users",
  ],
  executive: [
    "/",
    "/portfolio",
    "/clients",
    "/client-contracts",
    "/requisitions",
    "/finance",
    "/revenue-trackers",
    "/billing",
    "/sla-performance",
    "/wfm",
    "/data-operations",
    "/ingestion",
    "/activity",
    "/agent",
  ],
  manager: [
    "/",
    "/clients",
    "/client-contracts",
    "/requisitions",
    "/finance",
    "/revenue-trackers",
    "/billing",
    "/sla-performance",
    "/wfm",
    "/ingestion",
    "/activity",
    "/agent",
  ],
};

export function navAllowedForRole(pathname: string, role: AuthRole): boolean {
  const allowed = ROLE_NAV_PATHS[role] ?? [];
  if (allowed.includes(pathname)) return true;
  if (pathname.startsWith("/clients/") && allowed.includes("/clients")) return true;
  return false;
}
