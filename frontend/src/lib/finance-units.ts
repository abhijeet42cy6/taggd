export function normalizeLacsValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const abs = Math.abs(value);
  // Rule requested: 1/2/3 digit finance values are in Lacs.
  if (abs <= 999) return value * 100000;
  return value;
}

export function normalizeMaybeNumeric(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return normalizeLacsValue(n);
}

/** Raw number from API (no Lacs heuristic) — use for headcounts, ratios, etc. */
export function normalizePlainNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n;
}

export function inrToCr(valueInr: number): number {
  return valueInr / 10000000;
}

export function formatInrCompact(valueInr: number): string {
  const abs = Math.abs(valueInr);
  if (abs >= 10000000) return `₹${inrToCr(valueInr).toFixed(1)}Cr`;
  if (abs >= 100000) return `₹${(valueInr / 100000).toFixed(1)}L`;
  return `₹${Math.round(valueInr).toLocaleString("en-IN")}`;
}

