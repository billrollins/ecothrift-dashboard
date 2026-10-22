/**
 * Cash by bill and coin (2026-10-21, digest point 3). The same rules as `apps/pos/services/cash_counts.py`: a count is
 * `{ twenties: 2, quarters: 3 }`; change is the fewest pieces the drawer holds (largest first, or an exact search when
 * the drawer is short of a coin). The server's answer is the one that counts; this one shows "Give back" while tapping.
 */
export type CashKey =
  | 'hundreds' | 'fifties' | 'twenties' | 'tens' | 'fives' | 'ones'
  | 'quarters' | 'dimes' | 'nickels' | 'pennies';

export type CashCount = Partial<Record<CashKey, number>>;

export interface CashDenomination {
  key: CashKey;
  label: string;
  /** Plural for "Give back: 2 × quarters". */
  name: string;
  cents: number;
  bill: boolean;
  /** Keyboard key on the tap pad (Shift + the key takes one back). */
  hotkey: string;
}

export const CASH_DENOMINATIONS: CashDenomination[] = [
  { key: 'hundreds', label: '$100', name: '$100', cents: 10000, bill: true, hotkey: 'Q' },
  { key: 'fifties', label: '$50', name: '$50', cents: 5000, bill: true, hotkey: 'W' },
  { key: 'twenties', label: '$20', name: '$20', cents: 2000, bill: true, hotkey: 'E' },
  { key: 'tens', label: '$10', name: '$10', cents: 1000, bill: true, hotkey: 'R' },
  { key: 'fives', label: '$5', name: '$5', cents: 500, bill: true, hotkey: 'T' },
  { key: 'ones', label: '$1', name: '$1', cents: 100, bill: true, hotkey: 'Y' },
  { key: 'quarters', label: '25¢', name: 'quarters', cents: 25, bill: false, hotkey: 'A' },
  { key: 'dimes', label: '10¢', name: 'dimes', cents: 10, bill: false, hotkey: 'S' },
  { key: 'nickels', label: '5¢', name: 'nickels', cents: 5, bill: false, hotkey: 'D' },
  { key: 'pennies', label: '1¢', name: 'pennies', cents: 1, bill: false, hotkey: 'F' },
];

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
 * drawer can't make it exactly; the count is then the fewest pieces from any bills and coins.
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

function fewest(cents: number, have: Record<CashKey, number> | null): CashCount | null {
  let left = cents;
  const out: CashCount = {};
  for (const d of CASH_DENOMINATIONS) {
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
  for (const d of CASH_DENOMINATIONS) {
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
