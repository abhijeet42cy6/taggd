/** Dot-path helpers for targeted deck edits (mirror backend merge semantics). */

function getAtPath(root: Record<string, unknown>, parts: string[]): unknown {
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Build nested object containing only copied values at dotted paths from `source`. */
export function fragmentForDeckPaths(source: Record<string, unknown>, dottedPaths: string[]): Record<string, unknown> {
  const frag: Record<string, unknown> = {};
  for (const dotted of dottedPaths) {
    const parts = dotted.split(".").filter(Boolean);
    if (parts.length === 0) continue;
    const val = getAtPath(source, parts);
    if (val === undefined) continue;
    insertPath(frag, parts, structuredCloneCompatible(val));
  }
  return frag;
}

function structuredCloneCompatible(val: unknown): unknown {
  return JSON.parse(JSON.stringify(val));
}

function insertPath(root: Record<string, unknown>, parts: string[], leaf: unknown): void {
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    let nxt = cur[p];
    if (nxt === undefined || typeof nxt !== "object" || Array.isArray(nxt) || nxt === null) {
      cur[p] = {};
      nxt = cur[p] as Record<string, unknown>;
    }
    cur = nxt as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  cur[last] = leaf as never;
}

function deepMergeBase<T extends Record<string, unknown>>(target: T, patch: Record<string, unknown>): T {
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const tv = target[k];
    if (pv !== null && typeof pv === "object" && !Array.isArray(pv) && tv !== null && typeof tv === "object" && !Array.isArray(tv)) {
      deepMergeBase(tv as Record<string, unknown>, pv as Record<string, unknown>);
    } else {
      (target as Record<string, unknown>)[k] = pv as never;
    }
  }
  return target;
}

/** Deep-merge fragment into clone of full deck. */
export function mergeDeckFragment(full: Record<string, unknown>, fragmentResponse: Record<string, unknown>): Record<string, unknown> {
  const out = structuredCloneCompatible(full) as Record<string, unknown>;
  deepMergeBase(out, fragmentResponse);
  return out;
}
