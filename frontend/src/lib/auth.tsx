import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, clearApiCache } from "./api";

const TOKEN_KEY = "tgddata_access_token";

/** Stored `users.role` (legacy + canonical). */
export type AuthRole =
  | "admin"
  | "platform_admin"
  | "executive"
  | "manager"
  | "project_head"
  | "operations"
  | "recruiter"
  | "client_user";

export type AuthUser = {
  id: number;
  email: string;
  role: string;
  effectiveRole?: string;
  verticalAccess?: string[] | null;
  managerUserId?: number | null;
  /** From GET /auth/me when `effective_role` is `client_user`. */
  isReadOnly?: boolean;
  givenName?: string | null;
  familyName?: string | null;
  phone?: string | null;
  hasAvatar?: boolean;
};

export type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  /** Present for executive & manager; null means unrestricted (admin only). */
  projectIds: number[] | null;
  loading: boolean;
  /** Resolves to the loaded user (from `/auth/me`) or null if not authenticated. */
  login: (email: string, password: string) => Promise<AuthUser | null>;
  logout: () => void;
  refreshMe: () => Promise<AuthUser | null>;
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

  const refreshMe = useCallback(async (): Promise<AuthUser | null> => {
    const t = readStoredToken();
    if (!t) {
      setUser(null);
      setProjectIds(null);
      return null;
    }
    applyToken(t);
    const { data } = await api.get<{
      id: number;
      email: string;
      role: string;
      project_ids: number[] | null;
      effective_role?: string;
      vertical_access?: string[] | null;
      manager_user_id?: number | null;
      is_read_only?: boolean;
      given_name?: string | null;
      family_name?: string | null;
      phone?: string | null;
      has_avatar?: boolean;
    }>("/auth/me");
    const authUser: AuthUser = {
      id: data.id,
      email: data.email,
      role: data.role,
      effectiveRole: data.effective_role,
      verticalAccess: data.vertical_access,
      managerUserId: data.manager_user_id,
      isReadOnly: data.is_read_only,
      givenName: data.given_name,
      familyName: data.family_name,
      phone: data.phone,
      hasAvatar: data.has_avatar,
    };
    setUser(authUser);
    setProjectIds(data.project_ids);
    return authUser;
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
    async (email: string, password: string): Promise<AuthUser | null> => {
      clearApiCache();
      const { data } = await api.post<{
        access_token: string;
        token_type: string;
        user: AuthUser;
      }>("/auth/login", { email, password });
      applyToken(data.access_token);
      const me = await refreshMe();
      clearApiCache();
      return me;
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
export const ROLE_NAV_PATHS: Record<string, string[]> = {
  admin: [
    "/",
    "/portfolio",
    "/clients",
    "/client-contracts",
    "/meetings",
    "/transitions",
    "/requisitions",
    "/candidates",
    "/candidate-store",
    "/finance",
    "/revenue-trackers",
    "/billing",
    "/finance-validation",
    "/vendor-licenses",
    "/sla-performance",
    "/wfm",
    "/data-operations",
    "/ingestion",
    "/tasks",
    "/activity",
    "/agent",
    "/revenue-governance",
    "/admin/users",
  ],
  platform_admin: [
    "/",
    "/portfolio",
    "/clients",
    "/client-contracts",
    "/meetings",
    "/transitions",
    "/requisitions",
    "/candidates",
    "/candidate-store",
    "/finance",
    "/revenue-trackers",
    "/billing",
    "/finance-validation",
    "/vendor-licenses",
    "/sla-performance",
    "/wfm",
    "/data-operations",
    "/ingestion",
    "/tasks",
    "/activity",
    "/agent",
    "/revenue-governance",
    "/admin/users",
  ],
  executive: [
    "/",
    "/portfolio",
    "/clients",
    "/client-contracts",
    "/meetings",
    "/transitions",
    "/requisitions",
    "/candidates",
    "/candidate-store",
    "/finance",
    "/revenue-trackers",
    "/billing",
    "/finance-validation",
    "/vendor-licenses",
    "/sla-performance",
    "/wfm",
    "/data-operations",
    "/ingestion",
    "/tasks",
    "/activity",
    "/agent",
    "/revenue-governance",
  ],
  project_head: [
    "/",
    "/clients",
    "/client-contracts",
    "/meetings",
    "/transitions",
    "/requisitions",
    "/candidates",
    "/candidate-store",
    "/finance",
    "/revenue-trackers",
    "/billing",
    "/vendor-licenses",
    "/sla-performance",
    "/wfm",
    "/ingestion",
    "/tasks",
    "/activity",
    "/agent",
  ],
  manager: [
    "/",
    "/clients",
    "/client-contracts",
    "/meetings",
    "/transitions",
    "/requisitions",
    "/candidates",
    "/candidate-store",
    "/finance",
    "/revenue-trackers",
    "/billing",
    "/vendor-licenses",
    "/sla-performance",
    "/wfm",
    "/ingestion",
    "/tasks",
    "/activity",
    "/agent",
  ],
  operations: [
    "/",
    "/portfolio",
    "/clients",
    "/client-contracts",
    "/meetings",
    "/transitions",
    "/requisitions",
    "/candidates",
    "/candidate-store",
    "/finance",
    "/revenue-trackers",
    "/billing",
    "/finance-validation",
    "/vendor-licenses",
    "/sla-performance",
    "/wfm",
    "/data-operations",
    "/ingestion",
    "/tasks",
    "/activity",
    "/agent",
    "/revenue-governance",
  ],
  recruiter: [
    "/",
    "/tasks",
    "/requisitions",
    "/candidates",
    "/candidate-store",
    "/meetings",
    "/clients",
    "/transitions",
    "/ingestion",
    "/activity",
    "/agent",
  ],
};

/** Default landing for recruiter persona (tasks-first home). */
export const RECRUITER_LANDING_PATH = "/tasks";

export function isRecruiterUser(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return (user.effectiveRole ?? user.role).toLowerCase() === "recruiter";
}

/** Post-login or “go home” path from resolved `/auth/me` user. */
export function homePathAfterAuth(user: AuthUser | null | undefined): string {
  if (!user) return "/";
  if (isRecruiterUser(user)) {
    const opts = { effectiveRole: user.effectiveRole, verticalAccess: user.verticalAccess };
    if (staffVerticalNavEnforced(user.role, user.effectiveRole) && !navAllowedForRole(RECRUITER_LANDING_PATH, user.role, opts)) {
      return firstAllowedStaffNavPath(user.role, opts);
    }
    return RECRUITER_LANDING_PATH;
  }
  const er = (user.effectiveRole ?? user.role).toLowerCase();
  if (er === "client_user") return firstAllowedNavPathForClient(user.verticalAccess);
  if (staffVerticalNavEnforced(user.role, user.effectiveRole)) {
    return firstAllowedStaffNavPath(user.role, {
      effectiveRole: user.effectiveRole,
      verticalAccess: user.verticalAccess,
    });
  }
  return "/";
}

/** Backend `VERTICAL_KEYS` → app routes (client portal allow-list). */
const VERTICAL_TO_NAV_PATHS: Record<string, string[]> = {
  finance: ["/finance"],
  sla: ["/sla-performance"],
  wfm: ["/wfm"],
  requisitions: ["/requisitions"],
  candidates: ["/requisitions", "/candidates", "/candidate-store"],
  contracts: ["/client-contracts"],
  meetings: ["/meetings"],
  transitions: ["/transitions"],
  ingestion: ["/ingestion"],
  revenue_forecast: ["/revenue-trackers"],
  revenue_billing: ["/billing"],
  finance_validation: ["/finance-validation"],
  revenue_kpi_governance: ["/revenue-governance"],
  vendor_licenses: ["/vendor-licenses"],
  tasks: ["/tasks"],
  portfolio: ["/", "/portfolio"],
  clients: ["/clients"],
  data_operations: ["/data-operations"],
};

export type NavAllowedOpts = {
  effectiveRole?: string;
  verticalAccess?: string[] | null;
};

/**
 * Longest-prefix wins. Paths omitted here are not gated by the module checklist (e.g. /, /profile, /activity, /agent).
 * Keys match backend `VERTICAL_KEYS` / AdminUsers `VERTICAL_MODULES`.
 */
const STAFF_PATH_VERTICAL_PREFIXES: [string, string][] = [
  ["/client-contracts", "contracts"],
  ["/candidate-store", "candidates"],
  ["/revenue-trackers", "revenue_forecast"],
  ["/finance-validation", "finance_validation"],
  ["/revenue-governance", "revenue_kpi_governance"],
  ["/vendor-licenses", "vendor_licenses"],
  ["/sla-performance", "sla"],
  ["/data-operations", "data_operations"],
  ["/admin/users", "admin_users"],
  ["/portfolio", "portfolio"],
  ["/transitions", "transitions"],
  ["/requisitions", "requisitions"],
  ["/candidates", "candidates"],
  ["/clients", "clients"],
  ["/meetings", "meetings"],
  ["/ingestion", "ingestion"],
  ["/finance", "finance"],
  ["/billing", "revenue_billing"],
  ["/wfm", "wfm"],
  ["/tasks", "tasks"],
];

function verticalKeyForStaffPath(pathname: string): string | null {
  for (const [prefix, key] of STAFF_PATH_VERTICAL_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return key;
  }
  return null;
}

/** When true, non-null `vertical_access` from `/auth/me` filters nav + gated APIs (executive, operations, etc.). */
export function staffVerticalNavEnforced(storedRole: string | undefined, effectiveRole: string | undefined): boolean {
  if (isPlatformAdminRole(storedRole) || isPlatformAdminRole(effectiveRole)) return false;
  const er = (effectiveRole ?? storedRole ?? "").toLowerCase();
  return (
    er === "operations" ||
    er === "executive" ||
    er === "project_head" ||
    er === "manager" ||
    er === "recruiter"
  );
}

function staffVerticalPathAllowed(pathname: string, verticalAccess: string[] | null | undefined): boolean {
  const vk = verticalKeyForStaffPath(pathname);
  if (vk == null) return true;
  if (verticalAccess == null) return true;
  if (verticalAccess.length === 0) return false;
  const set = new Set(verticalAccess.map((x) => String(x).toLowerCase()));
  return set.has(vk.toLowerCase());
}

/** First route the user may open (sidebar + deep links); `/profile` is the final fallback. */
export function firstAllowedStaffNavPath(role: string, opts?: NavAllowedOpts): string {
  for (const p of CLIENT_NAV_PRIORITY) {
    if (navAllowedForRole(p, role, opts)) return p;
  }
  if (navAllowedForRole("/profile", role, opts)) return "/profile";
  return "/profile";
}

export function clientPortalNavPaths(verticalAccess: string[] | null | undefined): string[] {
  const keys = verticalAccess?.filter(Boolean) ?? [];
  const out = new Set<string>();
  for (const k of keys) {
    const paths = VERTICAL_TO_NAV_PATHS[k.toLowerCase()];
    if (paths) paths.forEach((p) => out.add(p));
  }
  return [...out];
}

/** Prefer executive-style order when choosing a default landing route. */
export const CLIENT_NAV_PRIORITY = [
  "/",
  "/portfolio",
  "/clients",
  "/client-contracts",
  "/meetings",
  "/transitions",
  "/requisitions",
  "/candidates",
  "/candidate-store",
  "/finance",
  "/revenue-trackers",
  "/billing",
  "/finance-validation",
  "/revenue-governance",
  "/vendor-licenses",
  "/sla-performance",
  "/wfm",
  "/data-operations",
  "/ingestion",
  "/tasks",
  "/activity",
];

export function firstAllowedNavPathForClient(verticalAccess: string[] | null | undefined): string {
  const paths = clientPortalNavPaths(verticalAccess);
  if (paths.length === 0) return "/no-access";
  for (const p of CLIENT_NAV_PRIORITY) {
    if (paths.includes(p)) return p;
  }
  return paths[0];
}

function navRoleKey(role: string): string {
  const r = (role || "").toLowerCase();
  if (r === "admin" || r === "platform_admin") return "admin";
  if (r === "manager" || r === "project_head") return "manager";
  if (r === "operations") return "operations";
  if (r === "recruiter") return "recruiter";
  if (r === "executive") return "executive";
  if (r === "client_user") return "client_user";
  return "manager";
}

/** True for full platform admin (legacy `admin` or canonical `platform_admin`). */
export function isPlatformAdminRole(role: string | undefined): boolean {
  const r = (role || "").toLowerCase();
  return r === "admin" || r === "platform_admin";
}

export function isReadOnlyClient(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const er = (user.effectiveRole ?? user.role).toLowerCase();
  return er === "client_user" || user.isReadOnly === true;
}

/** Preferred display string for header / profile (not necessarily unique). */
export function displayNameFromUser(user: AuthUser | null): string {
  if (!user) return "";
  const g = (user.givenName ?? "").trim();
  const f = (user.familyName ?? "").trim();
  if (g || f) return `${g} ${f}`.trim();
  const local = user.email.split("@")[0] ?? "";
  return local || user.email;
}

export function initialsFromUser(user: AuthUser | null): string {
  const dn = displayNameFromUser(user);
  const parts = dn.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (dn.length >= 2) return dn.slice(0, 2).toUpperCase();
  if (user?.email && user.email.length >= 2) return user.email.slice(0, 2).toUpperCase();
  return "?";
}

/** Mirrors backend `_practice_may_submit` plus operations needing `revenue_billing` when verticals are configured. */
export function canPracticeSubmitBilling(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const raw = (user.effectiveRole ?? user.role).toLowerCase();
  if (raw === "recruiter" || raw === "client_user") return false;
  const canon = raw === "admin" ? "platform_admin" : raw === "manager" ? "project_head" : raw;
  if (canon === "platform_admin" || canon === "executive" || canon === "project_head") return true;
  if (canon === "operations") {
    const va = user.verticalAccess;
    if (va === null || va === undefined) return true;
    if (va.length === 0) return false;
    return va.some((x) => String(x).toLowerCase() === "revenue_billing");
  }
  return false;
}

export function navAllowedForRole(pathname: string, role: string, opts?: NavAllowedOpts): boolean {
  if (pathname === "/profile") return true;
  const er = (opts?.effectiveRole ?? role).toLowerCase();
  if (er === "client_user") {
    if (pathname === "/no-access") return true;
    const paths = clientPortalNavPaths(opts?.verticalAccess);
    if (paths.length === 0) return pathname === "/no-access";
    if (paths.includes(pathname)) return true;
    if (pathname.startsWith("/clients/") && paths.includes("/clients")) return true;
    return false;
  }
  if (isPlatformAdminRole(role) || isPlatformAdminRole(opts?.effectiveRole ?? "")) {
    const key = navRoleKey(opts?.effectiveRole ?? role);
    const allowed = ROLE_NAV_PATHS[key] ?? ROLE_NAV_PATHS.manager;
    if (allowed.includes(pathname)) return true;
    if (pathname.startsWith("/clients/") && allowed.includes("/clients")) return true;
    return false;
  }
  const key = navRoleKey(opts?.effectiveRole ?? role);
  const allowed = ROLE_NAV_PATHS[key] ?? ROLE_NAV_PATHS.manager;
  if (allowed.includes(pathname)) {
    if (!staffVerticalNavEnforced(role, opts?.effectiveRole)) return true;
    return staffVerticalPathAllowed(pathname, opts?.verticalAccess);
  }
  if (pathname.startsWith("/clients/") && allowed.includes("/clients")) {
    if (!staffVerticalNavEnforced(role, opts?.effectiveRole)) return true;
    return staffVerticalPathAllowed(pathname, opts?.verticalAccess);
  }
  return false;
}

export function canAccessFinanceValidation(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return navAllowedForRole("/finance-validation", user.role, {
    effectiveRole: user.effectiveRole,
    verticalAccess: user.verticalAccess,
  });
}

export function canAccessRevenueGovernance(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  return navAllowedForRole("/revenue-governance", user.role, {
    effectiveRole: user.effectiveRole,
    verticalAccess: user.verticalAccess,
  });
}

/** Practice-side project lead (legacy `manager` maps to project_head on the backend). */
export function isProjectHeadLike(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  const er = (user.effectiveRole ?? user.role).toLowerCase();
  return er === "project_head" || er === "manager";
}
