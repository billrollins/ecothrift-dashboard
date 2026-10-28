/** The print-server chip's three states (owner, 2026-10-28). */
export type PrintServerState = 'online' | 'needs_update' | 'offline';

/** -1, 0 or 1, comparing dotted versions number by number ("1.9.10" is after "1.9.9"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Offline when it does not answer; Needs update when it runs a version below the published one; else Online. */
export function printServerState(online: boolean, installed?: string | null, latest?: string | null): PrintServerState {
  if (!online) return 'offline';
  if (installed && latest && compareVersions(installed, latest) < 0) return 'needs_update';
  return 'online';
}
