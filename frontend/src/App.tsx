import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  LayoutGrid,
  LineChart,
  Package,
  PieChart,
  Telescope,
  Receipt,
  ScrollText,
  LogOut,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
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
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClientsHub } from "./pages/ClientsHub";
import { ClientDetail } from "./pages/ClientDetail";
import { ClientContracts } from "./pages/ClientContracts";
import { Meetings } from "./pages/Meetings";
import { VendorLicenses } from "./pages/VendorLicenses";
import { Tasks } from "./pages/Tasks";
import { Agent } from "./pages/Agent";
import { Dashboard } from "./pages/Dashboard";
import { CeoView } from "./pages/CeoView";
import { Projections } from "./pages/Projections";
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
import { ClientDashboard } from "./pages/ClientDashboard";
import { RevenueLeakage } from "./pages/RevenueLeakage";
import { WorkforceManagement } from "./pages/WorkforceManagement";
import { Login } from "./pages/Login";
import { AdminUsers } from "./pages/AdminUsers";
import { Profile } from "./pages/Profile";
import { Transitions } from "./pages/Transitions";
import taggdLogo from "@/assets/taggd-logo.png";
import { CompanyValuesModal } from "@/components/CompanyValuesModal";
import { COMPANY_VALUES_SESSION_FLAG } from "@/lib/company-values";
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
/** Staff Control Centre: collapsible parent + child links. */
type MainNavAccordion = { id: string; title: string; items: NavItem[] };

