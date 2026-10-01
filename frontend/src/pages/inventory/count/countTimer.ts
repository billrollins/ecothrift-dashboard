/** The count's timer and the short list of earlier runs (kept on the phone, to compare scanning strategies). */

export interface CountRun {
  /** ISO time the run ended (finished or started over). */
  at: string;
  seconds: number;
  scans: number;
  counted: number;
  how: 'finished' | 'started over';
}

const RUNS_KEY = 'stocktake.runs';
const RUNS_MAX = 8;

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

export function loadRuns(): CountRun[] {
  try {
    const raw = window.localStorage.getItem(RUNS_KEY);
    const list = raw ? (JSON.parse(raw) as CountRun[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Newest first, capped. Returns the new list. */
export function addRun(run: CountRun): CountRun[] {
  const list = [run, ...loadRuns()].slice(0, RUNS_MAX);
  try {
    window.localStorage.setItem(RUNS_KEY, JSON.stringify(list));
  } catch {
    // Storage blocked: the list just does not persist.
  }
  return list;
}

export function clearRuns(): void {
  try {
    window.localStorage.removeItem(RUNS_KEY);
  } catch {
    // nothing to clear
  }
}

export function describeRun(r: CountRun): string {
  const rate = ratePerMinute(r.scans, r.seconds);
  return `${r.scans} scans in ${formatElapsed(r.seconds)}${rate ? ` · ${rate}/min` : ''}`;
}
