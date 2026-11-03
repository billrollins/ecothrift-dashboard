/**
 * Cash by bill and coin (2026-10-21, digest point 3). The same rules as `apps/pos/services/cash_counts.py`: a count is
 * `{ twenties: 2, quarters: 3 }`; change is the fewest pieces the drawer holds (largest first, or an exact search when
 * the drawer is short of a coin). The server's answer is the one that counts; this one shows "Give back" while tapping.
 */
export type CashKey =
  | 'hundreds' | 'fifties' | 'twenties' | 'tens' | 'fives' | 'ones'
  | 'quarters' | 'dimes' | 'nickels' | 'pennies'
  | 'twos' | 'halves' | 'dollar_coins';

export type CashCount = Partial<Record<CashKey, number>>;

export interface CashDenomination {
  key: CashKey;
  label: string;
  /** Plural for "Give back: 2 × quarters". */
  name: string;
  cents: number;
  bill: boolean;
  /** Keyboard key on the tap pad (Shift + the key takes one back); none for the oddballs. */
  hotkey: string;
  /** Oddballs (2026-11-03): taken and counted, never given as change; behind the Oddballs button. */
  odd?: boolean;
  /** Its colour (2026-11-03, Bill: "color code the denominations"): the real note's colour, coins in metal. */
  tone: { bg: string; fg: string };
}

// Readable on light and dark: a solid fill with its own text colour.
const SILVER = { bg: '#b0bec5', fg: '#102027' };

export const CASH_DENOMINATIONS: CashDenomination[] = [
  { key: 'hundreds', label: '$100', name: '$100', cents: 10000, bill: true, hotkey: 'Q', tone: { bg: '#1565c0', fg: '#fff' } },
  { key: 'fifties', label: '$50', name: '$50', cents: 5000, bill: true, hotkey: 'W', tone: { bg: '#c2185b', fg: '#fff' } },
  { key: 'twenties', label: '$20', name: '$20', cents: 2000, bill: true, hotkey: 'E', tone: { bg: '#2e7d32', fg: '#fff' } },
  { key: 'tens', label: '$10', name: '$10', cents: 1000, bill: true, hotkey: 'R', tone: { bg: '#e65100', fg: '#fff' } },
  { key: 'fives', label: '$5', name: '$5', cents: 500, bill: true, hotkey: 'T', tone: { bg: '#6a1b9a', fg: '#fff' } },
  { key: 'ones', label: '$1', name: '$1', cents: 100, bill: true, hotkey: 'Y', tone: { bg: '#616161', fg: '#fff' } },
  { key: 'quarters', label: '25¢', name: 'quarters', cents: 25, bill: false, hotkey: 'A', tone: SILVER },
  { key: 'dimes', label: '10¢', name: 'dimes', cents: 10, bill: false, hotkey: 'S', tone: SILVER },
  { key: 'nickels', label: '5¢', name: 'nickels', cents: 5, bill: false, hotkey: 'D', tone: SILVER },
  { key: 'pennies', label: '1¢', name: 'pennies', cents: 1, bill: false, hotkey: 'F', tone: { bg: '#a0522d', fg: '#fff' } },
  { key: 'twos', label: '$2', name: '$2 bills', cents: 200, bill: true, hotkey: '', odd: true, tone: { bg: '#00695c', fg: '#fff' } },
  { key: 'halves', label: '50¢', name: '50¢ pieces', cents: 50, bill: false, hotkey: '', odd: true, tone: SILVER },
  { key: 'dollar_coins', label: '$1 coin', name: '$1 coins', cents: 100, bill: false, hotkey: '', odd: true, tone: { bg: '#c9a227', fg: '#1a1400' } },
];

export const ODDBALLS = CASH_DENOMINATIONS.filter((d) => d.odd);
export const TONES = Object.fromEntries(CASH_DENOMINATIONS.map((d) => [d.key, d.tone])) as Record<CashKey, CashDenomination['tone']>;

/**
 * The bills and coins a counter counts: `only` the bills (a handover, the close's hand count; the oddballs go with
 * them) or only the coins (the coin count; no oddballs), and `keys` to narrow it (a spot check). Undefined is all.
 */
