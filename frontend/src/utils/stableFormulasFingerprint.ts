/** Stable string for comparing formula maps (sorted keys, trimmed values). */
export function stableFormulasFingerprint(formulas: Record<string, string>): string {
  const keys = Object.keys(formulas).sort();
  return keys.map((k) => `${k}:${(formulas[k] ?? '').trim()}`).join('\x1f');
}
