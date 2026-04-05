import React, { useState } from "react";
import { usePersona } from "@/lib/persona";

type Alert = { id: string; message: string; severity: "red" | "amber"; action?: string };

const PERSONA_ALERTS: Record<string, Alert[]> = {
  ceo: [
    { id: "risk1", message: "3 clients have composite score below 65 — immediate intervention recommended.", severity: "red", action: "View Interventions" },
    { id: "data1", message: "2 data quality issues detected this week affecting Finance and Identity.", severity: "amber", action: "View Issues" },
  ],
  finance: [
    { id: "dup1", message: "Duplicate finance rows detected (Nov–Jan). Estimated revenue overstatement: ₹1.2Cr.", severity: "red", action: "Open Analyzer" },
    { id: "unbilled", message: "Unbilled amount ₹4.1Cr exceeds monthly target by ₹1.6Cr.", severity: "amber", action: "View Cashflow" },
  ],
  wfm: [
    { id: "hc1", message: "79 open requisitions are aged >60 days. Escalation action required.", severity: "red", action: "View Ageing" },
    { id: "gap1", message: "HC fill rate at 74% — 131 open gaps across active clients.", severity: "amber", action: "View Gaps" },
  ],
  client_manager: [
    { id: "sla1", message: "1 or more SLA metrics breached this month for your accounts.", severity: "amber", action: "View SLA" },
  ],
  ops: [
    { id: "ops1", message: "2 critical issues: Honeywell duplicate finance rows + Project ID mismatch (P11 vs P15).", severity: "red", action: "Resolve" },
    { id: "ops2", message: "ING-0089 completed with 18 warnings — review before next ingest.", severity: "amber", action: "View Log" },
  ],
};

export function AlertStrip() {
  const { persona } = usePersona();
  const alerts = PERSONA_ALERTS[persona.id] || [];
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = alerts.filter((a) => !dismissed.has(a.id));
  if (!visible.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "8px 20px 0" }}>
      {visible.map((a) => (
        <div key={a.id} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
          borderRadius: 6, fontSize: 11, border: "1px solid",
          background: a.severity === "red" ? "rgba(255,79,107,0.07)" : "rgba(255,179,71,0.07)",
          borderColor: a.severity === "red" ? "rgba(255,79,107,0.3)" : "rgba(255,179,71,0.3)",
          color: a.severity === "red" ? "var(--red)" : "var(--amber)",
        }}>
          <span style={{ flexShrink: 0 }}>{a.severity === "red" ? "🔴" : "⚠"}</span>
          <span style={{ flex: 1 }}>{a.message}</span>
          {a.action && (
            <button style={{
              background: "none", border: "none", cursor: "pointer", textDecoration: "underline",
              color: "inherit", fontSize: 10, fontFamily: "'DM Mono',monospace", whiteSpace: "nowrap",
            }}>{a.action} →</button>
          )}
          <button onClick={() => setDismissed((s) => new Set([...s, a.id]))}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: 13, lineHeight: 1 }}>✕</button>
        </div>
      ))}
    </div>
  );
}
