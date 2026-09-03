import { useEffect, useState } from 'react';
import { parseISO } from 'date-fns';

export function formatHours(value: string | number | null | undefined): string {
  if (value == null || value === '') return '0.00';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export function formatElapsed(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Re-render every second while a shift is active so the live timer ticks. */
export function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

export function elapsedSeconds(
  entry: {
    clock_in?: string | null;
    break_minutes?: number | null;
    on_break?: boolean;
    break_started_at?: string | null;
  } | null | undefined,
  nowMs: number,
): number {
  if (!entry?.clock_in) return 0;
  const start = parseISO(entry.clock_in).getTime();
  let seconds = (nowMs - start) / 1000;
  seconds -= (entry.break_minutes ?? 0) * 60;
  if (entry.on_break && entry.break_started_at) {
    seconds -= (nowMs - parseISO(entry.break_started_at).getTime()) / 1000;
  }
  return Math.max(seconds, 0);
}
