import { createContext, useContext } from 'react';

/**
 * The scanner's look (owner 2026-10-10): "price first" makes the price the big number (item card, cart total)
 * with ThriftBucks smaller below it; off, ThriftBucks are the big number. Settings → Thrift+ sets it for
 * everyone; staff can flip it on this phone from the test bar to compare.
 */
/**
 * The item card's price part (owner 2026-10-10): the centered price tag, words only (no symbol), three ways:
 * badge (a green pill), stack (two matching label-and-number stacks), coupon (a cream dashed coupon).
 */
export type CardStyle = 'badge' | 'stack' | 'coupon';
export const CARD_STYLES: Array<{ style: CardStyle; label: string }> = [
  { style: 'badge', label: '1 badge' },
  { style: 'stack', label: '2 stack' },
  { style: 'coupon', label: '3 coupon' },
];

export interface ScannerLook {
  priceFirst: boolean;
  flip: () => void;
  card: CardStyle;
  nextCard: () => void;
}

export const ScannerLookContext = createContext<ScannerLook>({
  priceFirst: true,
  flip: () => undefined,
  card: 'badge',
  nextCard: () => undefined,
});

const CARD_KEY = 'tp-card';

export function savedCard(): CardStyle {
  try {
    const v = window.sessionStorage.getItem(CARD_KEY);
    return CARD_STYLES.some((x) => x.style === v) ? (v as CardStyle) : 'badge';
  } catch {
    return 'badge';
  }
}

export function saveCard(card: CardStyle): void {
  try {
    window.sessionStorage.setItem(CARD_KEY, card);
  } catch {
    // Private mode: the choice lasts this page only.
  }
}

export function useScannerLook(): ScannerLook {
  return useContext(ScannerLookContext);
}

const KEY = 'tp-look';

/** This phone's flip, if staff flipped it: true = price first, false = ThriftBucks first. */
export function lookOverride(): boolean | null {
  try {
    const v = window.sessionStorage.getItem(KEY);
    return v === 'price' ? true : v === 'tb' ? false : null;
  } catch {
    return null;
  }
}

export function saveLookOverride(priceFirst: boolean): void {
  try {
    window.sessionStorage.setItem(KEY, priceFirst ? 'price' : 'tb');
  } catch {
    // Private mode: the flip lasts this page only.
  }
}
