import type { AxiosRequestConfig } from 'axios';
import type {
  CalculatorChoices,
  CalculatorResult,
  EngineSaved,
  EngineState,
  FamiliesQueue,
  FamilyStatus,
  FloorCompare,
  FloorPlan,
  FloorPlanChoices,
  ItemRewardDetail,
  MemberDeletePreview,
  NewMember,
  RewardPreview,
  RewardRunSummary,
  StaffStartFreshPreview,
  ThriftPlusAccount,
} from '../types/thriftplus.types';
import api from './client';
import type { LoginCandidate } from './accounts.api';

/** Let the browser set the multipart boundary (the client defaults to JSON). */
const MULTIPART: AxiosRequestConfig = {
  transformRequest: [
    (body, headers) => {
      if (body instanceof FormData) delete headers['Content-Type'];
      return body;
    },
  ],
};

function memberForm(body: NewMember & { both_present?: boolean; primary_approves?: boolean }): FormData {
  const form = new FormData();
  Object.entries(body).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (v instanceof File) form.append(k, v);
    else form.append(k, String(v));
  });
  return form;
}

/** Members by member code, phone, email or name. ``status: 'pending'``: the online joins to finish at a register. */
export async function findMembers(q: string, status?: ThriftPlusAccount['status']): Promise<ThriftPlusAccount[]> {
  const { data } = await api.get<ThriftPlusAccount[]>('/thriftplus/accounts/', { params: status ? { q, status } : { q } });
  return data;
}

export async function fetchMember(id: number): Promise<ThriftPlusAccount> {
  const { data } = await api.get<ThriftPlusAccount>(`/thriftplus/accounts/${id}/`);
  return data;
}

export async function createMember(body: NewMember): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>('/thriftplus/accounts/', memberForm(body), MULTIPART);
  return data;
}

/** A practice member for training (2026-10-10): a 555 phone and a made-up member code. */
export async function makePracticeMember(firstName = ''): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>('/thriftplus/accounts/practice/', { first_name: firstName });
  return data;
}

export async function addSecondAdult(
  accountId: number,
  body: NewMember & { both_present: boolean; primary_approves: boolean },
): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/accounts/${accountId}/second-adult/`, memberForm(body), MULTIPART);
  return data;
}

/** Mark a membership as a staff member's own (J6), or not (null). */
export async function setMemberStaff(accountId: number, userId: number | null): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/accounts/${accountId}/staff/`, { user: userId });
  return data;
}

// ── Staff memberships (owner 2026-10-15) ───────────────────────────────────────

/** ThriftBucks (a number, never "$") and Thrift+ credit (dollars) on a membership. */
export interface StaffMoney {
  bucks: string;
  credit: string;
}

/** A customer membership that may be the staff member's: why it matched, and what is on it. The email is masked. */
export interface StaffSuggestion extends StaffMoney {
  account_id: number;
  status: ThriftPlusAccount['status'];
  name: string;
  email: string;
  why: string[];
}

export interface StaffMemberRow {
  user_id: number;
  name: string;
  email: string;
  role: string;
  membership: (StaffMoney & { id: number; status: ThriftPlusAccount['status']; name: string; email: string }) | null;
  suggestions: StaffSuggestion[];
  /** Their website customer account (owner 2026-10-15: every staff login is a website customer too), or none yet. */
  website?: { customer_number: string } | null;
  /** Customer logins (another email) that may be theirs: "Merge a customer login…". */
  login_suggestions?: LoginCandidate[];
}

export interface StaffMemberships {
  staff: StaffMemberRow[];
  /** Staff members with no membership yet. */
  missing: number;
  /** Staff members with no website customer account yet. */
  website_missing?: number;
  /** Staff members missing either one: "Create missing (N)" makes both. */
  missing_any?: number;
  /** The owner (superuser): create the missing ones and merge. */
  can_merge: boolean;
}

/** What "Create missing" made: Thrift+ memberships (made or linked by email) and website customer accounts. */
export type StaffCreateMissingResult = StaffMemberships & {
  made: number;
  linked: number;
  customers_made?: number;
  customers_fixed?: number;
};

