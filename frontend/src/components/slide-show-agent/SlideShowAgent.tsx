/**
 * Presentation-only conversational shell (Tagger-style).
 * Wired by parent — e.g. deck studio calls Gemini `/ceo-deck/ai-edit` per turn.
 */
import React, { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import type { ToolCall } from "@/lib/agent-api";
import { AgentMarkdownMessage } from "@/components/AgentMarkdownMessage";
import "@/styles/agent-page.css";

export type SlideShowAgentMessage = {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
  error?: boolean;
};

export type SlideShowAgentProps = {
  welcomeTitle: string;
  welcomeHint: string;
  composerPlaceholder?: string;
  messages: SlideShowAgentMessage[];
  loading: boolean;
  onSend: (text: string) => void | Promise<void>;
  onClear: () => void;
  composerDisabled?: boolean;
  disabled?: boolean;
};

export function SlideShowAgent({
  welcomeTitle,
  welcomeHint,
  composerPlaceholder = "Describe how to tune the slides…",
  messages,
  loading,
  onSend,
  onClear,
  composerDisabled = false,
  disabled = false,
}: SlideShowAgentProps) {
  const [input, setInput] = useState("");
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

  const send = () => {
    const payload = input.trim();
    if (!payload || loading || disabled) return;
    void onSend(payload);
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
                send();
              }
            }}
            placeholder={composerPlaceholder}
            rows={2}
            aria-label="Deck assistant message"
            disabled={composerDisabled || disabled || loading}
          />
          <button
            type="button"
            className="agent-page__send"
            disabled={loading || disabled || composerDisabled || !input.trim()}
            aria-label="Send"
            onClick={() => send()}
          >
            <ArrowUp strokeWidth={2.25} size={18} aria-hidden />
          </button>
        </div>
      </div>
    </footer>
  );

  return (
    <div className="agent-page slide-show-agent slide-show-agent--embedded" style={{ height: "100%" }}>
      <button
        type="button"
        className="agent-page__clear"
        onClick={onClear}
        disabled={disabled || (!messages.length && !input.trim())}
      >
        Clear chat
      </button>

      {!chatMode ? (
        <div className="agent-page__stage agent-page__stage--empty">
          <div className="agent-page__emptyShell">
            <div className="agent-page__hero">
              <p className="agent-page__tagline">{welcomeTitle}</p>
              <p className="agent-page__hint">{welcomeHint}</p>
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
                    {m.role === "assistant" ? <AgentMarkdownMessage text={m.text} /> : m.text}
                  </div>
                ))}
                {loading ? <div className="agent-page__thinking">Updating deck…</div> : null}
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
