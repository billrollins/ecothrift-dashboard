import { format } from 'date-fns';
import type { Cart, CartLine } from '../types/pos.types';

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

export function receiptItemsFromCart(cart: Cart) {
  return (cart.lines ?? []).map(receiptLineFromCartLine);
}

export function buildReceiptData(cart: Cart): Record<string, unknown> {
  const completedAt = cart.completed_at
    ? new Date(cart.completed_at)
    : cart.created_at
      ? new Date(cart.created_at)
      : new Date();
  return {
    receipt_number: cart.receipt?.receipt_number ?? '',
    date: format(completedAt, 'yyyy-MM-dd'),
    time: format(completedAt, 'h:mm a'),
    cashier: cart.cashier_name ?? '',
    items: receiptItemsFromCart(cart),
    subtotal: parseFloat(String(cart.subtotal)),
    tax: parseFloat(String(cart.tax_amount)),
    total: parseFloat(String(cart.total)),
    payment_method: cart.payment_method,
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
  };
}

/**
 * Thrift+ lines for the receipt (thrift_plus_rewards Phase 3). The print server prints them; an
 * older print server ignores the key.
 * - Member: tag price and member price per line, the rewards, the part toward the monthly cover,
 *   the cover so far, and the banked and credit balances.
 * - Guest: what a card would have earned.
 */
export function thriftPlusReceipt(cart: Cart): Record<string, unknown> | undefined {
  const block = cart.thrift_plus;
  if (!block) return undefined;
  const t = block.totals;
  if (!block.member) {
    return block.guest_line ? { guest_line: block.guest_line } : undefined;
  }
  const m = block.member;
  return {
    member: m.name,
    card_last4: m.card_last4,
    lines: (cart.lines ?? [])
      .filter((ln) => block.lines[String(ln.id)] && Number(block.lines[String(ln.id)].reward) > 0)
      .map((ln) => ({
        name: ln.description,
        tag_price: parseFloat(String(ln.unit_price)) * (ln.quantity || 1),
        member_price: parseFloat(String(ln.line_total)),
        reward: parseFloat(block.lines[String(ln.id)].reward),
      })),
    reward_total: parseFloat(t.reward_total),
    to_cover: parseFloat(t.to_cover),
    savings: parseFloat(t.savings),
    to_bank: parseFloat(t.to_bank),
    choice: m.choice,
    cover_covered: parseFloat(m.cover.covered),
    cover_amount: parseFloat(m.cover.amount),
    cover_month: m.cover.month,
    banked: parseFloat(m.banked),
    credit: parseFloat(m.credit),
    credit_used: parseFloat(block.credit_used ?? '0'),
    bank_used: parseFloat(block.bank_used ?? '0'),
    rering: m.rering,
  };
}
