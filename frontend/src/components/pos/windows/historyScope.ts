/**
 * What a Transactions window shows: one register, drawer, Thrift+ membership or cashier, over some days. It travels as
 * one string (the window's id) so the object modal's Back, dedupe and labels work as for any other window.
 */
export interface HistoryScope {
  register?: number;
  drawer?: number;
  /** A Thrift+ member (person id): their membership's sales, the rows the member card's Recent trips lists. */
  member?: number;
  cashier?: number;
  /** yyyy-MM-dd; both empty = all time. */
  from?: string;
  to?: string;
  /** What the window is for, in words ("Register 1", "Ana Ruiz"). */
  title?: string;
}

const NUMBERS = ['register', 'drawer', 'member', 'cashier'] as const;

export function historyKey(scope: HistoryScope): string {
  const p = new URLSearchParams();
  for (const k of NUMBERS) if (scope[k] != null) p.set(k, String(scope[k]));
  if (scope.from) p.set('from', scope.from);
  if (scope.to) p.set('to', scope.to);
  if (scope.title) p.set('title', scope.title);
  return p.toString();
}

export function parseHistoryKey(key: string): HistoryScope {
  const p = new URLSearchParams(key);
  const scope: HistoryScope = {};
  for (const k of NUMBERS) {
    const n = Number.parseInt(p.get(k) ?? '', 10);
    if (Number.isFinite(n)) scope[k] = n;
  }
  scope.from = p.get('from') ?? undefined;
  scope.to = p.get('to') ?? undefined;
  scope.title = p.get('title') ?? undefined;
  return scope;
}
