/** Grade value suggestion helpers - historical pct lookup is backend-only for scale; per-grade pct is not wired yet. */

export type GradeSuggestionDims = {
  vendor: boolean;
  brand: boolean;
  category: boolean;
};

export function avgPctOfRetail(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

/** Returns null per grade until a backend historical grade-value suggest API exists. */
export function lookupGradeSuggestions(
  _scale: string,
  grades: string[],
  _dims: GradeSuggestionDims,
  _item: { source?: string; brand?: string; category?: string },
): Record<string, number | null> {
  return Object.fromEntries(grades.map((grade) => [grade, null]));
}

export function suggestedValueFromPct(retail: number, pct: number): number {
  return Math.round(retail * (pct / 100) * 100) / 100;
}

export function pctFromValue(retail: number, value: number): number | null {
  if (retail <= 0 || value <= 0) return null;
  return Math.round((value / retail) * 100);
}
