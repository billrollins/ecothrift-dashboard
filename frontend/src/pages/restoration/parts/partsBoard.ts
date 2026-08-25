import type { PartsOrderAttention, RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { moneyNumber } from '../tars/tarsPartsOrders';

export type PartsLaneId = 'requested' | 'approved' | 'ordered' | 'received';
export type AttentionKey = 'cancel_ask' | 'approval' | 'to_place' | 'late' | 'review';

export const PARTS_LANES: Array<{ id: PartsLaneId; status: RestorationPartsOrderDTO['status']; label: string }> = [
  { id: 'requested', status: 'requested', label: 'Requested' },
  { id: 'approved', status: 'approved', label: 'Approved' },
  { id: 'ordered', status: 'purchased', label: 'Ordered' },
  { id: 'received', status: 'received', label: 'Received' },
];

export const ATTENTION_KEYS: AttentionKey[] = ['cancel_ask', 'approval', 'to_place', 'late', 'review'];

export const ATTENTION_LABELS: Record<AttentionKey, string> = {
  cancel_ask: 'Cancel',
  approval: 'Approve',
  to_place: 'Place',
  late: 'Late',
  review: 'Review',
};

export function laneForOrder(order: RestorationPartsOrderDTO): PartsLaneId | null {
  if (order.status === 'requested') return 'requested';
  if (order.status === 'approved') return 'approved';
  if (order.status === 'purchased') return 'ordered';
  if (order.status === 'received') return 'received';
  return null;
}

export function attentionRank(attention: PartsOrderAttention): number {
  if (attention === 'cancel_ask') return 0;
  if (attention === 'approval') return 1;
  if (attention === 'to_place') return 2;
  if (attention === 'late') return 3;
  if (attention === 'review') return 4;
  return 5;
}

export function sortLaneOrders(orders: RestorationPartsOrderDTO[]): RestorationPartsOrderDTO[] {
  return [...orders].sort((a, b) => {
    const byAttention = attentionRank(a.attention) - attentionRank(b.attention);
    if (byAttention !== 0) return byAttention;
    const aWhen = a.requested_at || a.purchased_at || a.updated_at || '';
    const bWhen = b.requested_at || b.purchased_at || b.updated_at || '';
    return aWhen.localeCompare(bWhen);
  });
}

export function attentionCounts(orders: RestorationPartsOrderDTO[]): Record<AttentionKey, number> {
  const counts: Record<AttentionKey, number> = {
    cancel_ask: 0,
    approval: 0,
    to_place: 0,
    late: 0,
    review: 0,
  };
  for (const order of orders) {
    if (order.attention && order.attention in counts) {
      counts[order.attention as AttentionKey] += 1;
    }
  }
  return counts;
}

/** Waiting work on the Parts Requests nav badge and workspace pip. */
export function partsNavWaitingCount(orders: RestorationPartsOrderDTO[]): number {
  return orders.filter(
    (order) =>
      order.attention === 'approval' ||
      order.attention === 'cancel_ask' ||
      order.attention === 'review' ||
      order.needs_review ||
      order.cancel_requested,
  ).length;
}

export function filterByAttention(
  orders: RestorationPartsOrderDTO[],
  filter: AttentionKey | '',
): RestorationPartsOrderDTO[] {
  if (!filter) return orders;
  return orders.filter((order) => order.attention === filter);
}

export function ordersForLane(
  orders: RestorationPartsOrderDTO[],
  lane: PartsLaneId,
): RestorationPartsOrderDTO[] {
  return sortLaneOrders(orders.filter((order) => laneForOrder(order) === lane));
}

export function laneTotal(orders: RestorationPartsOrderDTO[]): number {
  return orders.reduce((sum, order) => sum + moneyNumber(order.total), 0);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const when = new Date(year, month - 1, day);
  return `${WEEKDAYS[when.getDay()]} ${MONTHS[when.getMonth()]} ${when.getDate()}`;
}

export function timingLine(order: RestorationPartsOrderDTO, now = Date.now()): string {
  if (order.days_late && order.days_late > 0 && order.status === 'purchased') {
    return `${order.days_late} day${order.days_late === 1 ? '' : 's'} late`;
  }
  if (order.expected_delivery_on && (order.status === 'purchased' || order.status === 'received')) {
    return `arriving ${formatShortDate(order.expected_delivery_on)}`;
  }
  const asked = order.requested_at || order.created_at;
  if (!asked) return '';
  const days = Math.max(0, Math.floor((now - new Date(asked).getTime()) / 86_400_000));
  if (days === 0) return 'asked today';
  if (days === 1) return 'asked 1d ago';
  return `asked ${days}d ago`;
}

export type PartsOwnerAction =
  | 'accept_deny'
  | 'order_or_cancel'
  | 'deliver_or_revise'
  | 'resolve_cancel'
  | 'review'
  | 'none';

export function partsOwnerAction(order: RestorationPartsOrderDTO): PartsOwnerAction {
  if (order.cancel_requested) return 'resolve_cancel';
  if (order.status === 'requested') return 'accept_deny';
  if (order.status === 'approved') return 'order_or_cancel';
  if (order.status === 'purchased') return 'deliver_or_revise';
  if (order.status === 'received' && order.review_state !== 'reviewed') return 'review';
  if (order.needs_review || order.attention === 'review') return 'review';
  return 'none';
}

export function attentionRibbon(attention: PartsOrderAttention): string {
  if (attention === 'cancel_ask') return 'Cancel ask';
  if (attention === 'approval') return 'Needs approval';
  if (attention === 'to_place') return 'Place the order';
  if (attention === 'late') return 'Late';
  if (attention === 'review') return 'Needs review';
  return 'Clear';
}
