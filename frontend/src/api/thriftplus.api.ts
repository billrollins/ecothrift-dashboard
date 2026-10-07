import type { AxiosRequestConfig } from 'axios';
import type {
  CalculatorChoices,
  CalculatorResult,
  CardBatch,
  FloorCompare,
  FloorPlan,
  FloorPlanChoices,
  ItemRewardDetail,
  NewMember,
  RewardPreview,
  RewardRunSummary,
  ThriftPlusAccount,
} from '../types/thriftplus.types';
import api from './client';

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

export async function findMembers(q: string): Promise<ThriftPlusAccount[]> {
  const { data } = await api.get<ThriftPlusAccount[]>('/thriftplus/accounts/', { params: { q } });
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

export async function addSecondAdult(
  accountId: number,
  body: NewMember & { both_present: boolean; primary_approves: boolean },
): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/accounts/${accountId}/second-adult/`, memberForm(body), MULTIPART);
  return data;
}

/** Mark a membership as a staff member's own (no cover while the owner's switch is on), or not (null). */
export async function setMemberStaff(accountId: number, userId: number | null): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/accounts/${accountId}/staff/`, { user: userId });
  return data;
}

export async function revokeMember(accountId: number, reason: string): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/accounts/${accountId}/revoke/`, { reason });
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

export async function issueCard(personId: number, code: string): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/people/${personId}/issue-card/`, { code });
  return data;
}

export async function removeSecondAdult(personId: number, removedBy: 'primary' | 'self'): Promise<ThriftPlusAccount> {
  const { data } = await api.post<ThriftPlusAccount>(`/thriftplus/people/${personId}/remove/`, { removed_by: removedBy });
  return data;
}

export async function killCard(cardId: number, reason: string): Promise<void> {
  await api.post(`/thriftplus/cards/${cardId}/kill/`, { reason });
}

export async function fetchCardBatches(): Promise<CardBatch[]> {
  const { data } = await api.get<CardBatch[] | { results: CardBatch[] }>('/thriftplus/card-batches/');
  return Array.isArray(data) ? data : data.results;
}

export async function createCardBatch(size: number, note: string): Promise<CardBatch> {
  const { data } = await api.post<CardBatch>('/thriftplus/card-batches/', { size, note });
  return data;
}

/** The batch's blank backs as print-server jobs of at most 10 pages each (base64 PDFs). */
export async function fetchCardBackJobs(batchId: number): Promise<{ cards: number; jobs: string[] }> {
  const { data } = await api.get<{ cards: number; jobs: string[] }>(`/thriftplus/card-batches/${batchId}/backs/`, { params: { jobs: 1 } });
  return data;
}

export async function fetchCardBacksPdf(batchId: number): Promise<Blob> {
  const { data } = await api.get<Blob>(`/thriftplus/card-batches/${batchId}/backs/`, { responseType: 'blob' });
  return data;
}

export async function markBatchPrinted(batchId: number): Promise<CardBatch> {
  const { data } = await api.post<CardBatch>(`/thriftplus/card-batches/${batchId}/mark-printed/`, {});
  return data;
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

export interface MemberMoney {
  banked: string;
  credit: string;
  cover: { month: string; amount: string; covered: string; remaining: string; is_covered: boolean; resets_on: string };
  entries: {
    id: number;
    kind: 'cover' | 'bank' | 'credit';
    amount: string;
    month: string;
    reason: string;
    cart: number | null;
    sku: string;
    note: string;
    actor: string;
    created_at: string;
  }[];
}

/** A membership's cover, banked rewards, store credit and ledger (Phase 4). */
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
  members: { active: number; revoked: number; people: number; verified_18: number; cards_active: number; cards_blank: number; signups: { day: string; n: number }[] };
  sales: { member_sales: number; member_revenue: string; guest_sales: number; guest_revenue: string };
  rewards: { instant: string; to_cover: string; banked: string; credit_from_returns: string };
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
export async function fetchCalculator(choices: CalculatorChoices): Promise<CalculatorResult> {
  const params: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(choices)) {
    if (v === null || v === undefined || v === '') continue;
    params[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  const { data } = await api.get<CalculatorResult>('/thriftplus/rewards/calculator/', { params });
  return data;
}
