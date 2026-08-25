import type { RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { moneyNumber } from '../tars/tarsPartsOrders';

export type HistoryWindow = '90d' | 'year' | 'all';
export type HistoryStatusFilter = 'all' | 'completed' | 'cancelled';

export interface HistoryItemGroup {
  job: number;
  sku: string;
  name: string;
  startingGrade: string;
  finalGrade: string;
  valueAdded: number | null;
  spent: number;
  orderCount: number;
  settledAt: string | null;
  finished: boolean;
  orders: RestorationPartsOrderDTO[];
}

export function sinceForWindow(window: HistoryWindow, now = new Date()): string | undefined {
  if (window === 'all') return undefined;
  if (window === 'year') return `${now.getFullYear()}-01-01`;
  const day = new Date(now);
  day.setDate(day.getDate() - 90);
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function orderSpend(order: RestorationPartsOrderDTO): number {
  if (order.status === 'denied') return 0;
  if (order.status === 'cancelled' && (!order.purchased_at || order.refunded)) return 0;
  if (order.status === 'cancelled' || order.status === 'purchased' || order.status === 'received') {
    return moneyNumber(order.parts_cost);
  }
  return 0;
}

export function groupHistoryByItem(orders: RestorationPartsOrderDTO[]): HistoryItemGroup[] {
  const byJob = new Map<number, RestorationPartsOrderDTO[]>();
  for (const order of orders) {
    const list = byJob.get(order.job) ?? [];
    list.push(order);
    byJob.set(order.job, list);
  }
  const groups: HistoryItemGroup[] = [];
  for (const [job, rows] of byJob) {
    const first = rows[0];
    const finished = first.job_stage === 'done';
    const spent =
      finished && first.job_spent_parts_cost != null
        ? moneyNumber(first.job_spent_parts_cost)
        : rows.reduce((sum, row) => sum + orderSpend(row), 0);
    const settledAt =
      first.job_dispositioned_at ||
      rows.reduce<string | null>((latest, row) => {
        const when = row.received_at || row.updated_at;
        if (!latest || when > latest) return when;
        return latest;
      }, null);
    groups.push({
      job,
      sku: first.job_sku || `Job ${job}`,
      name: first.job_name,
      startingGrade: finished ? first.job_starting_grade : '',
      finalGrade: finished ? first.job_final_grade : '',
      valueAdded: finished && first.job_value_added != null ? moneyNumber(first.job_value_added) : null,
      spent,
      orderCount: rows.length,
      settledAt,
      finished,
      orders: rows.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || '')),
    });
  }
  return groups.sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return (b.settledAt || '').localeCompare(a.settledAt || '');
  });
}

export function summarizeHistory(groups: HistoryItemGroup[]): {
  items: number;
  spent: number;
  valueAdded: number;
  finished: number;
} {
  const spent = groups.reduce((sum, group) => sum + group.spent, 0);
  const valueAdded = groups.reduce((sum, group) => sum + (group.valueAdded ?? 0), 0);
  return {
    items: groups.length,
    spent,
    valueAdded,
    finished: groups.filter((group) => group.finished).length,
  };
}

export function filterHistoryGroups(
  groups: HistoryItemGroup[],
  status: HistoryStatusFilter,
  search: string,
): HistoryItemGroup[] {
  const query = search.trim().toLowerCase();
  return groups.filter((group) => {
    if (status === 'completed' && !group.finished) return false;
    if (status === 'cancelled' && group.finished) return false;
    if (!query) return true;
    return (
      group.sku.toLowerCase().includes(query) ||
      group.name.toLowerCase().includes(query) ||
      group.orders.some((order) => order.name.toLowerCase().includes(query))
    );
  });
}
