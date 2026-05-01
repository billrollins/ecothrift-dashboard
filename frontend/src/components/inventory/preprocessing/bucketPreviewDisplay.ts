/** Shared display helpers for compact JSON preview cells (formula mappings + formula preview grid). */

export function prettifyJsonTooltip(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

export function truncateJsonOneLine(s: string, max = 80): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function jsonCellLooksLikeCompactJson(cell: string): boolean {
  const t = (cell ?? '').trim();
  if (!t.startsWith('{') || t.startsWith('⚠')) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}
