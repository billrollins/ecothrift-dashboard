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
