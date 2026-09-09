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
  };
}
