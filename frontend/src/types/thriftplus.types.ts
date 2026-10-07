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
  status: 'active' | 'revoked';
  notes: string;
  revoked_at: string | null;
  revoked_reason: string;
  created_at: string;
  people: ThriftPlusPerson[];
  /** A staff member's own membership; ``free`` = no monthly cover now (the owner's switch is on). */
  staff?: { id: number; name: string; free: boolean } | null;
  /** Detail only. */
  events?: ThriftPlusEvent[];
}

export interface CardBatch {
  id: number;
  size: number;
  note: string;
  printed_at: string | null;
  created_at: string;
  unissued: number;
  active: number;
}

export interface NewMember {
  first_name: string;
  last_name?: string;
  phone?: string;
  id_checked?: boolean;
  verified_18?: boolean;
  card_code?: string;
  photo?: File | null;
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
