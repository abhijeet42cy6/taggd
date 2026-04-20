import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowRightLeft,
  Archive,
  Bot,
  Calendar,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LineChart,
  LogOut,
  Package,
  PieChart,
  Receipt,
  ScrollText,
  ShieldCheck,
  Upload,
  User,
  UserCog,
  UserCircle,
  Users,
  Users2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PersonaProvider, usePersona } from "@/lib/persona";
import {
  AuthProvider,
  displayNameFromUser,
  firstAllowedNavPathForClient,
  firstAllowedStaffNavPath,
  initialsFromUser,
  isRecruiterUser,
  navAllowedForRole,
  staffVerticalNavEnforced,
  useAuth,
} from "@/lib/auth";
import { UserAvatarImg } from "@/components/UserAvatarImg";
import { ClientsHub } from "./pages/ClientsHub";
import { ClientDetail } from "./pages/ClientDetail";
import { ClientContracts } from "./pages/ClientContracts";
import { Meetings } from "./pages/Meetings";
import { VendorLicenses } from "./pages/VendorLicenses";
import { Tasks } from "./pages/Tasks";
import { Agent } from "./pages/Agent";
import { Dashboard } from "./pages/Dashboard";
import { DataOperations } from "./pages/DataOperations";
import { FiscalPerformance } from "./pages/FiscalPerformance";
import { RevenueTrackers } from "./pages/RevenueTrackers";
import { Billing } from "./pages/Billing";
import { FinanceValidation } from "./pages/FinanceValidation";
import { RevenueGovernance } from "./pages/RevenueGovernance";
import { ActivityLog } from "./pages/ActivityLog";
import { IngestionCenter } from "./pages/IngestionCenter";
import { PortfolioIntelligence } from "./pages/PortfolioIntelligence";
import { Requisitions } from "./pages/Requisitions";
import { Candidates } from "./pages/Candidates";
import { CandidateStore } from "./pages/CandidateStore";
import { SLAPerformance } from "./pages/SLAPerformance";
import { WorkforceManagement } from "./pages/WorkforceManagement";
import { Login } from "./pages/Login";
import { AdminUsers } from "./pages/AdminUsers";
import { Profile } from "./pages/Profile";
import { Transitions } from "./pages/Transitions";
import taggdLogo from "@/assets/taggd-logo.png";
import "./styles/platform.css";

function ClientPortalNoAccess() {
  return (
    <div style={{ padding: 28, maxWidth: 520 }}>
      <h2 style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, margin: "0 0 10px" }}>No dashboards enabled</h2>
      <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>
        This client portal login has no modules assigned. Ask your platform administrator to enable at least one
        dashboard in <strong>Users &amp; access</strong> for your account.
      </p>
    </div>
  );
}

type NavItem = { label: string; path: string };
type NavGroup = { title: string; items: NavItem[] };

const SIDEBAR_COLLAPSED_KEY = "platform_sidebar_collapsed";

/** Lucide icons for collapsed rail + visual scan when expanded (design system: icon + label). */
const NAV_PATH_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/portfolio": PieChart,
  "/clients": Users,
  "/client-contracts": FileText,
  "/meetings": Calendar,
  "/transitions": ArrowRightLeft,
  "/requisitions": ClipboardList,
  "/candidates": UserCircle,
  "/candidate-store": Archive,
  "/finance": Landmark,
  "/revenue-trackers": LineChart,
  "/billing": Receipt,
  "/finance-validation": ShieldCheck,
  "/revenue-governance": Package,
  "/vendor-licenses": KeyRound,
  "/sla-performance": Gauge,
  "/wfm": Users2,
  "/profile": User,
  "/tasks": CheckSquare,
  "/agent": Bot,
  "/data-operations": Database,
  "/ingestion": Upload,
  "/activity": ScrollText,
  "/admin/users": UserCog,
};

function NavPathIcon({ path }: { path: string }) {
  const Icon = NAV_PATH_ICONS[path] ?? CircleDot;
  return <Icon className="platform-nav-icon" size={18} strokeWidth={2} aria-hidden />;
}

/** Recruiter-focused IA: work queue first, then accounts, then data & audit. */
const RECRUITER_NAV_GROUPS: NavGroup[] = [
  {
    title: "My work",
    items: [
      { label: "Tasks", path: "/tasks" },
      { label: "Requisitions", path: "/requisitions" },
      { label: "Candidates", path: "/candidates" },
      { label: "Candidate store", path: "/candidate-store" },
      { label: "Meetings", path: "/meetings" },
    ],
  },
  {
    title: "Clients & onboarding",
    items: [
      { label: "Clients", path: "/clients" },
      { label: "Client onboarding", path: "/transitions" },
    ],
  },
  {
    title: "Data & tools",
    items: [
      { label: "Ingestion Center", path: "/ingestion" },
      { label: "Activity log", path: "/activity" },
      { label: "Assistant", path: "/agent" },
    ],
  },
  {
    title: "Account",
    items: [{ label: "My profile", path: "/profile" }],
  },
];

