/**
 * Near-full-screen studio: pager + thumbnails + scaled single-slide viewport.
 */
import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CeoSlideDeckConfig } from "@/lib/ceo-slide-deck/types";
import {
  CEO_DECK_SLIDE_COUNT,
  CeoDeckSingleSlide,
  ceoDeckSlideTitle,
  CEO_DECK_SLIDE_REFS,
} from "@/components/ceo/CeoBoardSlides";
import { useDeckSlideSelection } from "@/components/ceo/DeckSlideSelectionContext";
import { MousePointer2 } from "lucide-react";
import "@/styles/deck-studio.css";

type Props = {
  config: CeoSlideDeckConfig;
  /** Controlled slide index */
  slideIndex: number;
  onSlideIndexChange: (idx: number) => void;
};

export function CeoDeckSlideViewer({ config, slideIndex, onSlideIndexChange }: Props) {
  const sel = useDeckSlideSelection();
  const viewportRef = useRef<HTMLDivElement>(null);
  const scaleWrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const clamped = Math.min(Math.max(slideIndex, 0), CEO_DECK_SLIDE_COUNT - 1);

  const recalc = useCallback(() => {
    const vp = viewportRef.current;
    const inner = scaleWrapRef.current;
    if (!vp || !inner) return;
    const pad = 20;
    const pw = vp.clientWidth - pad;
    const ph = vp.clientHeight - pad;
    const iw = inner.scrollWidth || 720;
    const ih = inner.scrollHeight || 400;
    const sx = pw / iw;
    const sy = ph / ih;
    setScale(Math.min(1, Math.min(sx, sy)));
  }, []);

  useLayoutEffect(() => {
    recalc();
    const vp = viewportRef.current;
    const inner = scaleWrapRef.current;
    if (!vp || !inner) return;
    const ro = new ResizeObserver(() => recalc());
    ro.observe(vp);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [recalc, config, clamped]);

  const thumbs = useMemo(
    () => Array.from({ length: CEO_DECK_SLIDE_COUNT }, (_, i) => ({ i, ref: CEO_DECK_SLIDE_REFS[i], label: ceoDeckSlideTitle(config, i) })),
    [config],
  );

  const goto = useCallback((i: number) => {
    const n = Math.min(Math.max(i, 0), CEO_DECK_SLIDE_COUNT - 1);
    onSlideIndexChange(n);
  }, [onSlideIndexChange]);

  return (
    <div
      className="deck-studio__slides"
      role="region"
      aria-label="Slide preview"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          goto(clamped - 1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          goto(clamped + 1);
        }
      }}
    >
      <div className="deck-studio__slideToolbar">
        <div className="deck-studio__nav">
          <button
            type="button"
            className="deck-studio__navBtn"
            aria-label="Previous slide"
            disabled={clamped <= 0}
            onClick={() => goto(clamped - 1)}
          >
            ← Prev
          </button>
          <span className="deck-studio__slideLabel" title={ceoDeckSlideTitle(config, clamped)}>
            {clamped + 1}/{CEO_DECK_SLIDE_COUNT} · {ceoDeckSlideTitle(config, clamped)}
          </span>
          <button
            type="button"
            className="deck-studio__navBtn"
            aria-label="Next slide"
            disabled={clamped >= CEO_DECK_SLIDE_COUNT - 1}
            onClick={() => goto(clamped + 1)}
          >
            Next →
          </button>
        </div>
        {sel ? (
          <button
            type="button"
            className={`deck-studio__pickBtn${sel.pickMode ? " deck-studio__pickBtn--active" : ""}`}
            title="Select slide regions — hover highlights, click to add or remove from assistant scope"
            aria-label="Pick regions on slide"
            aria-pressed={sel.pickMode}
            onClick={() => sel.setPickMode(!sel.pickMode)}
          >
            <MousePointer2 size={18} aria-hidden strokeWidth={1.85} />
            <span>Pick regions</span>
          </button>
        ) : null}
      </div>
      <div className="deck-studio__thumbstrip" aria-label="Jump to slide">
        {thumbs.map((t) => (
          <button
            key={t.ref}
            type="button"
            title={t.label}
            className={`deck-studio__thumbBtn${t.i === clamped ? " deck-studio__thumbBtn--active" : ""}`}
            onClick={() => goto(t.i)}
          >
            <span>{t.i + 1}</span>
            {' · '}
            {t.label}
          </button>
        ))}
      </div>
      <div className="deck-studio__viewport" ref={viewportRef}>
        <div className="deck-studio__viewportInner">
          <div
            ref={scaleWrapRef}
            className="deck-studio__scaleWrap"
            style={{ transform: `scale(${scale})` }}
          >
            <div className="ceo-board-slides" style={{ gap: 0 }}>
              <CeoDeckSingleSlide config={config} index={clamped} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
