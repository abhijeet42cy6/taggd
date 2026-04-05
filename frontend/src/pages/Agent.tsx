import React, { useRef, useState } from "react";
import { PageHeader, PlatformSection } from "@/components/platform/PlatformBlocks";
import { clearAgentSession, sendAgentMessage, type ToolCall } from "@/lib/agent-api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type UiMessage = {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
  error?: boolean;
};

function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="agent-markdown" style={{ lineHeight: 1.4 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 style={{ fontSize: 17, margin: "4px 0", color: "var(--text)" }}>{children}</h1>,
          h2: ({ children }) => <h2 style={{ fontSize: 15, margin: "4px 0", color: "var(--text)" }}>{children}</h2>,
          h3: ({ children }) => <h3 style={{ fontSize: 14, margin: "4px 0", color: "var(--text)" }}>{children}</h3>,
          p: ({ children }) => <p style={{ margin: "3px 0" }}>{children}</p>,
          ul: ({ children }) => <ul style={{ margin: "3px 0 3px 16px" }}>{children}</ul>,
          ol: ({ children }) => <ol style={{ margin: "3px 0 3px 16px" }}>{children}</ol>,
          li: ({ children }) => <li style={{ margin: "1px 0" }}>{children}</li>,
          strong: ({ children }) => <strong style={{ color: "var(--text)" }}>{children}</strong>,
          code: ({ className, children }) =>
            !className ? (
              <code
                style={{
                  background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                  border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
                  borderRadius: 5,
                  padding: "1px 5px",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11.5,
                }}
              >
                {children}
              </code>
            ) : (
              <code
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: 11.5,
                }}
              >
                {children}
              </code>
            ),
          pre: ({ children }) => (
            <pre
              style={{
                margin: "5px 0",
                padding: "10px 12px",
                background: "rgba(8,12,18,0.65)",
                border: "1px solid var(--border2)",
                borderRadius: 10,
                overflowX: "auto",
              }}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "5px 0" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  minWidth: 420,
                  fontSize: 12,
                }}
              >
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              style={{
                border: "1px solid var(--border2)",
                background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                padding: "6px 8px",
                textAlign: "left",
                color: "var(--text)",
              }}
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              style={{
                border: "1px solid var(--border)",
                padding: "6px 8px",
                color: "var(--text2)",
                verticalAlign: "top",
              }}
            >
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "4px 0",
                padding: "5px 8px",
                borderLeft: "3px solid rgba(79,143,255,0.5)",
                background: "color-mix(in srgb, var(--accent) 8%, transparent)",
                color: "var(--text2)",
              }}
            >
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function Agent() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const payload = text.trim();
    if (!payload || loading) return;
    setMessages((prev) => [...prev, { role: "user", text: payload }]);
    setInput("");
    setLoading(true);
    try {
      const res = await sendAgentMessage(payload, sessionId);
      setSessionId(res.session_id);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: res.response, toolCalls: res.tool_calls },
      ]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Request failed: ${e?.response?.data?.detail || e?.message || "Unknown error"}`, error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <PageHeader
        title="Agent"
        subtitle="Ask natural-language questions across clients, requisitions, SLA, WFM and finance"
      />

      <PlatformSection>
        <div
            style={{
              height: "calc(100vh - 260px)",
              minHeight: 520,
              maxHeight: 760,
              border: "1px solid var(--border)",
              borderRadius: 12,
              background: "linear-gradient(180deg, rgba(79,143,255,0.04), rgba(0,0,0,0.1))",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "10px 12px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text2)" }}>
                <span style={{ color: "var(--green)" }}>●</span> Live DB grounded responses
              </div>
              <button
                className="platform-chip"
                onClick={async () => {
                  if (sessionId) await clearAgentSession(sessionId);
                  setSessionId(null);
                  setMessages([]);
                }}
                style={{ cursor: "pointer" }}
              >
                Clear chat
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gap: 10 }}>
              {messages.length === 0 ? (
                <div style={{ color: "var(--text2)", fontSize: 13 }}>
                  Start by asking a portfolio or client-specific question.
                </div>
              ) : null}

              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  style={{
                    justifySelf: m.role === "user" ? "end" : "start",
                    maxWidth: "86%",
                    background:
                      m.role === "user"
                        ? "rgba(79,143,255,0.16)"
                        : m.error
                          ? "rgba(255,79,107,0.16)"
                          : "rgba(255,255,255,0.03)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    whiteSpace: "pre-wrap",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  {m.toolCalls?.length ? (
                    <div style={{ marginBottom: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {m.toolCalls.map((t, idx) => (
                        <span
                          key={`${t.tool}-${idx}`}
                          style={{
                            border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                            background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                            borderRadius: 20,
                            padding: "2px 8px",
                            fontFamily: "'DM Mono', monospace",
                            fontSize: 10,
                            color: "var(--accent)",
                          }}
                        >
                          {t.tool}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {m.role === "assistant" ? <MarkdownMessage text={m.text} /> : m.text}
                </div>
              ))}
              {loading ? (
                <div style={{ color: "var(--text2)", fontSize: 12, fontFamily: "'DM Mono', monospace" }}>
                  thinking...
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            <div style={{ borderTop: "1px solid var(--border)", padding: 10 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  placeholder="Ask about a client, metric, requisition, or org overview..."
                  style={{
                    width: "100%",
                    minHeight: 48,
                    maxHeight: 120,
                    resize: "vertical",
                    borderRadius: 10,
                    border: "1px solid var(--border2)",
                    background: "var(--bg2)",
                    color: "var(--text)",
                    padding: "10px 12px",
                    fontSize: 13,
                  }}
                />
                <button
                  className="platform-chip active"
                  onClick={() => void send(input)}
                  style={{ cursor: "pointer", alignSelf: "end", height: 36 }}
                  disabled={loading}
                >
                  Send
                </button>
              </div>
            </div>
        </div>
      </PlatformSection>
    </div>
  );
}

