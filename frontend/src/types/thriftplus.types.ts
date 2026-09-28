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
