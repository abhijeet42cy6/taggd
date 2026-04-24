import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  sendAgentMessage,
  clearAgentSession,
  type AgentMessage,
  type ToolCall,
} from "@/lib/agent-api";

// ─── Tool label map ─────────────────────────────────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  resolve_client: "Looking up client",
  get_project_summary: "Fetching project summary",
  search_records: "Searching requisitions",
  get_record_by_id: "Fetching record",
  aggregate_records: "Aggregating KPIs",
  get_sla_metrics: "Fetching SLA data",
  get_wfm_snapshot: "Fetching WFM snapshot",
  get_finance_ledger: "Fetching finance ledger",
  get_budget_forecast: "Fetching budget & forecast",
  portfolio_overview: "Fetching portfolio overview",
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolCalls?: ToolCall[];
  loading?: boolean;
  error?: boolean;
}

// ─── Markdown-ish renderer (minimal, no lib dependency) ──────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;
  let inCodeBlock = false;
  let codeLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLines = [];
      } else {
        inCodeBlock = false;
        nodes.push(
          <pre key={key++} style={{
            background: "var(--surface-muted)", borderRadius: 6,
            padding: "8px 10px", fontSize: 11, overflowX: "auto",
            border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)", margin: "4px 0",
            fontFamily: "'DM Mono',monospace", color: "var(--text)",
          }}>
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
      }
      continue;
    }
    if (inCodeBlock) { codeLines.push(line); continue; }

    // Headings
    if (line.startsWith("### ")) {
      nodes.push(<div key={key++} style={{ fontWeight: 700, fontSize: 12, color: "var(--accent)", marginTop: 8 }}>{line.slice(4)}</div>);
    } else if (line.startsWith("## ")) {
      nodes.push(<div key={key++} style={{ fontWeight: 700, fontSize: 13, color: "var(--accent2)", marginTop: 10 }}>{line.slice(3)}</div>);
    } else if (line.startsWith("# ")) {
      nodes.push(<div key={key++} style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginTop: 12 }}>{line.slice(2)}</div>);
    }
    // Bullet points
    else if (line.startsWith("- ") || line.startsWith("* ")) {
      nodes.push(
        <div key={key++} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginLeft: 4, marginTop: 2 }}>
          <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }}>·</span>
          <span>{inlineMarkdown(line.slice(2))}</span>
        </div>
      );
    }
    // Table rows (| cell | cell |)
    else if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.split("|").filter((_, ci) => ci > 0 && ci < line.split("|").length - 1);
      const isSep = cells.every(c => c.trim().match(/^-+$/));
      if (!isSep) {
        nodes.push(
          <div key={key++} style={{ display: "flex", gap: 0, fontSize: 11, borderBottom: "1px solid color-mix(in srgb, var(--accent) 10%, transparent)" }}>
            {cells.map((cell, ci) => (
              <div key={ci} style={{ flex: 1, padding: "3px 6px", color: ci === 0 ? "var(--text-subtle)" : "var(--text)" }}>
                {inlineMarkdown(cell.trim())}
              </div>
            ))}
          </div>
        );
      }
    }
    // Bold lines (e.g. **label**)
    else if (line.trim() === "") {
      nodes.push(<div key={key++} style={{ height: 4 }} />);
    } else {
      nodes.push(<div key={key++} style={{ marginTop: 1, lineHeight: 1.55 }}>{inlineMarkdown(line)}</div>);
    }
  }
  return nodes;
}

