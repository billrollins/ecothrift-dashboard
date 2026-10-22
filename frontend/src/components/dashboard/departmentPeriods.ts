/** The period behind a tapped department number: one day, or a Mon-Sun week up to today (owner 2026-10-22). */
import type { DepartmentDailyWeek } from '../../types/pos.types';
import { shortDate } from './dashboardFormatters';

export interface DetailsPeriod {
  start: string;
  end: string;
}

function weekdayShort(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function dayPeriod(date: string): DetailsPeriod {
  return { start: date, end: date };
}

/** The week, cut at today so "this week" is Monday to today, like the card's Actual. */
export function weekPeriod(week: Pick<DepartmentDailyWeek, 'week_start' | 'week_end'>, todayIso?: string): DetailsPeriod {
  const end = todayIso && todayIso >= week.week_start && todayIso < week.week_end ? todayIso : week.week_end;
  return { start: week.week_start, end };
}

/** "Tue 10/20" or "Mon 10/19 - Thu 10/22". */
export function periodLabel(period: DetailsPeriod): string {
  const one = (iso: string) => `${weekdayShort(iso)} ${shortDate(iso)}`.trim();
  return period.start === period.end ? one(period.start) : `${one(period.start)} - ${one(period.end)}`;
}

/** Inventory search, showing the items one person put on the floor in the period. */
export function processedItemsHref(userId: number | null, period: DetailsPeriod): string {
  const params = new URLSearchParams({
    processed_by: userId == null ? 'none' : String(userId),
    from: period.start,
    to: period.end,
  });
  return `/inventory/search?${params.toString()}`;
}
