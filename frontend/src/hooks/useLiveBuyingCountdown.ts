import { useEffect, useState } from 'react';
import { msUntilEnd, MS_TIME_REMAINING_WITH_SECONDS } from '../utils/buyingAuctionList';

export function anyEndTimeNeedsLiveCountdown(endTimes: (string | null | undefined)[]): boolean {
  for (const t of endTimes) {
    const ms = msUntilEnd(t ?? null);
    if (ms != null && ms > 0 && ms < MS_TIME_REMAINING_WITH_SECONDS) return true;
  }
  return false;
}

/**
 * Returns a number that increments every second while any `endTime` is within the live window.
 * Use as React key or pass to children so time cells re-render.
 */
export function useLiveBuyingCountdownTick(endTimes: (string | null | undefined)[]): number {
  const [tick, setTick] = useState(0);
  const needs = anyEndTimeNeedsLiveCountdown(endTimes);

  useEffect(() => {
    if (!needs) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [needs]);

  return tick;
}
