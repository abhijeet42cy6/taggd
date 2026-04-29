import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { CeoSlideDeckConfig } from "@/lib/ceo-slide-deck/types";
import { parseCeoSlideDeck, resetCeoSlideDeck, saveCeoSlideDeck } from "@/lib/ceo-slide-deck/storage";
import { defaultCeoSlideDeck } from "@/lib/ceo-slide-deck/defaults";
import { ceoDeckAiApi } from "@/lib/api";
import { CeoDeckSlideViewer } from "@/components/ceo/CeoDeckSlideViewer";
import { SlideShowAgent, type SlideShowAgentMessage } from "@/components/slide-show-agent";
import { DeckSlideSelectionProvider, useDeckSlideSelection } from "@/components/ceo/DeckSlideSelectionContext";
import "@/styles/deck-studio.css";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: CeoSlideDeckConfig;
  onApply: (next: CeoSlideDeckConfig) => void;
};

function DeckStudioInner({ open, onOpenChange, config, onApply }: Props) {
  const ctx = useDeckSlideSelection();
  if (!ctx) throw new Error("DeckStudioInner requires DeckSlideSelectionProvider");
  const { selectedPaths, pathLabels, togglePath, clearPaths, setPickMode } = ctx;

  const [deckText, setDeckText] = useState(() => JSON.stringify(config, null, 2));
  const lastValidRef = useRef<CeoSlideDeckConfig>(config);
  const [slideIndex, setSlideIndex] = useState(0);
  const [messages, setMessages] = useState<SlideShowAgentMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const parsed = useMemo(() => parseCeoSlideDeck(deckText), [deckText]);
  useEffect(() => {
    if (parsed) lastValidRef.current = parsed;
  }, [parsed]);

  const viewerConfig = parsed ?? lastValidRef.current;

  useEffect(() => {
    if (!open) return;
    setDeckText(JSON.stringify(config, null, 2));
    lastValidRef.current = config;
    setSlideIndex(0);
    setMessages([]);
    setAiError(null);
    setSaveError(null);
    setAiLoading(false);
    setAdvancedOpen(false);
    clearPaths();
    setPickMode(false);
  }, [open, config, clearPaths, setPickMode]);

  const handleSave = useCallback(() => {
    const p = parseCeoSlideDeck(deckText);
    if (!p) {
      setSaveError("Invalid JSON or wrong version field. Fix in Advanced or use AI to repair.");
      return;
    }
    saveCeoSlideDeck(p);
    onApply(p);
    setSaveError(null);
    onOpenChange(false);
  }, [deckText, onApply, onOpenChange]);

  const handleReset = useCallback(() => {
    const d = resetCeoSlideDeck();
    setDeckText(JSON.stringify(d, null, 2));
    lastValidRef.current = d;
    onApply(d);
    setSaveError(null);
    clearPaths();
  }, [onApply, clearPaths]);

  const handleLoadDefaults = useCallback(() => {
    const d = defaultCeoSlideDeck();
    setDeckText(JSON.stringify(d, null, 2));
    lastValidRef.current = d;
    setSaveError(null);
    clearPaths();
  }, [clearPaths]);

  const handleDeckChat = useCallback(async (instruction: string) => {
    setAiError(null);
    setAiLoading(true);
    const focused = Array.from(selectedPaths);
    try {
      const { deck_json } = await ceoDeckAiApi.edit({
        current_json: deckText,
        instruction,
        focus_paths: focused.length ? focused : undefined,
      });
      const next = parseCeoSlideDeck(deck_json);
      if (!next) {
        setAiError("AI returned JSON that does not match deck version 1. Try again or edit under Advanced.");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "I could not apply that change — the result was not valid deck JSON.",
            error: true,
          },
        ]);
        return;
      }
      setDeckText(deck_json);
      lastValidRef.current = next;
      const targetNote =
        focused.length > 0
          ? `Applied to **${focused.length}** selected region(s): ${focused.map((p) => `\`${p}\``).join(", ")}.`
          : "Applied to the **full deck** (select regions on the slide with the pointer tool for smaller, safer edits).";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text:
            `${targetNote} Review the preview, then **Save** to store in this browser.`,
        },
      ]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg || "AI request failed");
      setMessages((prev) => [...prev, { role: "assistant", text: `Request failed: ${msg}`, error: true }]);
    } finally {
      setAiLoading(false);
    }
  }, [deckText, selectedPaths]);

  const onSend = useCallback(
    async (text: string) => {
      setMessages((prev) => [...prev, { role: "user", text }]);
      await handleDeckChat(text);
    },
    [handleDeckChat],
  );

  const onClearChat = useCallback(() => {
    setMessages([]);
    setAiError(null);
  }, []);

  return (
    <>
      <DialogHeader className="flex shrink-0 flex-col gap-2 border-b border-[var(--border)] px-5 py-4">
        <DialogTitle className="font-[Syne,sans-serif] text-lg">Board deck studio</DialogTitle>
        <DialogDescription>
          Toggle the <strong>pointer</strong> tool, then click slide regions to scope the assistant. Scoped runs send only those JSON branches to the model (requires{" "}
          <code className="rounded bg-[var(--surface-muted)] px-1">GEMINI_API_KEY</code>).
        </DialogDescription>
      </DialogHeader>

      {selectedPaths.size > 0 ? (
        <div className="deck-studio__targets shrink-0 border-b border-[var(--border)] px-5 py-2">
          <div className="deck-studio__targetsRow">
            <span className="deck-studio__targetsLabel">Assistant scope</span>
            <button type="button" className="deck-studio__targetsClear" onClick={() => clearPaths()}>
              Clear all
            </button>
          </div>
          <div className="deck-studio__chipRow">
            {Array.from(selectedPaths).map((p) => (
              <button
                key={p}
                type="button"
                className="deck-studio__chip"
                title={p}
                onClick={() => togglePath(p)}
              >
                <span>{pathLabels.get(p) ?? p}</span>
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="deck-studio__split min-h-0 flex-1">
        <CeoDeckSlideViewer config={viewerConfig} slideIndex={slideIndex} onSlideIndexChange={setSlideIndex} />
        <div className="deck-studio__agentWrap min-h-0">
          <SlideShowAgent
            welcomeTitle="Tell me what to change."
            welcomeHint={
              selectedPaths.size > 0
                ? `${selectedPaths.size} slide region(s) are in scope. Ask for copy or number updates — only those JSON paths are sent to the model.`
                : "Optional: use the pointer on the slides to tag chart blocks or callouts — otherwise edits apply to the full deck JSON."
            }
            composerPlaceholder="e.g. “Raise FY26E revenue bars by 10%” or “Shorten callout wording”"
            messages={messages}
            loading={aiLoading}
            onSend={onSend}
            onClear={onClearChat}
            composerDisabled={false}
          />
        </div>
      </div>

      {aiError ? (
        <p
          className="shrink-0 border-b border-[var(--border)] px-5 py-2 text-[12px]"
          style={{
            background: "color-mix(in srgb, var(--red) 8%, var(--surface-page))",
            color: "var(--red)",
          }}
        >
          {aiError}
        </p>
      ) : null}
      {!parsed ? (
        <p className="shrink-0 border-b border-[var(--border)] px-5 py-2 text-[12px]" style={{ color: "var(--accent)" }}>
          JSON is invalid — preview shows last good deck until fixed (Advanced or AI).
        </p>
      ) : null}

      <details
        className="shrink-0 border-b border-[var(--border)] bg-[var(--surface-muted)] px-5 py-2"
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
      >
        <summary className="cursor-pointer text-[13px] font-medium text-[var(--text-muted)]">Advanced: raw JSON</summary>
        <textarea
          className="mt-2 h-32 w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-page)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
          value={deckText}
          onChange={(e) => setDeckText(e.target.value)}
          spellCheck={false}
          aria-label="Deck JSON"
        />
        {saveError ? <p className="mt-1 text-[12px] text-[var(--red)]">{saveError}</p> : null}
      </details>

      <DialogFooter className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4">
        <Button type="button" variant="outline" className="border-[var(--border)]" onClick={handleLoadDefaults}>
          Load defaults (preview)
        </Button>
        <Button type="button" variant="outline" className="border-[var(--border)]" onClick={handleReset}>
          Reset &amp; save
        </Button>
        <div className="flex-1" />
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" className="bg-[var(--accent)] text-[var(--text-on-accent)] hover:bg-[var(--accent-hover)]" onClick={handleSave}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

export function CeoSlideDeckStudio(props: Props) {
  const { open, onOpenChange } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="deck-studio flex h-[min(92vh,920px)] w-[min(96vw,1440px)] max-w-[96vw] !max-w-none flex-col gap-0 overflow-hidden bg-[var(--surface-page)] p-0 ring-[var(--border)] sm:!max-w-[96vw]"
      >
        <DeckSlideSelectionProvider>
          <DeckStudioInner {...props} />
        </DeckSlideSelectionProvider>
      </DialogContent>
    </Dialog>
  );
}
