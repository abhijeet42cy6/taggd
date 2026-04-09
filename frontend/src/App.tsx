import React from "react";
import {
  BrowserRouter as Router,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { PersonaProvider, usePersona } from "@/lib/persona";
import { AuthProvider, navAllowedForRole, useAuth } from "@/lib/auth";
import { ClientsHub } from "./pages/ClientsHub";
import { ClientDetail } from "./pages/ClientDetail";
import { ClientContracts } from "./pages/ClientContracts";
import { Agent } from "./pages/Agent";
import { Dashboard } from "./pages/Dashboard";
import { DataOperations } from "./pages/DataOperations";
import { FiscalPerformance } from "./pages/FiscalPerformance";
import { RevenueTrackers } from "./pages/RevenueTrackers";
import { Billing } from "./pages/Billing";
import { ActivityLog } from "./pages/ActivityLog";
import { IngestionCenter } from "./pages/IngestionCenter";
import { PortfolioIntelligence } from "./pages/PortfolioIntelligence";
import { Requisitions } from "./pages/Requisitions";
import { SLAPerformance } from "./pages/SLAPerformance";
import { WorkforceManagement } from "./pages/WorkforceManagement";
import { Login } from "./pages/Login";
import { AdminUsers } from "./pages/AdminUsers";
import taggdLogo from "@/assets/taggd-logo.png";
import "./styles/platform.css";

type NavItem = { label: string; path: string };
type NavGroup = { title: string; items: NavItem[] };

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
      { label: "Requisitions", path: "/requisitions" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { label: "Finance Command", path: "/finance" },
      { label: "Revenue trackers", path: "/revenue-trackers" },
      { label: "Billing", path: "/billing" },
      { label: "SLA Performance", path: "/sla-performance" },
      { label: "Workforce Mgmt", path: "/wfm" },
    ],
  },
  {
    title: "Platform",
    items: [
      { label: "Data Operations", path: "/data-operations" },
      { label: "Ingestion Center", path: "/ingestion" },
      { label: "Activity log", path: "/activity" },
      /* Agent: route kept below; hidden from nav for all roles */
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

function AppShell() {
  const { user, logout } = useAuth();
  const { persona } = usePersona();
  const navigate = useNavigate();

  const role = user?.role;
  const filteredGroups: NavGroup[] = ALL_NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => (role ? navAllowedForRole(item.path, role) : false)),
  })).filter((g) => g.items.length > 0);

  const email = user?.email ?? "";
  const initials =
    email.length >= 2
      ? email
          .split("@")[0]
          .slice(0, 2)
          .toUpperCase()
      : "?";

  return (
    <div className="platform-app">
      <div className="platform-layout">
        <aside className="platform-sidebar">
          <div className="platform-logo">
            <img src={taggdLogo} alt="Taggd" className="platform-logo-img" />
            <div className="platform-logo-tagline">Intelligence Platform</div>
          </div>

          <div style={{ flex: 1, overflow: "auto" }}>
            {filteredGroups.map((g) => (
              <div key={g.title} className="nav-section">
                <div className="platform-nav-group-title">{g.title}</div>
                {g.items.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === "/"}
                    className={({ isActive }) => `platform-nav-item${isActive ? " active" : ""}`}
                  >
                    <span style={{ flex: 1 }}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </div>

          <div
            style={{
              borderTop: "1px solid var(--border)",
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 9,
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                flexShrink: 0,
                background: `linear-gradient(135deg, ${persona.accentColor}, var(--accent2))`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {email || "—"}
              </div>
              <div style={{ fontSize: 9, color: "var(--accent)", fontFamily: "'DM Mono',monospace" }}>
                {user?.role ?? ""}
              </div>
            </div>
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
                color: "var(--text-muted)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Out
            </button>
          </div>
        </aside>

        <main className="platform-main">
          <header className="platform-topbar">
            <div style={{ fontWeight: 700, fontSize: 13, fontFamily: "'Syne',sans-serif" }}>Control Center</div>
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace" }}>
              / FY2024-25
            </span>
            <div style={{ flex: 1 }} />
            <input className="platform-search" placeholder="⌕  Search..." />
          </header>

          <section className="platform-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/portfolio" element={<PortfolioIntelligence />} />
              <Route path="/clients" element={<ClientsHub />} />
              <Route path="/clients/:clientId" element={<ClientDetail />} />
              <Route path="/client-contracts" element={<ClientContracts />} />
              <Route path="/requisitions" element={<Requisitions />} />
              <Route path="/finance" element={<FiscalPerformance />} />
              <Route path="/revenue-trackers" element={<RevenueTrackers />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/sla-performance" element={<SLAPerformance />} />
              <Route path="/wfm" element={<WorkforceManagement />} />
              <Route path="/data-operations" element={<DataOperations />} />
              <Route path="/ingestion" element={<IngestionCenter />} />
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
