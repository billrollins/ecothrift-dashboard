import { addDays, format, parseISO } from 'date-fns';

export function nextBiweeklyDate(anchor: string | null | undefined, today: Date): string {
  if (!anchor) return format(today, 'yyyy-MM-dd');
  const start = parseISO(anchor);
  if (Number.isNaN(start.getTime())) return format(today, 'yyyy-MM-dd');
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (todayStart.getTime() <= start.getTime()) return format(start, 'yyyy-MM-dd');
  const elapsed = Math.floor((todayStart.getTime() - start.getTime()) / 86_400_000);
  const periodStart = addDays(start, Math.floor(elapsed / 14) * 14);
  if (periodStart.getTime() >= todayStart.getTime()) return format(periodStart, 'yyyy-MM-dd');
  return format(addDays(periodStart, 14), 'yyyy-MM-dd');
}

export function biweeklyMaxDate(today: Date): string {
  return format(addDays(today, 13), 'yyyy-MM-dd');
}
