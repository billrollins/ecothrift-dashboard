/** Dollars for the AI settings tables: cents for a dollar or more, more digits below a cent. */
export function usd(value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0';
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toPrecision(2)}`;
}

/** A plain number without trailing zeros ("2.0000" -> "2"), or a dash. */
export function plain(value: string | null | undefined, digits = 1): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? String(Number(n.toFixed(digits))) : '—';
}

export function timeOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** A release date as "Nov 2026" (the full day is the tooltip), or a dash. */
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '\u2014' : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
