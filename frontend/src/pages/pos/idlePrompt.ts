/** Last activity per register. A refresh must not reset the idle clock. */
export function idleActivityKey(registerId: number): string {
  return `pos.workCycle.lastActivity.${registerId}`;
}

export function readLastActivity(registerId: number): string | null {
  try {
    return localStorage.getItem(idleActivityKey(registerId));
  } catch {
    return null;
  }
}

export function writeLastActivity(registerId: number, iso: string): void {
  try {
    localStorage.setItem(idleActivityKey(registerId), iso);
  } catch {
    /* Private mode can refuse writes; the next prompt is then due immediately. */
  }
}

/**
 * True when the register has had no transactions for `minutes`.
 * Activity is carts and prompt answers, not pointer movement.
 */
export function idlePromptDue(
  lastActivityIso: string | null,
  nowIso: string,
  minutes: number,
): boolean {
  if (!minutes || minutes < 0) return false;
  if (!lastActivityIso) return true;
  const last = Date.parse(lastActivityIso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(last) || !Number.isFinite(now)) return false;
  return now - last >= minutes * 60_000;
}