/** What a merge would do; nothing changes. */
export interface StaffMergePreview extends StaffMoney {
  staff_account: number | null;
  source_account: number;
  source_name: string;
  /** Active member codes that move (their app QR keeps working at the register). */
  codes: number;
  second_adult: string | null;
  moves: Record<string, number>;
  /** What the staff person takes from the customer person (only what they have none of). */
  takes: string[];
  /** The customer person has an older member login (it is removed). */
  login: boolean;
}

export interface StaffMergeResult {
  staff_account: number;
  source_account: number;
  moved: Record<string, number>;
  took: string[];
  second_adult: string | null;
  login_removed: boolean;
  signed_out: number;
  email_links_removed: number;
  source_had: StaffMoney;
  /** The staff membership after the merge. */
  now: StaffMoney;
}

/** Every active staff member, their own membership (or none), and customer memberships that may be theirs. */
export async function fetchStaffMemberships(): Promise<StaffMemberships> {
  const { data } = await api.get<StaffMemberships>('/thriftplus/staff-memberships/');
  return data;
}

/** The owner: for every staff member missing one, a website customer account and a Thrift+ membership (linked by
 * email, or made). */
export async function createMissingStaffMemberships(): Promise<StaffCreateMissingResult> {
  const { data } = await api.post<StaffCreateMissingResult>('/thriftplus/staff-memberships/create-missing/', {});
  return data;
}

export async function fetchStaffMergePreview(staffUser: number, sourceAccount: number): Promise<StaffMergePreview> {
  const { data } = await api.get<StaffMergePreview>('/thriftplus/staff-memberships/merge-preview/', {
    params: { staff_user: staffUser, source_account: sourceAccount },
  });
  return data;
}

/** The owner: merge a customer membership into the staff member's own (the staff membership survives). */
export async function mergeIntoStaff(staffUser: number, sourceAccount: number): Promise<StaffMergeResult> {
  const { data } = await api.post<StaffMergeResult>('/thriftplus/staff-memberships/merge/', {
    staff_user: staffUser, source_account: sourceAccount,
  });
  return data;
}

export async function revokeMember(accountId: number, reason: string): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/accounts/${accountId}/revoke/`, { reason });
  return data;
}

/** Deactivate: the normal way to take a member off; Reactivate undoes it (owner 2026-10-16). */
export async function deactivateMember(accountId: number, reason = ''): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/accounts/${accountId}/deactivate/`, { reason });
  return data;
}

export async function reactivateMember(accountId: number): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/accounts/${accountId}/reactivate/`, {});
  return data;
}

/** Superuser, testing only: what deleting the member would remove (changes nothing). */
export async function fetchMemberDeletePreview(accountId: number): Promise<MemberDeletePreview> {
  const { data } = await api.get<MemberDeletePreview>(`/thriftplus/accounts/${accountId}/delete-preview/`);
  return data;
}

/** Superuser, testing only: delete the member and everything they left. `name` must be typed to match. */
export async function deleteMember(accountId: number, name: string): Promise<MemberDeletePreview & { items_back: number }> {
  const { data } = await api.post<MemberDeletePreview & { items_back: number }>(`/thriftplus/accounts/${accountId}/delete/`, { name });
  return data;
}

/** Superuser: what "Start staff memberships fresh" would delete. */
export async function fetchStaffStartFresh(): Promise<StaffStartFreshPreview> {
  const { data } = await api.get<StaffStartFreshPreview>('/thriftplus/staff-memberships/start-fresh/');
  return data;
}

/** Superuser: delete every staff membership and make each staff member a fresh one. */
export async function staffStartFresh(typed: string): Promise<StaffMemberships & { deleted: number; made: number; linked: number }> {
  const { data } = await api.post<StaffMemberships & { deleted: number; made: number; linked: number }>(
    '/thriftplus/staff-memberships/start-fresh/', { typed },
  );
  return data;
}

export async function verifyPerson(personId: number, verified18: boolean): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/people/${personId}/verify/`, { verified_18: verified18 });
  return data;
}