const ALL_NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Executive Overview", path: "/" },
      { label: "Portfolio Intel", path: "/portfolio" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Clients", path: "/clients" },
      { label: "Contracts", path: "/client-contracts" },
      { label: "Meetings", path: "/meetings" },
      { label: "Client onboarding", path: "/transitions" },
      { label: "Requisitions", path: "/requisitions" },
      { label: "Candidates", path: "/candidates" },
      { label: "Candidate store", path: "/candidate-store" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Finance Command", path: "/finance" },
      { label: "Revenue trackers", path: "/revenue-trackers" },
      { label: "Billing", path: "/billing" },
      { label: "Finance validation", path: "/finance-validation" },
      { label: "Revenue packs", path: "/revenue-governance" },
      { label: "Vendor licenses", path: "/vendor-licenses" },
      { label: "SLA Performance", path: "/sla-performance" },
      { label: "Workforce Mgmt", path: "/wfm" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "My profile", path: "/profile" },
      { label: "Tasks", path: "/tasks" },
      { label: "Assistant", path: "/agent" },
      { label: "Data Operations", path: "/data-operations" },
      { label: "Ingestion Center", path: "/ingestion" },
      { label: "Activity log", path: "/activity" },
      { label: "Users & access", path: "/admin/users" },
    ],
  },
];

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="platform-app" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 12 }}>Loading…</div>
      </div>
    );
  }
  if (!token) {
    return <Navigate to="/login" state={{ from: loc }} replace />;
  }
  return <>{children}</>;
}

/** Remount persona when the logged-in user changes so UI prefs don’t leak across accounts. */
function AuthenticatedApp() {
  const { user } = useAuth();
  return (
    <PersonaProvider key={user?.id ?? "user"}>
      <AppShell />
    </PersonaProvider>
  );
}

/** Non–exec roles land on role-specific home; recruiters use tasks-first workspace. */
function RoleHome() {
  const { user } = useAuth();
  if (isRecruiterUser(user)) {
    return <Navigate to="/tasks" replace />;
  }
  return <Dashboard />;
}

