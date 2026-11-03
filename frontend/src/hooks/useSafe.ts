/**
 * The safe and the office cash (Retail 5 step 1, 2026-11-02): owner and managers only. `useSafe` feeds the Cash page's
 * Safe card and the bell's "swap with the safe" alert.
 */
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import type { CashCount } from '../utils/cashCounts';

export interface SafeLineRow {
  id: number;
  kind: 'swap' | 'count';
  at: string;
  who: string | null;
  /** A count's pieces: the owner only. */
  into_safe: CashCount | null;
  into_total: string;
  out_of_safe: CashCount;
  out_total: string;
  /** Counted less what Dash had: the owner only. */
  difference: string | null;
  note: string;
}

export interface SafeData {
  owner: boolean;
  /** By bill and coin for the owner only (a manager's count stays blind). */
  safe: { balance: CashCount | null; total: string; last_counted_at: string | null; last_counted_by: string | null };
  office: { balance: CashCount; total: string } | null;
  target: { count: CashCount; total: string; cap: string | null } | null;
  needs_swap: boolean;
  short: CashCount;
  over_cap: boolean;
  suggested: { take_from_safe: CashCount; put_in_safe: CashCount };
  lines: SafeLineRow[];
}

export const SAFE_KEY = ['pos-safe'];

export function useSafe(enabled = true) {
  return useQuery({
    queryKey: SAFE_KEY,
    queryFn: async () => (await api.get<SafeData>('/pos/safe/')).data,
    enabled,
    refetchInterval: 5 * 60_000,
  });
}

export const safeSwap = (put_in_safe: CashCount, take_from_safe: CashCount, note = '') =>
  api.post<SafeData>('/pos/safe/swap/', { put_in_safe, take_from_safe, note });

export const safeCount = (count: CashCount) =>
  api.post<SafeData & { counted: SafeLineRow }>('/pos/safe/count/', { count });

export const safeTarget = (count: CashCount, cap: string) =>
  api.put<SafeData>('/pos/safe/target/', { count, cap: cap.trim() || null });

/** A bag a deposit can cover (Retail 5 step 2): a drawer's cash drop or its close-out drop. */
export interface DepositBagRow {
  kind: 'drop' | 'close_out';
  ref: number;
  at: string;
  register: string;
  total: string;
  count: CashCount;
  note: string;
}

export interface PendingDeposit {
  id: number;
  at: string;
  who: string | null;
  total: string;
  status: string;
  source: string;
  bags_total: string | null;
  difference: string | null;
  bags: number;
}

export const BANK_KEY = ['pos-bank-deposit'];

export function useBankDeposits(enabled = true) {
  return useQuery({
    queryKey: BANK_KEY,
    queryFn: async () =>
      (await api.get<{ bags: DepositBagRow[]; pending: PendingDeposit[] }>('/pos/bank/deposit/')).data,
    enabled,
  });
}

export const recordDeposit = (bags: { kind: string; ref: number }[], count: CashCount, source: 'office' | 'safe', note = '') =>
  api.post<{ bags: DepositBagRow[]; pending: PendingDeposit[] }>('/pos/bank/deposit/', { bags, count, source, note });

/** Change from the bank (Retail 5 step 3): the bills and coins that came back, into the office or the safe. */
export const recordChange = (count: CashCount, into: 'office' | 'safe', note = '') =>
  api.post('/pos/bank/change/', { count, into, note });