export async function setPersonPhoto(personId: number, photo: File): Promise<ThriftPlusAccount> {
  const form = new FormData();
  form.append('photo', photo);
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/people/${personId}/photo/`, form, MULTIPART);
  return data;
}

/** The one line under the sign-up's email field (T74: no boxes). */
export async function fetchEmailNote(): Promise<{ note: string }> {
  const { data } = await api.get<{ note: string }>('/thriftplus/accounts/email-note/');
  return data;
}

/** Turn a member's store news emails off or back on, when they ask. */
export async function setPersonNews(personId: number, on: boolean): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/people/${personId}/news/`, { on });
  return data;
}

/** Add or change a member's email address (blank removes it). */
export async function setPersonEmail(personId: number, email: string): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/people/${personId}/email/`, { email });
  return data;
}

/**
 * Send the Thrift+ app link (owner 2026-10-15, J12): sets the email first when one is given, then a join email (or a
 * sign-in email once the address is confirmed). Answers the membership, with what was sent and to whom (masked).
 */
export async function sendMemberEmailLink(
  personId: number,
  email?: string,
): Promise<ThriftPlusAccount & { sent: 'join' | 'sign_in'; sent_to: string }> {
  const { data } = await api.post<ThriftPlusAccount & { sent: 'join' | 'sign_in'; sent_to: string }>(
    `/thriftplus/members/${personId}/email-link/`, email ? { email } : {},
  );
  return data;
}

export async function removeSecondAdult(personId: number, removedBy: 'primary' | 'self'): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/people/${personId}/remove/`, { removed_by: removedBy });
  return data;
}

/** Stop a member code at once (staff: Replace member code). The member's app then shows a new one. */
export async function killCard(cardId: number, reason: string): Promise<void> {
  await api.post(`/thriftplus/cards/${cardId}/kill/`, { reason });
}

/** What members would pay on a day (default tomorrow): the reward engine's dry run. */
export async function fetchRewardPreview(day?: string): Promise<RewardPreview> {
  const { data } = await api.get<RewardPreview>('/thriftplus/rewards/preview/', { params: day ? { day } : {} });
  return data;
}

export async function fetchItemReward(sku: string): Promise<ItemRewardDetail> {
  const { data } = await api.get<ItemRewardDetail>('/thriftplus/rewards/item/', { params: { sku } });
  return data;
}

export async function fetchRewardRuns(): Promise<RewardRunSummary[]> {
  const { data } = await api.get<RewardRunSummary[]>('/thriftplus/rewards/runs/');
  return data;
}

/** One amount of kept ThriftBucks and its use-by date (B2, B5), soonest first; the scanner portal's shape. */
export interface MemberBucksLot {
  amount: string;
  earned_on: string;
  use_by: string;
  past_due?: boolean;
}

export interface MemberMoney {
  /** Kept ThriftBucks (a number, never "$"). */
  banked: string;
  /** Kept ThriftBucks usable today (collected before today, not past use-by). */
  available?: string;
  /** Thrift+ credit (dollars; refund money, never expires). */
  credit: string;
  /** Kept ThriftBucks by use-by date, soonest first. */
  lots?: MemberBucksLot[];
  entries: {
    id: number;
    /** 'cover' rows are history from before 10-12. */
    kind: 'cover' | 'bank' | 'credit';
    amount: string;
    month?: string;
    reason: string;
    cart: number | null;
    sku: string;
    note: string;
    actor: string;
    created_at: string;
    /** A ThriftBucks row's use-by date, when the server sends it. */
    use_by?: string | null;
  }[];
}

/** A membership's ThriftBucks (with use-by dates), Thrift+ credit and ledger. */
export async function fetchMemberMoney(accountId: number): Promise<MemberMoney> {
  const { data } = await api.get<MemberMoney>(`/thriftplus/accounts/${accountId}/money/`);
  return data;
}

export async function adjustMemberMoney(accountId: number, body: { kind: 'credit' | 'bank'; amount: string; note: string }): Promise<MemberMoney> {
  const { data } = await api.post<MemberMoney>(`/thriftplus/accounts/${accountId}/adjust/`, body);
  return data;
}

