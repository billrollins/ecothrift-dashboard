/** Days as staff say them: "today", "1 day", "12 days". */
export function daysText(days: number | null | undefined): string {
  if (days == null || !Number.isFinite(days)) return '-';
  if (days < 1) return 'today';
  const whole = Math.floor(days);
  return `${whole} day${whole === 1 ? '' : 's'}`;
}

/** Amber past two weeks, red past a month: how long an item has been in restoration. */
export function ageTone(days: number | null | undefined): 'default' | 'warning' | 'error' {
  if (days == null) return 'default';
  if (days > 30) return 'error';
  if (days > 14) return 'warning';
  return 'default';
}
