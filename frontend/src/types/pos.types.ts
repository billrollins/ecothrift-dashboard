/**
 * Payment method choices
 */
export type PaymentMethod = 'cash' | 'card' | 'split';

/**
 * Device type for POS device identity (persisted in localStorage).
 */
export type POSDeviceType = 'register' | 'manager' | 'online_sales' | 'processing' | 'mobile';

/**
 * Persisted device config so this machine is recognized as a specific terminal/role.
 */
export interface POSDeviceConfig {
  deviceType: POSDeviceType;
  registerId?: number;
  registerName?: string;
  registerCode?: string;
  configuredAt: string;
}

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
  resale_source_sku?: string;
  resale_source_item_id?: number | null;
  line_kind?: 'item' | 'manual' | 'discount' | 'delivery';
  meta?: Record<string, unknown>;
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
  items_sold: number;
  goal?: string;
}

export interface SalesDailyMetric {
  date: string;
  day: string;
  rolling_week_total: string;
  four_week_weekly_avg: string;
  week_start: string;
  is_week_start: boolean;
}

export interface SalesWeeklyRow {
  week_start: string;
  week_end: string;
  week_total: string;
  week_items_sold: number;
  label: string;
  days: WeeklyDayMetric[];
}

export interface DashboardSalesGoal {
  id: number;
  amount: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export interface SalesMetrics {
  today: string;
  yesterday: string;
  same_weekday_last_week: string;
  goal: DashboardSalesGoal | null;
  daily_last_90_days: SalesDailyMetric[];
  weekly_last_14_weeks: SalesWeeklyRow[];
}

export interface DepartmentPeriodMetric {
  week: string;
  today: string;
}

export interface RestorationMetrics {
  active_jobs: number;
  awaiting_parts: number;
  returns_pending: number;
  week_jobs_done: number;
  today_jobs_done: number;
  week_tested: number;
  week_repairs: number;
  week_assembled: number;
  week_salvaged: number;
  today_tested: number;
  today_repairs: number;
  today_assembled: number;
  today_salvaged: number;
  ready: boolean;
  note?: string;
}

export interface RetailMetrics {
  ready: boolean;
  average_grade: string | null;
  last_grade: string | null;
  note?: string;
}

export interface DepartmentDailyMetric {
  date: string;
  day: string;
  buying: string;
  processing: string;
  restoration: number;
  retail: string | null;
  is_future: boolean;
}

export interface DepartmentDailyWeek {
  label: string;
  week_start: string;
  week_end: string;
  days: DepartmentDailyMetric[];
}

export type DepartmentGoalKey = 'buying' | 'processing' | 'restoration' | 'retail';

export interface DashboardDepartmentGoal {
  id: number;
  department: DepartmentGoalKey;
  value: string;
  description: string;
  created_at?: string;
  updated_at?: string;
}

export interface DepartmentMetrics {
  buying: DepartmentPeriodMetric;
  processing: DepartmentPeriodMetric;
  restoration: RestorationMetrics;
  retail: RetailMetrics;
  goals: Partial<Record<DepartmentGoalKey, DashboardDepartmentGoal>>;
  daily_weeks: DepartmentDailyWeek[];
}

export interface DashboardMetrics {
  sales: SalesMetrics;
  department_metrics: DepartmentMetrics;
}

export interface DashboardAlert {
  type: 'time_entries' | 'sick_leave' | 'drawers';
  message: string;
  count: number;
}

export type DeliveryCrewSize = 1 | 2;

export type DeliveryJobStatus = 'scheduled' | 'completed' | 'cancelled' | 'failed';

export interface DeliveryAvailability {
  id: number;
  date: string;
  time_start: string;
  time_end: string;
  crew_size: DeliveryCrewSize;
  assigned_to: string;
  notes: string;
  is_active: boolean;
  delivery_count: number;
  items_booked: number;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryJob {
  id: number;
  availability: number;
  scheduled_date: string;
  cart: number | null;
  cart_line: number | null;
  customer_name: string;
  phone: string;
  address: string;
  is_apt: boolean;
  unit: string;
  items_delivered: string;
  item_count: number;
  tier: string;
  fee: string;
  distance_miles: string | null;
  distance_mode: string;
  status: DeliveryJobStatus;
  notes: string;
  created_by: number | null;
  created_by_name?: string | null;
  availability_time_start?: string;
  availability_time_end?: string;
  availability_assigned_to?: string;
  availability_crew_size?: number;
  created_at?: string;
  updated_at?: string;
}
