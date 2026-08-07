export function formatDashboardCurrency(value: string): string {
  const num = parseFloat(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(num) ? num : 0);
}

export function formatDashboardCurrencyExact(value: string): string {
  const num = parseFloat(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(num) ? num : 0);
}

export function parseDashboardAmount(value: string): number {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

export function shortDayLabel(day: string): string {
  return day.slice(0, 3);
}

export function formatDashboardCurrencyCompact(value: string): string {
  const num = parseFloat(value);
  const safe = Number.isFinite(num) ? num : 0;
  if (safe >= 100000) {
    return `$${Math.round(safe / 1000)}k`;
  }
  if (safe >= 10000) {
    return `$${(safe / 1000).toFixed(1).replace('.0', '')}k`;
  }
  if (safe >= 1000) {
    return `$${(safe / 1000).toFixed(1).replace('.0', '')}k`;
  }
  return `$${Math.round(safe)}`;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  if (!m || !d) return iso;
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

export function dayMonthTitle(day: string, iso: string): string {
  return `${shortDayLabel(day)} ${shortDate(iso)}`;
}

function ordinalDay(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** e.g. Friday June 6th, 2026 */
export function longDayTitle(dayName: string, iso: string): string {
  const formatted = formatIsoDateLong(iso);
  return dayName ? `${dayName} ${formatted}` : formatted;
}

export function formatIsoDateLong(iso: string): string {
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number.parseInt(yStr ?? '', 10);
  const m = Number.parseInt(mStr ?? '', 10);
  const d = Number.parseInt(dStr ?? '', 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso;
  const month = new Date(y, m - 1, d).toLocaleString('en-US', { month: 'long' });
  return `${month} ${ordinalDay(d)}, ${y}`;
}

export function formatItemsSold(count: number): string {
  return count.toLocaleString('en-US');
}

export function weekDateRange(weekStart: string, weekEnd: string): string {
  return `${formatIsoDateLong(weekStart)} - ${formatIsoDateLong(weekEnd)}`;
}

/** Compact Mon-start label for tight grid cells, e.g. `6/23-6/29`. */
export function compactWeekDateRange(weekStart: string, weekEnd: string): string {
  return `${shortDate(weekStart)}-${shortDate(weekEnd)}`;
}