function isNavItemActive(pathname: string, itemPath: string) {
  if (itemPath === "/") return pathname === "/";
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

const SIDEBAR_COLLAPSED_KEY = "platform_sidebar_collapsed";

/** Lucide icons for collapsed rail + visual scan when expanded (design system: icon + label). */
const NAV_PATH_ICONS: Record<string, LucideIcon> = {
  "/": LayoutDashboard,
  "/portfolio": PieChart,
  "/clients": Users,
  "/client-contracts": FileText,
  "/client-dashboard": LayoutGrid,
  "/meetings": Calendar,
  "/transitions": ArrowRightLeft,
  "/requisitions": ClipboardList,
  "/candidates": UserCircle,
  "/candidate-store": Archive,
  "/finance": Landmark,
  "/projections": Telescope,
  "/revenue-trackers": LineChart,
  "/billing": Receipt,
  "/finance-validation": ShieldCheck,
  "/revenue-governance": Package,
  "/vendor-licenses": KeyRound,
  "/sla-performance": Gauge,
  "/revenue-leakage": TrendingDown,
  "/wfm": Users2,
  "/ceo-view": TrendingUp,
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
      { label: "Client dashboard", path: "/client-dashboard" },
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

const STAFF_MAIN_NAV_ACCORDIONS: MainNavAccordion[] = [
  {
    id: "leadership",
    title: "Leadership",
    items: [
      { label: "Executive Overview", path: "/" },
      { label: "CEO's View", path: "/ceo-view" },
      { label: "Portfolio Intel", path: "/portfolio" },
    ],
  },
  {
    id: "business-financials",
    title: "Business financials",
    items: [
      { label: "Billing", path: "/billing" },
      { label: "Finance validation", path: "/finance-validation" },
      { label: "Revenue packs", path: "/revenue-governance" },
      { label: "Finance Command", path: "/finance" },
      { label: "Projections", path: "/projections" },
      { label: "Revenue trackers", path: "/revenue-trackers" },
    ],
  },
  {
    id: "vendor",
    title: "Vendor Management",
    items: [{ label: "Vendor Management", path: "/vendor-licenses" }],
  },
  {
    id: "operations",
    title: "Operations",
    items: [
      { label: "Requisitions", path: "/requisitions" },
      { label: "Candidates", path: "/candidates" },
      { label: "Candidate store", path: "/candidate-store" },
      { label: "Meetings", path: "/meetings" },
      { label: "Clients", path: "/clients" },
      { label: "Client dashboard", path: "/client-dashboard" },
    ],
  },
  {
    id: "commercial",
    title: "Commercial",
    items: [
      { label: "Client onboarding", path: "/transitions" },
      { label: "Contracts", path: "/client-contracts" },
    ],
  },
  {
    id: "business-excellence",
    title: "Business Excellence",
    items: [{ label: "SLA KPI", path: "/sla-performance" }],
  },
  {
    id: "revenue-leakage",
    title: "Revenue Leakage",
    items: [{ label: "Revenue Leakage", path: "/revenue-leakage" }],
  },
  {
    id: "workforce",
    title: "Workforce Management",
    items: [{ label: "Workforce Mgmt", path: "/wfm" }],
  },
  {
    id: "platform",
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
  const [missionVisionOpen, setMissionVisionOpen] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    try {
      if (sessionStorage.getItem(COMPANY_VALUES_SESSION_FLAG) === "1") {
        setMissionVisionOpen(true);
      }
    } catch {
      /* ignore storage */
    }
  }, [user?.id]);

  const onMissionVisionOpenChange = (open: boolean) => {
    setMissionVisionOpen(open);
    if (!open) {
      try {
        sessionStorage.removeItem(COMPANY_VALUES_SESSION_FLAG);
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <PersonaProvider key={user?.id ?? "user"}>
      <CompanyValuesModal open={missionVisionOpen} onOpenChange={onMissionVisionOpenChange} />
      <AppShell onOpenMissionVision={() => setMissionVisionOpen(true)} />
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

function AppShell({ onOpenMissionVision }: { onOpenMissionVision: () => void }) {
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
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

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

  const filteredRecruiterGroups: NavGroup[] = useMemo(() => {
    if (!isRecruiter) return [];
    return RECRUITER_NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) =>
        role ? navAllowedForRole(item.path, role, { effectiveRole, verticalAccess }) : false,
      ),
    })).filter((g) => g.items.length > 0);
  }, [isRecruiter, role, effectiveRole, verticalAccess]);

  const [mainNavExpanded, setMainNavExpanded] = useState<Record<string, boolean>>({});
  const staffNavPathRef = useRef<string | null>(null);

  const filteredStaffAccordions = useMemo(() => {
    if (isRecruiter) return [] as MainNavAccordion[];
    const allow = (item: NavItem) =>
      role ? navAllowedForRole(item.path, role, { effectiveRole, verticalAccess }) : false;
    return STAFF_MAIN_NAV_ACCORDIONS.map((g) => ({
      ...g,
      items: g.items.filter(allow),
    })).filter((g) => g.items.length > 0);
  }, [isRecruiter, role, effectiveRole, verticalAccess]);

  const staffFlatForCollapsed = useMemo(
    () => filteredStaffAccordions.flatMap((g) => g.items),
    [filteredStaffAccordions],
  );

  useLayoutEffect(() => {
    if (isRecruiter) return;
    const p = location.pathname;
    if (staffNavPathRef.current === null || staffNavPathRef.current !== p) {
      staffNavPathRef.current = p;
      const match = filteredStaffAccordions.find((g) =>
        g.items.some((item) => isNavItemActive(p, item.path)),
      );
      if (match) {
        setMainNavExpanded((prev) => ({ ...prev, [match.id]: true }));
      }
    }
  }, [isRecruiter, location.pathname, filteredStaffAccordions]);

  const email = user?.email ?? "";
  const displayName = user ? displayNameFromUser(user) : "";
  const initials = user ? initialsFromUser(user) : "?";

  const confirmLogout = () => {
    logout();
    setLogoutConfirmOpen(false);
    navigate("/login", { replace: true });
  };

  return (
    <>
    <div className="platform-app">
      <div className="platform-layout">
        <aside className={cn("platform-sidebar", sidebarCollapsed && "platform-sidebar--collapsed")}>
          <div className="platform-sidebar-head">
            <div className="platform-sidebar-head-row">
              <div className="platform-logo-inner">
                <img src={taggdLogo} alt="Taggd" className="platform-logo-img" />
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
            {isRecruiter
              ? filteredRecruiterGroups.map((g) => (
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
                ))
              : sidebarCollapsed
                ? (
                    <div className="nav-section">
                      {staffFlatForCollapsed.map((item) => {
                        const p = location.pathname;
                        const active = isNavItemActive(p, item.path);
                        return (
                          <NavLink
                            key={item.path + item.label}
                            to={item.path}
                            end={item.path === "/"}
                            title={item.label}
                            className={`platform-nav-item${active ? " active" : ""}`}
                          >
                            <NavPathIcon path={item.path} />
                            <span className="platform-nav-label">{item.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )
                : (
                    <>
                      {filteredStaffAccordions.map((g) => {
                        const hasChildActive = g.items.some((item) => isNavItemActive(location.pathname, item.path));
                        const isOpen = mainNavExpanded[g.id] ?? hasChildActive;
                        return (
                          <div
                            key={g.id}
                            className={cn("nav-section platform-nav-accordion", isOpen && "platform-nav-accordion--open", hasChildActive && "platform-nav-accordion--child-active")}
                          >
                            <button
                              type="button"
                              className="platform-nav-accordion__trigger"
                              aria-expanded={isOpen}
                              onClick={() => {
                                setMainNavExpanded((prev) => {
                                  const wasOpen = prev[g.id] ?? g.items.some((it) => isNavItemActive(location.pathname, it.path));
                                  return { ...prev, [g.id]: !wasOpen };
                                });
                              }}
                            >
                              <span className="platform-nav-accordion__title-text">{g.title}</span>
                              <ChevronRight className="platform-nav-accordion__chevron" size={14} strokeWidth={2} aria-hidden />
                  </button>
                            {isOpen && (
                              <div className="platform-nav-accordion__panel" role="region" aria-label={g.title}>
                                {g.items.map((item) => (
                                  <NavLink
                                    key={item.path + item.label}
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
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
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
                <div className="platform-sidebar-footer__meta">
                  <div className="platform-sidebar-footer__name">{displayName || email || "—"}</div>
                  <div className="platform-sidebar-footer__role">{effectiveRole || user?.role || ""}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  title="Log out"
                  aria-label="Log out"
                  onClick={() => setLogoutConfirmOpen(true)}
                >
                  <LogOut className="size-4" strokeWidth={2} aria-hidden />
                </Button>
              </>
            ) : (
              <button
                type="button"
                className="platform-sidebar-footer-collapsed-menu-trigger"
                title="Log out"
                aria-label="Log out"
                onClick={() => setLogoutConfirmOpen(true)}
              >
                <LogOut size={18} strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
        </aside>

        <main className="platform-main">
          <header className="platform-topbar">
            <div style={{ flex: 1 }} />
            <div className="platform-topbar-end">
              <div className="platform-topbar-search-wrap">
                <span style={{ color: "var(--text-subtle)", fontSize: 13 }} aria-hidden>
                  ⌕
                </span>
                <input
                  className="platform-search"
                  placeholder="Search…"
                  style={{ border: "none", background: "transparent", padding: 0, fontSize: 13, flex: 1, minWidth: 0 }}
                />
              </div>
              <button type="button" className="platform-topbar-mission-btn" onClick={onOpenMissionVision}>
                Mission &amp; Vision
              </button>
              </div>
            </header>

          <section className="platform-content">
                <Routes>
              <Route path="/no-access" element={<ClientPortalNoAccess />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/transitions" element={<Transitions />} />
              <Route path="/" element={<RoleHome />} />
              <Route path="/ceo-view" element={<CeoView />} />
              <Route path="/portfolio" element={<PortfolioIntelligence />} />
              <Route path="/clients" element={<ClientsHub />} />
              <Route path="/clients/:clientId" element={<ClientDetail />} />
              <Route path="/client-contracts" element={<ClientContracts />} />
              <Route path="/client-dashboard" element={<ClientDashboard />} />
              <Route path="/meetings" element={<Meetings />} />
              <Route path="/requisitions" element={<Requisitions />} />
              <Route path="/candidates" element={<Candidates />} />
              <Route path="/candidate-store" element={<CandidateStore />} />
              <Route path="/finance" element={<FiscalPerformance />} />
              <Route path="/projections" element={<Projections />} />
              <Route path="/revenue-trackers" element={<RevenueTrackers />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/finance-validation" element={<FinanceValidation />} />
              <Route path="/revenue-governance" element={<RevenueGovernance />} />
              <Route path="/vendor-licenses" element={<VendorLicenses />} />
                  <Route path="/sla-performance" element={<SLAPerformance />} />
              <Route path="/revenue-leakage" element={<RevenueLeakage />} />
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

    <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
      <AlertDialogContent size="default" className="border-border sm:max-w-md">
        <AlertDialogHeader className="text-left sm:text-left">
          <AlertDialogTitle>Log out?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to log out? You will need to sign in again to access the platform.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="border-border">
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-[var(--accent)] text-white hover:opacity-90"
            onClick={confirmLogout}
          >
            Log out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
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
