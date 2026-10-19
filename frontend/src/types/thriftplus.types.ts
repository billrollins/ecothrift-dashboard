/** Thrift+ Rewards: members, people and cards (thrift_plus_rewards Phase 1). */
export type CardStatus = 'unissued' | 'active' | 'dead';

export interface ThriftPlusCard {
  id: number;
  code: string;
  /** "1234 5678 9012" */
  display: string;
  status: CardStatus;
  issued_at: string | null;
  dead_at: string | null;
  dead_reason: string;
}

export interface ThriftPlusPerson {
  id: number;
  role: 'primary' | 'secondary';
  first_name: string;
  last_name: string;
  phone: string;
  photo_url: string | null;
  id_checked: boolean;
  verified_18: boolean;
  verified_at: string | null;
  removed_at: string | null;
  cards: ThriftPlusCard[];
  created_at: string;
  /** Where receipts and chosen updates go (email-first, T73). */
  email?: string;
  /** Email state (T74): account email follows the address; store news can be turned off. Detail only. */
  emails?: { updates: boolean; news: boolean };
  /** Owner 2026-10-15 (J8, J11): the email confirmed by its emailed link or code. */
  email_verified_at?: string | null;
  /** The phone read back at a register (in person). */
  phone_verified_at?: string | null;
}

export interface ThriftPlusEvent {
  id: number;
  action: string;
  detail: Record<string, unknown>;
  actor_name: string;
  person_name: string;
  card_code: string;
  created_at: string;
}

export interface ThriftPlusAccount {
  id: number;
  /** 'pending': joined online with a name and email, to finish at a register (owner 2026-10-15, J8).
   * 'inactive': deactivated, the normal way to take a member off; Reactivate undoes it (owner 2026-10-16). */
  status: 'active' | 'revoked' | 'pending' | 'inactive';
  /** A practice member for training: training register and scanner test mode only, left out of every report. */
  is_practice?: boolean;
  notes: string;
  revoked_at: string | null;
  revoked_reason: string;
  created_at: string;
  people: ThriftPlusPerson[];
  /** A staff member's own membership (J6): it links the staff member to their membership. */
  staff?: { id: number; name: string } | null;
  /** Detail only. */
  events?: ThriftPlusEvent[];
}

export interface NewMember {
  first_name: string;
  last_name?: string;
  phone?: string;
  id_checked?: boolean;
  verified_18?: boolean;
  card_code?: string;
  photo?: File | null;
  email?: string;
  /** The training register: make a practice member (2026-10-10). */
  practice?: boolean;
}

// ── The reward engine (Phase 2) ──

export type RewardStatus = 'waiting' | 'climbing' | 'paused' | 'capped' | 'no_room' | 'excluded' | 'closed';

export interface RewardRow {
  item_id: number;
  sku: string;
  title: string;
  price: string;
  reward: string;
  member_price: string;
  floor_price: string;
  day: number;
  status: RewardStatus;
  reason: string;
  family: string;
}

export interface RewardRunSummary {
  id: number;
  day: string;
  started_at: string;
  finished_at: string | null;
  counts: { units?: number; with_reward?: number; reward_total?: string; computed?: number; closed?: number };
  error: string;
}

export interface RewardPreview {
  day: string;
  switch_on: boolean;
  rules: { floor_share: string; start: string | null; wait_days: number; horizon: number; pace_window: number };
  totals: {
    units: number;
    with_reward: number;
    tag_total: string;
    reward_total: string;
    member_total: string;
    pct_off_rewarded: string | null;
  };
  by_status: Partial<Record<RewardStatus, number>>;
  bands: { band: string; units: number; with_reward: number; reward_total: string; pct_off_rewarded: string | null }[];
  families: { paced: number; on_pace: number; linked: number };
  exit_list: { count: number; tag_total: string; rows: RewardRow[] };
  top: RewardRow[];
  to_close: number;
  last_run: RewardRunSummary | null;
}

export interface RewardEventRow {
  on: string;
  day: number;
  reward: string;
  status: RewardStatus;
  reason: string;
  detail: Record<string, unknown>;
}

export interface ItemRewardDetail {
  item_id: number;
  sku: string;
  title: string;
  price: string;
  reward_now: string;
  member_price_now: string;
  state: {
    floor_date: string;
    starting_price: string;
    floor_price: string;
    grow_days: number;
    reward: string;
    status: RewardStatus;
    reason: string;
    day: number;
    computed_on: string;
    exit_on: string | null;
    family_key: string;
    scans: number;
    adds: number;
  } | null;
  events: RewardEventRow[];
}

/** The floor-stock planner (Thrift+ → Floor stock): what members would pay for the stock on the floor. */
export interface FloorPlanRow {
  label: string;
  units: number;
  with_reward: number;
  retail_total: string;
  tag_total: string;
  reward_total: string;
  member_total: string;
  pct_off: number;
}

export interface FloorPlan {
  scenario: {
    launch: string;
    on: string;
    offset: number;
    max_age: number | null;
    floor_share: string;
    wait_days: number;
    horizon: number;
    start_equivalent: string | null;
  };
  totals: FloorPlanRow & {
    consignment_excluded: number;
    no_price: number;
    retail_missing: number;
    at_floor: number;
    exit_list: number;
  };
  by_age: FloorPlanRow[];
  by_band: FloorPlanRow[];
  by_category: FloorPlanRow[];
  current_settings: { start: string | null; floor_share: string; switch_on: boolean };
}

