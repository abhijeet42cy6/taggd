import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type DeckSlideSelectionValue = {
  pickMode: boolean;
  setPickMode: (on: boolean) => void;
  selectedPaths: Set<string>;
  pathLabels: ReadonlyMap<string, string>;
  togglePath: (dottedPath: string, humanLabel?: string) => void;
  clearPaths: () => void;
  lastHoverPath: string | null;
  setHoverDeckPath: (p: string | null) => void;
};

const Ctx = createContext<DeckSlideSelectionValue | null>(null);

export function DeckSlideSelectionProvider({ children }: { children: React.ReactNode }) {
  const [pickMode, setPickMode] = useState(false);
  const [paths, setPaths] = useState<Set<string>>(() => new Set());
  const [labels, setLabels] = useState<Map<string, string>>(() => new Map());
  const [lastHoverPath, setHoverDeckPath] = useState<string | null>(null);

  const togglePath = useCallback((dottedPath: string, humanLabel?: string) => {
    setPaths((prev) => {
      const next = new Set(prev);
      if (next.has(dottedPath)) next.delete(dottedPath);
      else next.add(dottedPath);
      return next;
    });
    if (humanLabel) {
      setLabels((m) => {
        const n = new Map(m);
        n.set(dottedPath, humanLabel);
        return n;
      });
    }
  }, []);

  const clearPaths = useCallback(() => setPaths(new Set()), []);

  const value = useMemo<DeckSlideSelectionValue>(
    () => ({
      pickMode,
      setPickMode,
      selectedPaths: paths,
      pathLabels: labels,
      togglePath,
      clearPaths,
      lastHoverPath,
      setHoverDeckPath,
    }),
    [pickMode, paths, labels, togglePath, clearPaths, lastHoverPath],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDeckSlideSelection(): DeckSlideSelectionValue | null {
  return useContext(Ctx);
}
