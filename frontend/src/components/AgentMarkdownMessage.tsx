/** Shared Markdown renderer used by Agent and SlideShowAgent chat bubbles. */
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AgentMarkdownMessage({ text }: { text: string }) {
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
