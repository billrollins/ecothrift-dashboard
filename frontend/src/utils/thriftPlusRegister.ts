import { format, parseISO } from 'date-fns';
import { tbText } from '../components/thriftplus/ThriftBucks';
import type { Cart, CartLine, PaymentMethod, ThriftPlusCartBlock } from '../types/pos.types';

/**
 * Thrift+ at the register, the pure parts (10-14 register build, the 10-12 policy). The terminal, the
 * Thrift+ panel and the receipt read the server's `cart.thrift_plus` block through these. While Thrift+ is
 * dark the block is absent and every helper gives what the terminal did before Thrift+ (the total, no rows).
 */

function num(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

function moneyCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Thrift+ credit spent on the sale (a payment after tax); 0 while dark. */
export function creditUsed(cart: Cart | null | undefined): number {
  const block = cart?.thrift_plus;
  if (block && block.credit_used != null) return num(block.credit_used);
  return num(cart?.thrift_credit);
}

/** What cash or card must pay: the total less Thrift+ credit (the total while dark). */
export function amountDue(cart: Cart | null | undefined): number {
  return moneyCents(Math.max(0, num(cart?.total) - creditUsed(cart)));
}

/** The cart's ThriftBucks discount line (kept ThriftBucks used): only the server's sync makes, resizes or removes it. */
export function isBucksLine(cart: Cart | null | undefined, line: CartLine): boolean {
  const id = cart?.thrift_plus?.bucks_line_id;
  if (id != null && line.id === id) return true;
  return line.line_kind === 'discount' && (line.meta as { thrift?: unknown } | undefined)?.thrift === 'bucks';
}

/** Dollars taken off by redeeming this trip's ThriftBucks instantly (the lines' Thrift+ savings). */
export function instantOffOnLines(cart: Cart | null | undefined): number {
  return moneyCents((cart?.lines ?? []).reduce((sum, ln) => sum + num(ln.thrift_savings), 0));
}

/** "Sale savings": the sale percents only (never the instant redemption or the ThriftBucks line). */
export function saleSavings(cart: Cart | null | undefined): number {
  return moneyCents(
    (cart?.lines ?? [])
      .filter((ln) => !isBucksLine(cart, ln))
      .reduce((sum, ln) => sum + num(ln.sale_savings) - num(ln.thrift_savings), 0),
  );
}

/** Kept ThriftBucks used on this sale (a number; never "$"). */
export function bucksUsed(cart: Cart | null | undefined): number {
  return num(cart?.thrift_plus?.bucks_used);
}

/**
 * Dollars off today if the member redeems this trip's ThriftBucks instantly: the server's figure (instant_offer,
 * capped at what is left to pay); from an older server, the share of what the trip collects, rounded up to the cent.
 */
export function instantOffer(block: ThriftPlusCartBlock): number {
  if (block.instant_offer != null) return num(block.instant_offer);
  if (block.member?.choice === 'instant' && num(block.instant_off) > 0) return num(block.instant_off);
  const collected = Math.round(num(block.collected) * 100);
  const share = num(block.instant_share);
  if (collected <= 0 || share <= 0) return 0;
  return Math.min(collected, Math.ceil(collected * Math.min(share, 1) - 1e-9)) / 100;
}

/** "Nov 19" from an ISO date, or '' when there is none. */
export function useByText(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'MMM d');
  } catch {
    return '';
  }
}

/**
 * A re-ring (owner 10-14): the trip's ThriftBucks are kept, usable from tomorrow. No instant redemption and no
 * Thrift+ credit on a re-ring.
 */
export function reringMessage(name: string | null | undefined, done: Cart): string {
  const block = done.thrift_plus;
  const who = (name ?? '').trim() || block?.member?.name || 'the member';
  const collected = num(block?.collected);
  const useBy = useByText(block?.use_by);
  if (collected <= 0) return `Re-rung for ${who}. This trip collects no ThriftBucks.`;
  return `Re-rung for ${who}: ${tbText(collected)} kept, usable from tomorrow${useBy ? `, use by ${useBy}` : ''}.`;
}

/**
 * Training register (audit C1): no card step ever runs there. Card and split sales go straight to the
 * "THIS IS JUST A TEST" screen (never to the CardX tender), so a trainee is never asked to run a real card.
 */
export function needsCardTender(method: PaymentMethod, training: boolean): boolean {
  return !training && (method === 'card' || method === 'split');
}

/** A practice card or split sale: a debit card with no surcharge, so the server's checks pass and nothing is charged. */
export function practiceCardPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const method = payload.payment_method;
  if (method !== 'card' && method !== 'split') return payload;
  const rest = { ...payload };
  delete rest.card_charged_total;
  return { ...rest, card_type: 'debit' };
}
