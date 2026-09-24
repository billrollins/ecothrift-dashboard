import { useEffect, useMemo, useState } from 'react';
import type { TimeEntry, WeeklyHoursStatus } from '../types/hr.types';
import { useCurrentEntry, useWeeklyHoursStatus } from './useTimeClock';

/** No overtime is approved, so the week's limit is a nag like any routine (owner, 2026-09-24). */
export type HoursNagLevel = 'none' | 'soft' | 'hard';

export interface HoursNag {
  /** Soft (amber): an hour or less left this week. Hard (red): at or past the limit. */
  level: HoursNagLevel;
  /** Hours worked this week, counting the open shift up to now. */
  worked: number;
  limit: number;
  /** Hours left before the limit (0 once reached). */
  left: number;
  /** When to clock out to stay under the limit; null once it is reached. */
  clockOutBy: Date | null;
}

const NONE: HoursNag = { level: 'none', worked: 0, limit: 40, left: 40, clockOutBy: null };
const SOFT_HOURS = 1;

/**
 * The weekly-hours nag. Only while clocked in: someone who is off the clock has nothing to do
 * about it. The server's `hours_worked` includes the open shift up to when it was fetched, so
 * time since then is added (not while on break), and the nag moves every minute.
 */
export function hoursNag(
  weekly: WeeklyHoursStatus | undefined,
  entry: TimeEntry | null | undefined,
  fetchedAt: number,
  now: number,
): HoursNag {
  // A forgotten punch inflates the week; Today asks when they left instead of nagging.
  if (!weekly || !entry || entry.clock_out || entry.stale) return NONE;
  const limit = parseFloat(weekly.hours_limit) || 40;
  const since = entry.on_break || !fetchedAt ? 0 : Math.max(now - fetchedAt, 0) / 3_600_000;
  const worked = (parseFloat(weekly.hours_worked) || 0) + since;
  const left = Math.max(limit - worked, 0);
  const level: HoursNagLevel = left <= 0 ? 'hard' : left <= SOFT_HOURS ? 'soft' : 'none';
  return {
    level,
    worked,
    limit,
    left,
    clockOutBy: left > 0 ? new Date(now + left * 3_600_000) : null,
  };
}

export function useHoursNag(): HoursNag {
  const current = useCurrentEntry();
  const weekly = useWeeklyHoursStatus();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(
    () => hoursNag(weekly.data, current.data, weekly.dataUpdatedAt, now),
    [weekly.data, weekly.dataUpdatedAt, current.data, now],
  );
}
