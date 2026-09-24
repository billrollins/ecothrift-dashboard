import { useEffect, useMemo, useState } from 'react';
import { buildMyWork, type MyWork } from '../pages/routines/myWork';
import { useAuth } from './useAuth';
import { useMyRoutineRuns } from './useRoutines';

/** Re-evaluate once a minute so "Due now" and "Late" flip on time even when the list is unchanged. */
function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/**
 * What this person owes, in one shape, for every routine surface: Today, the Today badge,
 * the app-bar icon, the desk runner list, and the clock-out check. One query, one count.
 */
export function useMyWork(): { work: MyWork; isLoading: boolean; isError: boolean } {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const query = useMyRoutineRuns();
  const now = useMinuteTick();
  const work = useMemo(() => buildMyWork(query.data, lang, new Date(now)), [query.data, lang, now]);
  return { work, isLoading: query.isLoading && !query.data, isError: query.isError };
}
