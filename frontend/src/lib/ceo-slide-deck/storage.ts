import { CEO_SLIDE_DECK_STORAGE_KEY, CEO_SLIDE_DECK_VERSION, type CeoSlideDeckConfig } from "./types";
import { defaultCeoSlideDeck } from "./defaults";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function parseCeoSlideDeck(json: string): CeoSlideDeckConfig | null {
  try {
    const v = JSON.parse(json) as unknown;
    if (!isRecord(v) || v.version !== CEO_SLIDE_DECK_VERSION) return null;
    return v as CeoSlideDeckConfig;
  } catch {
    return null;
  }
}

export function loadCeoSlideDeck(): CeoSlideDeckConfig {
  if (typeof window === "undefined") return defaultCeoSlideDeck();
  try {
    const raw = localStorage.getItem(CEO_SLIDE_DECK_STORAGE_KEY);
    if (!raw) return defaultCeoSlideDeck();
    const parsed = parseCeoSlideDeck(raw);
    return parsed ?? defaultCeoSlideDeck();
  } catch {
    return defaultCeoSlideDeck();
  }
}

export function saveCeoSlideDeck(config: CeoSlideDeckConfig): void {
  try {
    localStorage.setItem(CEO_SLIDE_DECK_STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota */
  }
}

export function resetCeoSlideDeck(): CeoSlideDeckConfig {
  const d = defaultCeoSlideDeck();
  saveCeoSlideDeck(d);
  return d;
}
