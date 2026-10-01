/** The run timer: time since the run started, on the server's clock. */

/** "0:07", "12:34", "1:02:03". */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Scans per minute, one decimal. 0 until a few seconds have passed, so the first scan does not read as 600/min. */
export function ratePerMinute(scans: number, seconds: number): number {
  if (scans <= 0 || seconds < 5) return 0;
  return Math.round((scans / seconds) * 600) / 10;
}

/** Milliseconds to add to the phone's clock to get the server's. */
export function clockOffset(serverNow: string | undefined, phoneNowMs: number): number {
  const t = serverNow ? Date.parse(serverNow) : NaN;
  return Number.isNaN(t) ? 0 : t - phoneNowMs;
}

export function elapsedSeconds(startedAt: string, phoneNowMs: number, offsetMs: number, endedAt?: string | null): number {
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : phoneNowMs + offsetMs;
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(0, (end - start) / 1000);
}

/** "9:05 AM". */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
