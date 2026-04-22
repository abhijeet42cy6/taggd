import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CeoSlideDeckConfig } from "@/lib/ceo-slide-deck/types";
import { parseCeoSlideDeck, resetCeoSlideDeck, saveCeoSlideDeck } from "@/lib/ceo-slide-deck/storage";
import { defaultCeoSlideDeck } from "@/lib/ceo-slide-deck/defaults";
import { ceoDeckAiApi } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: CeoSlideDeckConfig;
  onApply: (next: CeoSlideDeckConfig) => void;
};

export function CeoSlideDeckEditor({ open, onOpenChange, config, onApply }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setText(JSON.stringify(config, null, 2));
      setError(null);
      setAiError(null);
      setAiInstruction("");
    }
  }, [open, config]);

  function handleSave() {
    const parsed = parseCeoSlideDeck(text);
    if (!parsed) {
      setError("Invalid JSON or wrong version field.");
      return;
    }
    saveCeoSlideDeck(parsed);
    onApply(parsed);
    setError(null);
    onOpenChange(false);
  }

  function handleReset() {
    const d = resetCeoSlideDeck();
    setText(JSON.stringify(d, null, 2));
    onApply(d);
    setError(null);
  }

  function handleLoadDefaults() {
    const d = defaultCeoSlideDeck();
    setText(JSON.stringify(d, null, 2));
    setError(null);
  }

  async function handleAiApply() {
    const instruction = aiInstruction.trim();
    if (!instruction) return;
    setAiLoading(true);
    setAiError(null);
    setError(null);
    try {
      const { deck_json } = await ceoDeckAiApi.edit({
        current_json: text,
        instruction,
      });
      const parsed = parseCeoSlideDeck(deck_json);
      if (!parsed) {
        setAiError("AI returned JSON that does not match deck version 1. Edit manually or try again.");
        return;
      }
      setText(deck_json);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg || "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-[min(52rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-[var(--border)] px-5 py-4">
          <DialogTitle className="font-[Syne,sans-serif] text-lg">Edit board deck</DialogTitle>
          <DialogDescription>
            JSON configuration for all narrative slides. Save applies to this browser; Reset restores slide defaults.
            Use the AI line below to describe edits — the model updates the JSON in the editor; you still choose Save when
            happy. Requires <code className="rounded bg-[var(--surface-muted)] px-1">GEMINI_API_KEY</code> on the API
            server.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden px-5 py-3">
          <textarea
            className="h-[min(55vh,480px)] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface-page)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            aria-label="Deck JSON"
          />
          {error ? <p className="mt-2 text-[12px] text-[var(--red)]">{error}</p> : null}
          <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
            <label htmlFor="ceo-deck-ai-instruction" className="text-[12px] font-medium text-[var(--text-muted)]">
              AI assistant — describe changes to apply to the JSON above
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                id="ceo-deck-ai-instruction"
                className="border-[var(--border)] bg-[var(--surface-page)] text-[13px] sm:flex-1"
                placeholder='e.g. "Set FY26E total revenue to 11000" or "Shorten land & expand body to two sentences"'
                value={aiInstruction}
                onChange={(e) => setAiInstruction(e.target.value)}
                disabled={aiLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void handleAiApply();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 border-[var(--border)]"
                disabled={aiLoading || !aiInstruction.trim()}
                onClick={() => void handleAiApply()}
              >
                {aiLoading ? "Applying…" : "Apply with AI"}
              </Button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">Tip: ⌘/Ctrl + Enter in the instruction field runs Apply with AI.</p>
            {aiError ? <p className="text-[12px] text-[var(--red)]">{aiError}</p> : null}
          </div>
        </div>
        <DialogFooter className="flex flex-wrap gap-2 border-t border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4">
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
      </DialogContent>
    </Dialog>
  );
}
