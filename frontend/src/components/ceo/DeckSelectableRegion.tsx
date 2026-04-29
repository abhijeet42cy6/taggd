import React from "react";
import "@/styles/deck-selectable.css";
import { useDeckSlideSelection } from "@/components/ceo/DeckSlideSelectionContext";

type Props = {
  /** Matches key path on CeoSlideDeckConfig, e.g. "financialPerformance.metricCards" */
  deckPath: string;
  /** Short chip label shown in studio */
  label: string;
  children: React.ReactNode;
};

export function DeckSelectableRegion({ deckPath, label, children }: Props) {
  const sel = useDeckSlideSelection();

  if (!sel?.pickMode) {
    return <>{children}</>;
  }

  const selected = sel.selectedPaths.has(deckPath);
  const hovered = sel.lastHoverPath === deckPath;

  return (
    <div
      role="button"
      tabIndex={0}
      className={
        "deck-region" +
        (selected ? " deck-region--picked" : "") +
        (hovered ? " deck-region--hover" : "")
      }
      aria-pressed={selected}
      aria-label={label}
      data-deck-path={deckPath}
      onMouseEnter={() => sel.setHoverDeckPath(deckPath)}
      onMouseLeave={() => sel.setHoverDeckPath(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          sel.togglePath(deckPath, label);
        }
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        sel.togglePath(deckPath, label);
      }}
    >
      {children}
    </div>
  );
}
