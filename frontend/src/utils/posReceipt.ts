import { format } from 'date-fns';
import type { Cart, CartLine, ThriftPlusCartBlock, ThriftPlusLineMark } from '../types/pos.types';
import { isBucksLine } from './thriftPlusRegister';

export function saleSuffix(line: CartLine): string {
  if (line.sale_label === 'summer') return ' (50% Summer)';
  if (line.sale_label === 'labor_day') {
    const pct = Number(line.sale_percent || 10);
    return ` (${pct}% Labor Day)`;
  }
  return '';
}

export function receiptLineFromCartLine(line: CartLine): {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
} {
  const qty = line.quantity || 1;
  const lineTotal = parseFloat(String(line.line_total));
  return {
    name: `${line.description}${saleSuffix(line)}`,
    quantity: line.quantity,
    unit_price: lineTotal / qty,
    line_total: lineTotal,
  };
}

/** Merchandise (an item or a pink tag), the lines a 3-day returns mark is about; not fees or discounts. */
function isMerchandise(line: CartLine): boolean {
  const kind = line.line_kind;
  if (kind === 'discount' || kind === 'delivery' || kind === 'assembly') return false;
  return kind === 'item' || kind === 'manual' || line.item != null || kind == null;
}

/**
 * A receipt line's mark (A3, W10): a member's line carries its frozen mark ("3-day return" or "AS IS");
 * every guest line is AS IS. None while Thrift+ is dark, so those receipts stay exactly as before.
 */
function markFor(cart: Cart, line: CartLine): ThriftPlusLineMark | undefined {
  const block = cart.thrift_plus;
  if (!block || !isMerchandise(line)) return undefined;
  if (!block.member) return 'AS IS';
  return block.lines?.[String(line.id)]?.mark ?? 'AS IS';
}

/**
 * The receipt's items. While Thrift+ is dark: exactly as before. With Thrift+: each merchandise line carries
 * its mark, and the ThriftBucks discount line is left out (it prints as "ThriftBucks used" above Subtotal).
 */
export function receiptItemsFromCart(cart: Cart) {
  const lines = cart.lines ?? [];
  if (!cart.thrift_plus) return lines.map(receiptLineFromCartLine);
  return lines
    .filter((line) => !isBucksLine(cart, line))
    .map((line) => {
      const item = receiptLineFromCartLine(line);
      const mark = markFor(cart, line);
      return mark ? { ...item, mark } : item;
    });
}

export function buildReceiptData(cart: Cart): Record<string, unknown> {
  const completedAt = cart.completed_at
    ? new Date(cart.completed_at)
    : cart.created_at
      ? new Date(cart.created_at)
      : new Date();
  // A training register's practice sale says so on the paper (2026-10-10).
  const training = cart.status === 'training';
  const data: Record<string, unknown> = {
    receipt_number: cart.receipt?.receipt_number ?? '',
    date: format(completedAt, 'yyyy-MM-dd'),
    time: format(completedAt, 'h:mm a'),
    cashier: training ? `TRAINING - ${cart.cashier_name ?? ''}` : cart.cashier_name ?? '',
    items: receiptItemsFromCart(cart),
    subtotal: parseFloat(String(cart.subtotal)),
    tax: parseFloat(String(cart.tax_amount)),
    total: parseFloat(String(cart.total)),
    payment_method: training ? `TRAINING - NOT A SALE (${cart.payment_method})` : cart.payment_method,
    amount_tendered:
      cart.cash_tendered != null ? parseFloat(String(cart.cash_tendered)) : undefined,
    change: cart.change_given != null ? parseFloat(String(cart.change_given)) : undefined,
    card_amount: cart.card_amount != null ? parseFloat(String(cart.card_amount)) : undefined,
    card_type: cart.card_type || undefined,
    card_surcharge:
      cart.card_surcharge_amount != null
        ? parseFloat(String(cart.card_surcharge_amount))
        : undefined,
    card_charged_total:
      cart.card_charged_total != null
        ? parseFloat(String(cart.card_charged_total))
        : undefined,
    card_surcharge_percent:
      cart.card_surcharge_rate != null
        ? parseFloat(String(cart.card_surcharge_rate)) * 100
        : undefined,
    savings: cart.savings
      ? {
          total: parseFloat(cart.savings.total),
          lines: cart.savings.lines.map((l) => ({ label: l.label, amount: parseFloat(l.amount) })),
        }
      : undefined,
    you_saved:
      cart.savings && parseFloat(cart.savings.total) > 0
        ? parseFloat(cart.savings.total)
        : undefined,
    thrift_plus: thriftPlusReceipt(cart),
    // Print server 1.9.0 prints "TRAINING - NOT A SALE" at the top and bottom when it sees this flag.
    // Only a practice sale carries the key, so every real receipt's payload is unchanged.
    ...(training ? { training: true } : {}),
  };
  // The print server prints "TRAINING - NOT A SALE" at the top and bottom (sent only when true, so every
  // other receipt's payload is unchanged).
  if (training) data.training = true;
  return data;
}

function num(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '0'));
  return Number.isFinite(n) ? n : 0;
}

/** The member's first name for the receipt (owner 2026-10-14: the first name, or nothing; no card, no last 4). */
function receiptFirstName(member: NonNullable<ThriftPlusCartBlock['member']>): string {
  return (member.first_name ?? member.name.trim().split(/\s+/)[0] ?? '').trim();
}

/**
 * Thrift+ on the receipt (the 10-12 policy; the print server's 1.9.0 block). ThriftBucks are numbers (the
 * printer adds the word, never "$"); instant_off and credit are dollars; dates are ISO.
 * - Member: "THRIFT+ MEMBER Pat" (the first name only), "ThriftBucks collected 35.00, use by Nov 19" (or redeemed
 *   instantly: $17.50 off), "ThriftBucks used 33.27" above Subtotal, Thrift+ credit used, both balances, and the B12
 *   rewards line (printed by the print server on every member receipt).
 * - Guest: every line AS IS, and what membership would have collected.
 * There is no Thrift+ card (owner 2026-10-14): nothing here names one. An older print server ignores the key.
 */
export function thriftPlusReceipt(cart: Cart): Record<string, unknown> | undefined {
  const block = cart.thrift_plus;
  if (!block) return undefined;
  const m = block.member;
  if (!m) {
    return {
      member: null,
      collected: num(block.collected),
      use_by: null,
      instant_off: 0,
      instant_bucks: 0,
      bucks_used: 0,
      credit_used: 0,
      balances: null,
      guest_all_as_is: true,
      guest_line: block.guest_line || '',
    };
  }
  return {
    member: receiptFirstName(m),
    collected: num(block.collected),
    use_by: block.use_by ?? null,
    instant_off: num(block.instant_off),
    instant_bucks: num(block.instant_bucks),
    bucks_used: num(block.bucks_used),
    credit_used: num(block.credit_used),
    balances: {
      bucks: num(block.balances?.bucks),
      bucks_use_by: block.balances?.bucks_use_by ?? null,
      credit: num(block.balances?.credit),
    },
    guest_all_as_is: false,
  };
}
