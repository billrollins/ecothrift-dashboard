/**
 * Payment method choices
 */
export type PaymentMethod = 'cash' | 'card' | 'split';

/**
 * Denomination breakdown for cash counts
 */
export interface DenominationBreakdown {
  hundreds: number;
  fifties: number;
  twenties: number;
  tens: number;
  fives: number;
  ones: number;
  quarters: number;
  dimes: number;
  nickels: number;
  pennies: number;
}

export interface Register {
  id: number;
  location: number;
  location_name: string;
  name: string;
  code: string;
  starting_cash: string;
  starting_breakdown: DenominationBreakdown;
  is_active: boolean;
}

export interface DrawerHandoff {
  id: number;
  drawer: number;
  outgoing_cashier: number | null;
  outgoing_cashier_name: string | null;
  incoming_cashier: number | null;
  incoming_cashier_name: string | null;
  counted_at: string;
  count: DenominationBreakdown;
  counted_total: string;
  expected_total: string;
  variance: string;
  notes: string;
}

export interface CashDrop {
  id: number;
  drawer: number;
  amount: DenominationBreakdown;
  total: string;
  dropped_by: number | null;
  dropped_by_name: string | null;
  dropped_at: string;
  notes: string;
}

export interface Drawer {
  id: number;
  register: number;
  register_name: string;
  register_code: string;
  date: string;
  status: 'open' | 'closed';
  current_cashier: number | null;
  current_cashier_name: string | null;
  opened_by: number | null;
  opened_by_name: string | null;
  opened_at: string;
  opening_count: DenominationBreakdown;
  opening_total: string;
  closed_by: number | null;
  closed_by_name: string | null;
  closed_at: string | null;
  closing_count: DenominationBreakdown | null;
  closing_total: string | null;
  cash_sales_total: string;
  expected_cash: string | null;
  variance: string | null;
  handoffs: DrawerHandoff[];
  drops: CashDrop[];
}

export interface SupplementalDrawer {
  id: number;
  location: number;
  location_name: string;
  current_balance: DenominationBreakdown;
  current_total: string;
  last_counted_by: number | null;
  last_counted_by_name: string | null;
  last_counted_at: string | null;
}

export interface SupplementalTransaction {
  id: number;
  supplemental: number;
  transaction_type: 'draw' | 'return' | 'audit_adjustment';
  amount: DenominationBreakdown;
  total: string;
  related_drawer: number | null;
  performed_by: number | null;
  performed_by_name: string | null;
  performed_at: string;
  notes: string;
}

export interface BankTransaction {
  id: number;
  location: number;
  transaction_type: 'deposit' | 'change_pickup';
  amount: DenominationBreakdown;
  total: string;
  status: 'pending' | 'completed';
  performed_by: number | null;
  performed_by_name: string | null;
  created_at: string;
  completed_at: string | null;
  notes: string;
}

export interface CartLine {
  id: number;
  cart: number;
  item: number | null;
  description: string;
  quantity: number;
  unit_price: string;
  line_total: string;
  created_at: string;
}

export interface Receipt {
  id: number;
  cart: number;
  receipt_number: string;
  printed: boolean;
  emailed: boolean;
  created_at: string;
}

export interface Cart {
  id: number;
  drawer: number;
  cashier: number | null;
  cashier_name: string | null;
  customer: number | null;
  status: 'open' | 'completed' | 'voided';
  subtotal: string;
  tax_rate: string;
  tax_amount: string;
  total: string;
  payment_method: PaymentMethod;
  cash_tendered: string | null;
  change_given: string | null;
  card_amount: string | null;
  completed_at: string | null;
  created_at: string;
  lines: CartLine[];
  receipt?: Receipt | null;
}

export interface RevenueGoal {
  id: number;
  location: number;
  date: string;
  goal_amount: string;
}

export interface WeeklyDayMetric {
  date: string;
  day: string;
  revenue: string;
  goal: string;
}

export interface DashboardMetrics {
  todays_revenue: string;
  todays_goal: string;
  weekly: WeeklyDayMetric[];
  items_sold_today: number;
  active_drawers: number;
  clocked_in_employees: number;
}

export interface DashboardAlert {
  type: 'time_entries' | 'sick_leave' | 'drawers';
  message: string;
  count: number;
}