export function padKeys(only?: 'bills' | 'coins', keys?: CashKey[]): CashKey[] {
  return CASH_DENOMINATIONS.filter((d) => {
    const fits = !only || (d.odd ? only === 'bills' : (only === 'bills') === d.bill);
    return fits && (!keys || keys.includes(d.key));
  }).map((d) => d.key);
}

export function countCents(count: CashCount | null | undefined): number {
  return CASH_DENOMINATIONS.reduce((sum, d) => sum + (count?.[d.key] ?? 0) * d.cents, 0);
}

export function hasPieces(count: CashCount | null | undefined): boolean {
  return CASH_DENOMINATIONS.some((d) => (count?.[d.key] ?? 0) > 0);
}

export function addCounts(a: CashCount | null | undefined, b: CashCount | null | undefined, sign = 1): CashCount {
  const out: CashCount = {};
  for (const d of CASH_DENOMINATIONS) {
    const n = (a?.[d.key] ?? 0) + sign * (b?.[d.key] ?? 0);
    if (n) out[d.key] = n;
  }
  return out;
}

/** "1 × $5, 2 × quarters", largest first; '' for nothing. */
export function describeCount(count: CashCount | null | undefined): string {
  return CASH_DENOMINATIONS.filter((d) => (count?.[d.key] ?? 0) > 0)
    .map((d) => `${count?.[d.key]} × ${d.name}`)
    .join(', ');
}

/**
 * What to give back for `cents`: the fewest pieces from `available` (a count; undefined means any). `short` when the
 * drawer can't make it exactly (never from oddballs); the count is then the fewest pieces from any bills and coins.
 */
export function makeChange(cents: number, available?: CashCount | null): { give: CashCount; short: boolean } {
  if (cents <= 0) return { give: {}, short: false };
  if (available) {
    const have: Record<CashKey, number> = Object.fromEntries(
      CASH_DENOMINATIONS.map((d) => [d.key, Math.max(0, available[d.key] ?? 0)]),
    ) as Record<CashKey, number>;
    const found = fewest(cents, have);
    if (found) return { give: found, short: false };
  }
  return { give: fewest(cents, null) ?? {}, short: Boolean(available) };
}

// Change is never given in oddballs.
const CHANGE = CASH_DENOMINATIONS.filter((d) => !d.odd);

function fewest(cents: number, have: Record<CashKey, number> | null): CashCount | null {
  let left = cents;
  const out: CashCount = {};
  for (const d of CHANGE) {
    const can = Math.floor(left / d.cents);
    const take = have ? Math.min(have[d.key], can) : can;
    if (take) {
      out[d.key] = take;
      left -= take * d.cents;
    }
  }
  if (left === 0) return out;
  return have ? fewestExact(cents, have) : null;
}

function fewestExact(cents: number, have: Record<CashKey, number>): CashCount | null {
  const items: { key: CashKey; pieces: number; value: number }[] = [];
  for (const d of CHANGE) {
    let limit = Math.min(have[d.key], Math.floor(cents / d.cents));
    let step = 1;
    while (limit > 0) {
      const take = Math.min(step, limit);
      items.push({ key: d.key, pieces: take, value: take * d.cents });
      limit -= take;
      step *= 2;
    }
  }
  const INF = Number.MAX_SAFE_INTEGER;
  const best = new Array<number>(cents + 1).fill(INF);
  best[0] = 0;
  const used = items.map(() => new Uint8Array(cents + 1));
  items.forEach((item, index) => {
    for (let total = cents; total >= item.value; total -= 1) {
      const prev = best[total - item.value];
      if (prev !== INF && prev + item.pieces < best[total]) {
        best[total] = prev + item.pieces;
        used[index][total] = 1;
      }
    }
  });
  if (best[cents] === INF) return null;
  const out: CashCount = {};
  let total = cents;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (used[index][total]) {
      const item = items[index];
      out[item.key] = (out[item.key] ?? 0) + item.pieces;
      total -= item.value;
    }
  }
  return out;
}
