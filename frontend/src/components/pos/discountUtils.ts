import type { CartLine } from '../../types/pos.types';

export const DISCOUNT_REASON_STORE_CREDIT = 'In-store credit (return)';
export const DISCOUNT_REASON_GOOGLE_REVIEW = 'Google Review';
export const DISCOUNT_REASON_OTHER = 'Other';

export const GOOGLE_REVIEW_PERCENT = 5;
export const GOOGLE_REVIEW_MAX_DOLLARS = 5;

/** Canfield listing — `!9m1!1b1` opens the reviews pane (same place as ecothrift.us). */
export const GOOGLE_REVIEWS_URL =
  'https://www.google.com/maps/place/Eco-Thrift+-+Canfield/@41.2336219,-96.0442073,17z/data=!4m8!3m7!1s0x87938d8771cb8e6d:0x8b75ff46ec9d2adb!8m2!3d41.2336219!4d-96.0442073!9m1!1b1!16s%2Fg%2F11xw30bys8';

export type DiscountInputMode = 'amount' | 'percent';
export type DiscountApplyTo = 'ticket' | number;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function discountableLines(lines: CartLine[]): CartLine[] {
  return lines.filter((ln) => ln.line_kind !== 'discount' && ln.line_kind !== 'delivery');
}

export function discountBase(lines: CartLine[], targetLineId: DiscountApplyTo): number {
  const eligible = lines.filter((ln) => ln.line_kind !== 'discount');
  if (targetLineId === 'ticket') {
    return eligible.reduce((sum, ln) => sum + Number(ln.line_total), 0);
  }
  const line = eligible.find((ln) => ln.id === targetLineId);
  return line ? Number(line.line_total) : 0;
}

export function dollarsFromPercent(percent: number, base: number): number {
  return roundMoney((base * percent) / 100);
}

export function percentFromDollars(dollars: number, base: number): number {
  if (base <= 0) return 0;
  return roundMoney((dollars / base) * 100);
}

/** Printed offer: 5% of the ticket/line, never more than $5. */
export function applyGoogleReviewCap(dollars: number, base: number): number {
  const offer = Math.min(dollarsFromPercent(GOOGLE_REVIEW_PERCENT, base), GOOGLE_REVIEW_MAX_DOLLARS);
  return Math.min(dollars, offer);
}

export function formatDiscountCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