function inlineMarkdown(text: string): React.ReactNode {
  // Bold **...**
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "var(--text)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", borderRadius: 3, padding: "0 4px", fontSize: 10.5, fontFamily: "'DM Mono',monospace", color: "var(--accent2)" }}>{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

// ─── Tool badge ───────────────────────────────────────────────────────────────
function ToolBadges({ toolCalls }: { toolCalls: ToolCall[] }) {
  if (!toolCalls.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
      {toolCalls.map((tc, i) => (
        <span key={i} style={{
          fontSize: 9.5, padding: "2px 7px", borderRadius: 12,
          background: "color-mix(in srgb, var(--accent) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
          color: "var(--accent)", fontFamily: "'DM Mono',monospace",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span style={{ opacity: 0.6 }}>⬡</span>
          {TOOL_LABELS[tc.tool] || tc.tool}
        </span>
      ))}
    </div>
  );
}

// ─── Thinking dots ────────────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", padding: "4px 0" }}>
      {[0, 1, 2].map(i => (
        <div key={i} className="agent-dot" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
      <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginLeft: 4, fontFamily: "'DM Mono',monospace" }}>thinking…</span>
    </div>
  );
}

// ─── Suggestion chips ────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Give me a portfolio overview",
  "How is Honeywell performing?",
  "Show revenue breakdown by client",
  "Which clients have SLA breaches?",
  "What's the total fill rate?",
  "Top 5 clients by revenue",
];

// ─── Main component ───────────────────────────────────────────────────────────
export function AgentChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 120);
  }, [open]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: DisplayMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
    };
    const placeholderId = Date.now().toString() + "_loading";
    const placeholder: DisplayMessage = {
      id: placeholderId,
      role: "assistant",
      content: "",
      loading: true,
    };
    setMessages(prev => [...prev, userMsg, placeholder]);
    setInput("");
    setLoading(true);

    try {
      const result = await sendAgentMessage(text.trim(), sessionId);
      setSessionId(result.session_id);

      setMessages(prev =>
        prev.map(m =>
          m.id === placeholderId
            ? {
                id: placeholderId,
                role: "assistant",
                content: result.response,
                toolCalls: result.tool_calls,
                loading: false,
              }
            : m
        )
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Network error";
      setMessages(prev =>
        prev.map(m =>
          m.id === placeholderId
            ? {
                id: placeholderId,
                role: "assistant",
                content: `⚠ ${errorMsg}`,
                loading: false,
                error: true,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const handleClear = async () => {
    if (sessionId) {
      try { await clearAgentSession(sessionId); } catch { /* ok */ }
    }
    setMessages([]);
    setSessionId(null);
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* ── FLOATING BUTTON ───────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Taggy — Taggd intelligence (Aparatus)"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9000,
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          background: open
            ? "linear-gradient(135deg,var(--accent),var(--accent2))"
            : "linear-gradient(135deg,var(--surface-muted),var(--surface-sunken))",
          boxShadow: open
            ? "0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent), 0 8px 28px rgba(15,23,42,0.12)"
            : "0 0 0 1px color-mix(in srgb, var(--accent) 22%, transparent), 0 6px 20px rgba(15,23,42,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.25s ease",
          flexShrink: 0,
        }}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 5L15 15M15 5L5 15" stroke="var(--accent-foreground)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.477 2 2 6.254 2 11.5c0 2.04.655 3.93 1.757 5.483L2.5 21l4.355-1.18A10.023 10.023 0 0 0 12 21c5.523 0 10-4.254 10-9.5S17.523 2 12 2Z"
              fill="color-mix(in srgb, var(--accent) 35%, transparent)" stroke="var(--accent)" strokeWidth="1.5" />
            <circle cx="8.5" cy="11.5" r="1.2" fill="var(--accent)" />
            <circle cx="12" cy="11.5" r="1.2" fill="var(--accent)" />
            <circle cx="15.5" cy="11.5" r="1.2" fill="var(--accent)" />
          </svg>
        )}
        {/* Pulse badge when closed and has messages */}
        {!open && messages.length > 0 && (
          <div style={{
            position: "absolute", top: 4, right: 4,
            width: 10, height: 10, borderRadius: "50%",
            background: "var(--green)",
            border: "2px solid var(--surface-page)",
          }} />
        )}
      </button>

      {/* ── CHAT PANEL ────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 86,
          right: 24,
          zIndex: 8999,
          width: 420,
          maxWidth: "calc(100vw - 48px)",
          height: 580,
          maxHeight: "calc(100vh - 120px)",
          background: "var(--surface-raised)",
          border: "1px solid var(--border2)",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(15,23,42,0.12), 0 0 0 1px color-mix(in srgb, var(--accent) 8%, transparent)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "agentSlideUp 0.2s ease",
        }}>

          {/* Header */}
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
            background: "var(--accent-soft)",
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: "linear-gradient(135deg,var(--accent),var(--accent2))",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14,
            }}>◈</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", fontFamily: "'Syne',sans-serif" }}>
                Taggy
              </div>
              <div style={{ fontSize: 9.5, color: "var(--green)", fontFamily: "'DM Mono',monospace" }}>
                ● Taggd intelligence — powered by Aparatus · Live DB
              </div>
            </div>
            {messages.length > 0 && (
              <button
                onClick={handleClear}
                title="Clear conversation"
                style={{
                  background: "none", border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
                  color: "var(--text-muted)", borderRadius: 6, cursor: "pointer",
                  fontSize: 9.5, padding: "3px 8px", fontFamily: "'DM Mono',monospace",
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Messages area */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}>
            {isEmpty ? (
              <div style={{ paddingTop: 16 }}>
                {/* Welcome */}
                <div style={{
                  textAlign: "center", marginBottom: 20,
                  padding: "16px",
                  background: "color-mix(in srgb, var(--accent) 6%, transparent)",
                  borderRadius: 10,
                  border: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)",
                }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>◈</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                    Ask me anything
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--text-subtle)", lineHeight: 1.5 }}>
                    I have full access to your database — clients, requisitions, finance, SLA, and WFM data. All answers are grounded in real data.
                  </div>
                </div>

                {/* Suggestion chips */}
                <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono',monospace", marginBottom: 8 }}>
                  SUGGESTED QUERIES
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      style={{
                        textAlign: "left",
                        background: "color-mix(in srgb, var(--accent) 6%, transparent)",
                        border: "1px solid color-mix(in srgb, var(--accent) 15%, transparent)",
                        borderRadius: 8,
                        padding: "8px 12px",
                        color: "var(--text-subtle)",
                        fontSize: 12,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        fontFamily: "inherit",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "color-mix(in srgb, var(--accent) 40%, transparent)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--text)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "color-mix(in srgb, var(--accent) 15%, transparent)";
                        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-subtle)";
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id}>
                  {msg.role === "user" ? (
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <div style={{
                        maxWidth: "82%",
                        background: "linear-gradient(135deg,color-mix(in srgb, var(--accent) 20%, transparent),color-mix(in srgb, var(--accent) 10%, transparent))",
                        border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
                        borderRadius: "12px 12px 3px 12px",
                        padding: "9px 13px",
                        fontSize: 12.5,
                        color: "var(--text)",
                        lineHeight: 1.5,
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: "linear-gradient(135deg,var(--accent),var(--accent2))",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, marginTop: 2,
                      }}>◈</div>
                      <div style={{
                        flex: 1,
                        background: "var(--surface-muted)",
                        border: `1px solid ${msg.error ? "color-mix(in srgb, var(--red) 30%, transparent)" : "var(--border)"}`,
                        borderRadius: "3px 12px 12px 12px",
                        padding: "9px 13px",
                        fontSize: 12.5,
                        color: msg.error ? "var(--red)" : "var(--text-muted)",
                        lineHeight: 1.55,
                      }}>
                        {msg.loading ? (
                          <ThinkingDots />
                        ) : (
                          <>
                            {msg.toolCalls && msg.toolCalls.length > 0 && (
                              <ToolBadges toolCalls={msg.toolCalls} />
                            )}
                            <div style={{ fontSize: 12 }}>
                              {renderMarkdown(msg.content)}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div style={{
            padding: "10px 12px",
            borderTop: "1px solid color-mix(in srgb, var(--accent) 12%, transparent)",
            flexShrink: 0,
            background: "var(--surface-page)",
          }}>
            <div style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              background: "var(--surface-muted)",
              border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
              borderRadius: 10,
              padding: "8px 10px",
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask about clients, revenue, SLA, WFM…"
                rows={1}
                disabled={loading}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  outline: "none",
                  resize: "none",
                  color: "var(--text)",
                  fontSize: 12.5,
                  fontFamily: "inherit",
                  lineHeight: 1.5,
                  maxHeight: 96,
                  overflowY: "auto",
                  opacity: loading ? 0.5 : 1,
                }}
              />
              <button
                onClick={() => send(input)}
                disabled={loading || !input.trim()}
                style={{
                  flexShrink: 0,
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "none",
                  cursor: loading || !input.trim() ? "default" : "pointer",
                  background: loading || !input.trim()
                    ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                    : "linear-gradient(135deg,var(--accent),var(--accent2))",
                  color: "var(--accent-foreground)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  transition: "all 0.15s",
                }}
              >
                {loading ? (
                  <span style={{ fontSize: 10, animation: "spin 1s linear infinite", display: "inline-block" }}>↻</span>
                ) : "↑"}
              </button>
            </div>
            <div style={{ fontSize: 9.5, color: "var(--text-muted)", marginTop: 5, textAlign: "center", fontFamily: "'DM Mono',monospace" }}>
              Enter to send · Shift+Enter for new line
            </div>
          </div>
        </div>
      )}
    </>
  );
}
