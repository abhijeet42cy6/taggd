import React, { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { clearAgentSession, sendAgentMessage, type ToolCall } from "@/lib/agent-api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "@/styles/agent-page.css";

type UiMessage = {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
  error?: boolean;
};

function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="agent-markdown" style={{ lineHeight: 1.45 }}>
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
                  fontFamily: "var(--mono)",
                  fontSize: 11.5,
                }}
              >
                {children}
              </code>
            ) : (
              <code style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>{children}</code>
            ),
          pre: ({ children }) => (
            <pre
              style={{
                margin: "8px 0",
                padding: "10px 12px",
                background: "rgba(25, 24, 23, 0.85)",
                color: "#f0ede8",
                border: "1px solid var(--border2)",
                borderRadius: "var(--radius-base)",
                overflowX: "auto",
              }}
            >
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div style={{ overflowX: "auto", margin: "6px 0" }}>
              <table
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  minWidth: 360,
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
                background: "var(--accent-soft)",
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
                color: "var(--text-muted)",
                verticalAlign: "top",
              }}
            >
              {children}
            </td>
          ),
          blockquote: ({ children }) => (
            <blockquote
              style={{
                margin: "6px 0",
                padding: "6px 10px",
                borderLeft: "3px solid var(--accent-mid)",
                background: "var(--accent-soft)",
                color: "var(--text-muted)",
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
  const [threadAnim, setThreadAnim] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const chatMode = messages.length > 0;

  useEffect(() => {
    if (!chatMode) {
      setThreadAnim(false);
      return;
    }
    setThreadAnim(true);
    const id = window.setTimeout(() => setThreadAnim(false), 420);
    return () => window.clearTimeout(id);
  }, [chatMode]);

  useEffect(() => {
    if (!chatMode) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, chatMode]);

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
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `Request failed: ${err?.response?.data?.detail || err?.message || "Unknown error"}`,
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    if (sessionId) await clearAgentSession(sessionId);
    setSessionId(null);
    setMessages([]);
    setInput("");
  };

  const composer = (variant: "hero" | "dock") => (
    <footer className={`agent-page__composer agent-page__composer--${variant}`}>
      <div className="agent-page__composer-inner">
        <div className="agent-page__composer-field">
          <textarea
            className="agent-page__textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="Ask about a client, metric, requisition, or org overview…"
            rows={2}
            aria-label="Message"
          />
          <button
            type="button"
            className="agent-page__send"
            disabled={loading}
            aria-label="Send message"
            onClick={() => void send(input)}
          >
            <ArrowUp strokeWidth={2.25} size={18} aria-hidden />
          </button>
        </div>
      </div>
    </footer>
  );

  return (
    <div className="agent-page">
      <button type="button" className="agent-page__clear" onClick={() => void clear()}>
        Clear chat
      </button>

      {!chatMode ? (
        <div className="agent-page__stage agent-page__stage--empty">
          <div className="agent-page__emptyShell">
            <div className="agent-page__hero">
              <p className="agent-page__tagline">Let&apos;s go! Tagger!</p>
              <p className="agent-page__hint">
                Ask me anything across clients, requisitions, SLA, WFM and finance — I&apos;m grounded on your live data.
              </p>
            </div>
            {composer("hero")}
          </div>
        </div>
      ) : (
        <>
          <div className="agent-page__stage agent-page__stage--chat">
            <div className={`agent-page__thread${threadAnim ? " agent-page__thread--animate" : ""}`}>
              <div className="agent-page__thread-inner">
                {messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={`agent-page__bubble agent-page__bubble--${
                      m.role === "user" ? "user" : m.error ? "error" : "assistant"
                    }`}
                  >
                    {m.toolCalls?.length ? (
                      <div className="agent-page__tools">
                        {m.toolCalls.map((t, idx) => (
                          <span key={`${t.tool}-${idx}`} className="agent-page__tool-chip">
                            {t.tool}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {m.role === "assistant" ? <MarkdownMessage text={m.text} /> : m.text}
                  </div>
                ))}
                {loading ? <div className="agent-page__thinking">Thinking…</div> : null}
                <div ref={bottomRef} />
              </div>
            </div>
          </div>
          {composer("dock")}
        </>
      )}
    </div>
  );
}
