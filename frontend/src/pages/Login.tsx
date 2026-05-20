import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { homePathAfterAuth, useAuth } from "@/lib/auth";
import taggdLogo from "@/assets/taggd-logo.png";
import "@/styles/platform.css";

/** `Group 14004.png` in repo root, copied to `public/group-14004.png` (served as static asset). */
const loginBg = `${import.meta.env.BASE_URL}group-14004.png`;

const loginShellStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  backgroundColor: "#e8e8ea",
  backgroundImage: `linear-gradient(180deg, rgba(250,250,252,0.42) 0%, rgba(245,245,248,0.25) 100%), url(${loginBg})`,
  backgroundSize: "cover",
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
};

export function Login() {
  const { login, loading, token, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!loading && token && user) {
      navigate(homePathAfterAuth(user), { replace: true });
    }
  }, [loading, token, user, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const me = await login(email.trim(), password);
      navigate(homePathAfterAuth(me), { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="platform-app" style={loginShellStyle}>
        <div style={{ color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", fontSize: 12 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="platform-app" style={loginShellStyle}>
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          padding: "28px 26px",
          borderRadius: 14,
          border: "1px solid color-mix(in srgb, var(--border) 85%, transparent)",
          background: "color-mix(in srgb, var(--surface) 94%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 24px 56px rgba(15, 23, 42, 0.22), 0 0 0 1px rgba(255,255,255,0.06) inset",
        }}
      >
        <div style={{ marginBottom: 22, textAlign: "center" }}>
          <img
            src={taggdLogo}
            alt="Taggd"
            style={{
              height: 40,
              width: "auto",
              maxWidth: "100%",
              objectFit: "contain",
              display: "inline-block",
              marginBottom: 16,
            }}
          />
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 20 }}>Sign in</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontFamily: "'DM Mono',monospace" }}>
            Intelligence Platform
          </div>
        </div>

        <label style={{ display: "block", fontSize: 11, marginBottom: 6, color: "var(--text-muted)" }}>Email</label>
        <input
          className="platform-search"
          style={{ width: "100%", marginBottom: 14, boxSizing: "border-box" }}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label style={{ display: "block", fontSize: 11, marginBottom: 6, color: "var(--text-muted)" }}>Password</label>
        <input
          className="platform-search"
          style={{ width: "100%", marginBottom: 18, boxSizing: "border-box" }}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error ? (
          <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{error}</div>
        ) : null}

        <button
          type="submit"
          className="platform-chip active"
          disabled={busy}
          style={{ width: "100%", cursor: busy ? "wait" : "pointer", border: "none", padding: "10px 14px" }}
        >
          {busy ? "Signing in…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