function AppShell() {
  const { user, logout } = useAuth();
  const { persona } = usePersona();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const role = user?.role ?? "";
  const effectiveRole = user?.effectiveRole ?? role;
  const verticalAccess = user?.verticalAccess ?? null;
  const isRecruiter = isRecruiterUser(user);

  if (effectiveRole === "client_user") {
    const allowed = navAllowedForRole(location.pathname, role, { effectiveRole, verticalAccess });
    if (!allowed) {
      return <Navigate to={firstAllowedNavPathForClient(verticalAccess)} replace />;
    }
  }

  if (isRecruiter) {
    const allowed = navAllowedForRole(location.pathname, role, { effectiveRole, verticalAccess });
    if (!allowed) {
      const fallback = firstAllowedStaffNavPath(role, { effectiveRole, verticalAccess });
      return <Navigate to={fallback} replace />;
    }
  }

  if (
    user &&
    !isRecruiter &&
    effectiveRole !== "client_user" &&
    staffVerticalNavEnforced(role, effectiveRole) &&
    !navAllowedForRole(location.pathname, role, { effectiveRole, verticalAccess })
  ) {
    return (
      <Navigate
        to={firstAllowedStaffNavPath(role, { effectiveRole, verticalAccess })}
        replace
      />
    );
  }

  const filteredGroups: NavGroup[] = (isRecruiter ? RECRUITER_NAV_GROUPS : ALL_NAV_GROUPS)
    .map((g) => ({
      ...g,
      items: g.items.filter((item) =>
        role ? navAllowedForRole(item.path, role, { effectiveRole, verticalAccess }) : false,
      ),
    }))
    .filter((g) => g.items.length > 0);

  const email = user?.email ?? "";
  const displayName = user ? displayNameFromUser(user) : "";
  const initials = user ? initialsFromUser(user) : "?";

  return (
    <div className="platform-app">
      <div className="platform-layout">
        <aside className={cn("platform-sidebar", sidebarCollapsed && "platform-sidebar--collapsed")}>
          <div className="platform-sidebar-head">
            <div className="platform-sidebar-head-row">
              <div className="platform-logo-inner">
                <img src={taggdLogo} alt="Taggd" className="platform-logo-img" />
                <div className="platform-logo-tagline">{isRecruiter ? "Recruiting workspace" : "Intelligence Platform"}</div>
              </div>
              <button
                type="button"
                className="platform-sidebar-toggle"
                aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
                aria-expanded={!sidebarCollapsed}
                onClick={() => setSidebarCollapsed((c) => !c)}
              >
                {sidebarCollapsed ? <ChevronRight size={18} strokeWidth={2} /> : <ChevronLeft size={18} strokeWidth={2} />}
              </button>
            </div>
          </div>

          <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
            {filteredGroups.map((g) => (
              <div key={g.title} className="nav-section">
                <div className="platform-nav-group-title">{g.title}</div>
                {g.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    title={item.label}
                    className={({ isActive }) => `platform-nav-item${isActive ? " active" : ""}`}
                  >
                    <NavPathIcon path={item.path} />
                    <span className="platform-nav-label">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </div>

          <div className={cn("platform-sidebar-footer", sidebarCollapsed && "is-collapsed")}>
            <UserAvatarImg
              userId={user?.id}
              hasAvatar={user?.hasAvatar}
              size={sidebarCollapsed ? 36 : 32}
              fallback={
                <div
                  style={{
                    width: sidebarCollapsed ? 36 : 32,
                    height: sidebarCollapsed ? 36 : 32,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: "var(--entity-indigo)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#fff",
                  }}
                >
                  {initials}
                </div>
              }
            />
            {!sidebarCollapsed ? (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {displayName || email || "—"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--accent)", fontFamily: "var(--mono)" }}>
                    {effectiveRole || user?.role || ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    title="My profile"
                    onClick={() => navigate("/profile")}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-subtle)",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: "2px 4px",
                      borderRadius: "var(--radius-sm)",
                      fontFamily: "var(--font)",
                      transition: "color var(--t-fast), background var(--t-fast)",
                    }}
                  >
                    Profile
                  </button>
                  <button
                    type="button"
                    title="Log out"
                    onClick={() => {
                      logout();
                      navigate("/login", { replace: true });
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-subtle)",
                      fontSize: 11,
                      cursor: "pointer",
                      padding: "2px 4px",
                      borderRadius: "var(--radius-sm)",
                      fontFamily: "var(--font)",
                      transition: "color var(--t-fast), background var(--t-fast)",
                    }}
                  >
                    Log out
                  </button>
                </div>
              </>
            ) : (
              <div className="platform-sidebar-footer-collapsed-btns">
                <button type="button" title="My profile" onClick={() => navigate("/profile")}>
                  <User size={16} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  title="Log out"
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                >
                  <LogOut size={16} strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="platform-main">
          <header className="platform-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: 13, letterSpacing: "0.02em", color: "var(--text-subtle)" }}>
              <span style={{ color: "var(--text)", fontWeight: 500 }}>
                {isRecruiter ? "Recruiting" : "Control Centre"}
              </span>
              <span style={{ opacity: 0.4 }}>›</span>
              <span>{isRecruiter ? "Work queue" : "FY 2024-25"}</span>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-page)", border: "1px solid var(--border)", borderRadius: "var(--radius-base)", padding: "7px 12px", width: 220, transition: "border-color var(--t-base), box-shadow var(--t-base)" }}>
              <span style={{ color: "var(--text-subtle)", fontSize: 13 }}>⌕</span>
              <input
                className="platform-search"
                placeholder="Search…"
                style={{ border: "none", background: "transparent", padding: 0, fontSize: 13, flex: 1, minWidth: 0 }}
              />
            </div>
          </header>

          <section className="platform-content">
            <Routes>
              <Route path="/no-access" element={<ClientPortalNoAccess />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/transitions" element={<Transitions />} />
              <Route path="/" element={<RoleHome />} />
              <Route path="/portfolio" element={<PortfolioIntelligence />} />
              <Route path="/clients" element={<ClientsHub />} />
              <Route path="/clients/:clientId" element={<ClientDetail />} />
              <Route path="/client-contracts" element={<ClientContracts />} />
              <Route path="/meetings" element={<Meetings />} />
              <Route path="/requisitions" element={<Requisitions />} />
              <Route path="/candidates" element={<Candidates />} />
              <Route path="/candidate-store" element={<CandidateStore />} />
              <Route path="/finance" element={<FiscalPerformance />} />
              <Route path="/revenue-trackers" element={<RevenueTrackers />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/finance-validation" element={<FinanceValidation />} />
              <Route path="/revenue-governance" element={<RevenueGovernance />} />
              <Route path="/vendor-licenses" element={<VendorLicenses />} />
              <Route path="/sla-performance" element={<SLAPerformance />} />
              <Route path="/wfm" element={<WorkforceManagement />} />
              <Route path="/data-operations" element={<DataOperations />} />
              <Route path="/ingestion" element={<IngestionCenter />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/activity" element={<ActivityLog />} />
              <Route path="/agent" element={<Agent />} />
              <Route path="/admin/users" element={<AdminUsers />} />
            </Routes>
          </section>
        </main>
      </div>
    </div>
  );
}

const App = () => (
  <AuthProvider>
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <AuthenticatedApp />
            </RequireAuth>
          }
        />
      </Routes>
    </Router>
  </AuthProvider>
);

export default App;
