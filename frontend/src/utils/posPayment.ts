/**
 * How a sale was paid, in words (2026-10-21). Thrift+ money (credit, a payment after tax; ThriftBucks, a discount
 * before tax) shows beside the cash or card part; a sale Thrift+ paid in full is "Thrift+", never cash.
 * ThriftBucks are not dollars: no "$" on them (the receipt's rule).
 */
import type { Cart } from '../types/pos.types';
import { amountDue } from './thriftPlusRegister';

const LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  split: 'Split',
  payroll: 'Payroll deduction',
  thrift: 'Thrift+',
};

export function paymentMethodLabel(method: string | null | undefined): string {
  const m = String(method ?? '');
  return LABELS[m] ?? m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** ThriftBucks spent on the sale: the Thrift+ columns' "used", else the ThriftBucks discount line. */
export function bucksUsed(cart: Pick<Cart, 'thrift_row' | 'thrift_plus' | 'lines'>): number {
  const fromRow = num(cart.thrift_row?.used);
  if (fromRow > 0) return fromRow;
  const fromBlock = num(cart.thrift_plus?.bucks_used);
  if (fromBlock > 0) return fromBlock;
  const line = (cart.lines ?? []).find(
    (ln) => ln.line_kind === 'discount' && (ln.meta as { thrift?: unknown } | undefined)?.thrift === 'bucks',
  );
  return line ? Math.abs(num(line.line_total)) : 0;
}

/** Thrift+ credit and/or ThriftBucks leave nothing to pay on a sale with items: it completes as paid with Thrift+. */
export function thriftCoversSale(cart: Cart | null | undefined): boolean {
  if (!cart || (cart.lines ?? []).length === 0) return false;
  if (amountDue(cart) > 0) return false;
  return num(cart.thrift_credit) > 0 || bucksUsed(cart) > 0;
}

/** "Paid with ThriftBucks 12.00", "Thrift+ credit $40.00": the Thrift+ parts of the payment, or none. */
export function thriftPaymentParts(
  cart: Pick<Cart, 'thrift_row' | 'thrift_plus' | 'lines' | 'thrift_credit'> | null | undefined,
): string[] {
  const parts: string[] = [];
  if (!cart) return parts;
  const bucks = bucksUsed(cart);
  const credit = num(cart.thrift_credit);
  if (bucks > 0) parts.push(`Paid with ThriftBucks ${bucks.toFixed(2)}`);
  if (credit > 0) parts.push(`Thrift+ credit $${credit.toFixed(2)}`);
  return parts;
}
