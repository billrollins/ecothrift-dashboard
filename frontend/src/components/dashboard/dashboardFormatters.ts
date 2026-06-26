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
