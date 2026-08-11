import { priceFromRetail } from './preprocessingReviewTotals';
import { sanitizeDecimalPaste } from './formInputs';

export const RETAIL_PRICE_LOCK_STORAGE_KEY = 'processing.retailPriceLock';

/** Same-tab sync event so toolbar + check-in dialog share one lock preference. */
export const RETAIL_PRICE_LOCK_CHANGE_EVENT = 'processing.retailPriceLock.change';

/** Soft upper bound for editable % of retail (avoids absurd typed values). */
export const RETAIL_PRICE_LOCK_MAX_PCT = 999.9;

export interface RetailPriceLockPref {
  locked: boolean;
  /** Last known price/retail percent (one decimal), or null if never set. */
  pct: number | null;
}

const DEFAULT_PREF: RetailPriceLockPref = { locked: false, pct: null };

function parseMoney(value: string | null | undefined): number | null {
  if (value == null || String(value).trim() === '') return null;
  const n = Number.parseFloat(sanitizeDecimalPaste(String(value).trim()));
  return Number.isFinite(n) ? n : null;
}

export function readRetailPriceLockPref(): RetailPriceLockPref {
  try {
    const raw = localStorage.getItem(RETAIL_PRICE_LOCK_STORAGE_KEY);
    if (raw == null || !raw.trim()) return { ...DEFAULT_PREF };
    const parsed = JSON.parse(raw) as Partial<RetailPriceLockPref>;
    const locked = Boolean(parsed.locked);
    const pct =
      typeof parsed.pct === 'number' && Number.isFinite(parsed.pct) && parsed.pct > 0
        ? Math.round(parsed.pct * 10) / 10
        : null;
    return { locked, pct };
  } catch {
    return { ...DEFAULT_PREF };
  }
}

export function writeRetailPriceLockPref(pref: RetailPriceLockPref): void {
  try {
    localStorage.setItem(RETAIL_PRICE_LOCK_STORAGE_KEY, JSON.stringify(pref));
  } catch {
    // ignore quota / private mode
  }
  try {
    window.dispatchEvent(new CustomEvent(RETAIL_PRICE_LOCK_CHANGE_EVENT, { detail: pref }));
  } catch {
    // ignore non-browser
  }
}

/** Price as % of retail, rounded to one decimal. Null when retail missing/zero or price missing. */
export function pctFromRetailPrice(
  retail: string | null | undefined,
  price: string | null | undefined,
): number | null {
  const r = parseMoney(retail);
  const p = parseMoney(price);
  if (r === null || r <= 0 || p === null || !Number.isFinite(p)) return null;
  return Math.round((p / r) * 1000) / 10;
}

/** Re-export of price-from-% helper used by preprocessing; null = skip write. */
export function priceFromRetailPct(
  retail: string | null | undefined,
  pct: number,
): string | null {
  return priceFromRetail(retail, pct);
}

export function formatLockPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

/** Digits + one decimal (max 1dp). Empty string allowed while typing. */
export function sanitizePctInput(raw: string): string {
  const stripped = raw.replace(/[^\d.]/g, '');
  const parts = stripped.split('.');
  if (parts.length <= 1) return stripped.replace(/[^\d]/g, '').slice(0, 4);
  const head = (parts[0] ?? '').replace(/[^\d]/g, '').slice(0, 4);
  const tail = parts.slice(1).join('').replace(/[^\d]/g, '').slice(0, 1);
  if (tail) return head ? `${head}.${tail}` : `.${tail}`;
  if (stripped.endsWith('.')) return head ? `${head}.` : '.';
  return head;
}

/** Parse a committed percent string; clamp to (0, MAX]. Null if empty/invalid. */
export function parsePctInput(raw: string): number | null {
  const cleaned = sanitizePctInput(raw.trim());
  if (!cleaned || cleaned === '.') return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(RETAIL_PRICE_LOCK_MAX_PCT, Math.round(n * 10) / 10);
}