export interface FloorCompare {
  launch: string;
  offsets: number[];
  rows: {
    label: string;
    max_age: number | null;
    start_equivalent: string | null;
    cells: { offset: number; on: string; with_reward: number; reward_total: string; member_total: string; pct_off: number }[];
  }[];
}

export interface FloorPlanChoices {
  launch: string;
  offset: number;
  max_age: number | null;
  floor_share: number | null;
  wait_days: number;
  horizon: number;
}

// ── Rewards calculator (owner, 2026-10-07) ─────────────────────────────────────

export type CalculatorCurve = 'linear' | 'slow_start' | 'fast_start';

/** The calculator's inputs. Blank (null) = the default (today's engine). */
export interface CalculatorChoices {
  population: 'counted' | 'shelf';
  launch: string;
  offset: number;
  wait_days: number;
  pct_per_day: number;
  step_days: number;
  curve: CalculatorCurve;
  floor_share: number;
  same_slowdown: number;
  count_back_stock: boolean;
  similar_slowdown: number;
  max_slowdown: number;
  demand: boolean;
  demand_strength: number;
  max_age: number | null;
  age_factor: number;
  max_start_pct: number | null;
}

export interface CalculatorSide {
  total: number;
  avg: number;
  pct_of_retail: number | null;
}

export interface CalculatorRow {
  label: string;
  items: number;
  with_reward: number;
  with_retail: number;
  retail_total: number;
  guest: CalculatorSide;
  member: CalculatorSide;
  reward_total: number;
  pct_off: number | null;
}

/** The engine's saved setting (owner 2026-10-13: saved from the Calculator tab). */
export interface EngineSetting {
  pct_per_day: string;
  wait_days: number;
  launch: string;
  age_factor: string;
  max_age: number | null;
  saved_at?: string;
  saved_by?: string;
}

export interface EngineState {
  saved: EngineSetting | null;
  live: { floor_share: string; pct_per_day: string; wait_days: number; launch: string | null; age_factor: string; max_age: number | null; saved: boolean };
  switch_on?: boolean;
}

export interface EngineSaved {
  saved: EngineSetting;
  rebuild: { id: number } | null;
}

export interface CalculatorResult {
  params: CalculatorChoices & { start_equivalent: string | null; on: string };
  source: { population: string; count?: { id: number; name: string; day: string | null; counted: number } | null };
  excluded: { consignment: number; no_floor_date: number };
  totals: CalculatorRow;
  by_age: CalculatorRow[];
  by_band: CalculatorRow[];
  by_off: CalculatorRow[];
  by_category: CalculatorRow[];
  timeline: (CalculatorRow & { offset: number; on: string })[];
  rate_changes: { slower: number; faster: number; items: number };
  demand?: {
    store_median_days: number | null;
    sales: number;
    categories: { category: string; median_days: number; sales: number; credibility: number; blended_days: number; multiplier: number | null }[];
  };
  current_settings: { start: string | null; floor_share: string; switch_on: boolean };
}

/** A pricing family on the Families tab (thrift_plus_families Phase 1, owner 2026-10-13). */
export type FamilyStatus = 'possible' | 'approved' | 'not_family' | 'exit';
/** A status, or ``review``: approved by default and not yet reviewed by the owner (owner 2026-10-16). */
export type FamilyView = FamilyStatus | 'review';

export interface FamilyRow {
  id: number;
  name: string;
  kind: 'identical' | 'similar';
  status: FamilyStatus;
  category: string;
  products: number;
  units: number;
  band: '2-3' | '4-9' | '10-49' | '50+';
  huge: boolean;
  tag_total: string;
  price_avg: string;
  price_min: string;
  price_max: string;
  retail_avg: string | null;
  cost_avg: string | null;
  age_oldest: number;
  age_newest: number | null;
  sold_90: number;
  sold_180: number;
  est_per_90: string;
  days_to_clear: number | null;
  pct_now: string;
  suggested_target: number;
  target_per_90: number | null;
  pct: string | null;
  decided_by: string;
  decided_at: string | null;
  note: string;
  auto: boolean;
  flags: { key: 'huge' | 'volume' | 'cost' | 'junk' | 'fast'; text: string }[];
}

export interface FamiliesQueue {
  counts: Record<FamilyView, number>;
  units: Record<FamilyView, number>;
  total: number;
  decided: number;
  reviewed: number;
  matching: number;
  bulk_ok: number;
  rows: FamilyRow[];
}

/** Everything a delete would remove (owner 2026-10-16: testing only; Deactivate is the normal way). */
export interface MemberDeletePreview {
  account: number;
  name: string;
  status: ThriftPlusAccount['status'];
  is_practice: boolean;
  staff_member: string;
  people: { id: number; name: string; email: string; phone: string; role: string }[];
  emails: string[];
  sales: number;
  paid_sales: number;
  sales_total: string;
  training_sales: number;
  bucks: string;
  credit: string;
  ledger_rows: number;
  returns: number;
  scans: number;
  history: number;
  member_codes: number;
  sign_ins: number;
  passwords: number;
  consents: number;
  website_logins: { id: number; email: string; name: string }[];
  holds: number;
  active_holds: number;
  orders: number;
  conversations: number;
}

export interface StaffStartFreshPreview {
  memberships: number;
  sales: number;
  returns: number;
  scans: number;
  ledger_rows: number;
  rows: { account: number; name: string; staff_member: string; sales: number; bucks: string; credit: string }[];
  words: string;
}