export interface ThriftPlusOverview {
  days: number;
  members: {
    active: number; revoked: number; people: number; verified_18: number; signups: { day: string; n: number }[];
    /** Joined online, not finished at a register (J8): counted apart, never as members. */
    pending?: number;
    /** Of those, joined in the last ``days``. */
    pending_new?: number;
  };
  sales: { member_sales: number; member_revenue: string; guest_sales: number; guest_revenue: string };
  rewards: {
    /** Dollars off today's price from instant redemptions. */
    instant: string;
    /** ThriftBucks collected and kept. */
    banked: string;
    /** Kept ThriftBucks used at the register. */
    used?: string;
    /** ThriftBucks that expired unused: Thrift+ income (F4). */
    expired?: string;
    /** Thrift+ credit given on 3-day returns (dollars). */
    credit_from_returns: string;
  };
  /** What the store owes members now (B9): unexpired ThriftBucks, and Thrift+ credit. */
  owed: { banked: string; credit: string };
  returns: { count: number; waiting: number };
  scanner: { scans: number; adds: number; passes: number; add_rate: number | null; items_scanned: number; price_feedback: number };
}

/** The owner's Thrift+ numbers, last 30 days (Phase 4). */
export async function fetchThriftOverview(): Promise<ThriftPlusOverview> {
  const { data } = await api.get<ThriftPlusOverview>('/thriftplus/rewards/overview/');
  return data;
}

function floorParams(c: FloorPlanChoices): Record<string, string | number> {
  const p: Record<string, string | number> = { launch: c.launch, offset: c.offset, wait_days: c.wait_days, horizon: c.horizon };
  if (c.max_age != null) p.max_age = c.max_age;
  if (c.floor_share != null) p.floor_share = c.floor_share;
  return p;
}

/** What members would pay for the stock on the floor under these choices. Changes nothing. */
export async function fetchFloorPlan(choices: FloorPlanChoices): Promise<FloorPlan> {
  const { data } = await api.get<FloorPlan>('/thriftplus/rewards/floor-plan/', { params: floorParams(choices) });
  return data;
}

/** The usual options side by side, at launch and a few weeks after. */
export async function fetchFloorCompare(choices: FloorPlanChoices): Promise<FloorCompare> {
  const { data } = await api.get<FloorCompare>('/thriftplus/rewards/floor-plan/compare/', { params: floorParams(choices) });
  return data;
}

/** The rewards calculator: the last inventory's stock under these rules (what-if only, nothing changes). */
/** The engine's saved setting and what it runs on (owner 2026-10-13). */
export async function fetchEngine(): Promise<EngineState> {
  const { data } = await api.get<EngineState>('/thriftplus/rewards/engine/');
  return data;
}

/** Save the calculator's setting for the engine (the owner). Before launch it also rebuilds launch day. */
export async function saveEngine(body: { pct_per_day: number; wait_days: number; launch: string; age_factor: number; max_age: number | null; floor_share: number }): Promise<EngineSaved> {
  const { data } = await api.post<EngineSaved>('/thriftplus/rewards/engine/', body);
  return data;
}

export async function fetchCalculator(choices: CalculatorChoices): Promise<CalculatorResult> {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(choices)) {
    if (v === null || v === undefined || v === '') continue;
    params[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  const { data } = await api.get<CalculatorResult>('/thriftplus/rewards/calculator/', { params });
  return data;
}

// ── Pricing families (thrift_plus_families Phase 1, owner 2026-10-13) ──────────

export async function fetchFamilies(params: { status: FamilyStatus; band?: string; flag?: string; q?: string; offset?: number }): Promise<FamiliesQueue> {
  const { data } = await api.get<FamiliesQueue>('/thriftplus/families/', { params });
  return data;
}

export async function decideFamily(id: number, action: 'approve' | 'not_family' | 'exit' | 'reopen', target?: number) {
  const { data } = await api.post<{ id: number; status: FamilyStatus }>(`/thriftplus/families/${id}/decide/`, { action, target });
  return data;
}

export async function bulkApproveFamilies(ids: number[]) {
  const { data } = await api.post<{ approved: number; skipped: number }>('/thriftplus/families/bulk/', { ids });
  return data;
}

export async function markRestNotFamily() {
  const { data } = await api.post<{ marked: number }>('/thriftplus/families/rest/', {});
  return data;
}

export async function findFamilies() {
  const { data } = await api.post<{ products: number; new: number }>('/thriftplus/families/find/', {});
  return data;
}
