import type { AxiosRequestConfig } from 'axios';
import type {
  CardBatch,
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
