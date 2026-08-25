/**
 * Named parts orders: live cost ranges and the order-tile "value after" line.
 *
 * Labor uses the shared contract rate ($18 × 1.1 = $19.80), matching
 * EFFECTIVE_LABOR_RATE on the server.
 */
import type { RestorationPartDTO, RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { TARS_DEFAULT_HOURLY_RATE, TARS_PAYROLL_MULTIPLIER } from './tarsConstants';
import { PURCHASE_SECTIONS, type PurchaseSection } from './tarsPurchase';

export const OPEN_ORDER_STATUSES = ['requested', 'approved', 'purchased'] as const;
export const COMMITTED_ORDER_STATUSES = ['requested', 'approved', 'purchased', 'received'] as const;
export const SPEND_ORDER_STATUSES = ['purchased', 'received'] as const;
export const CLOSED_ORDER_STATUSES = ['denied', 'cancelled'] as const;

export const EFFECTIVE_LABOR_RATE = TARS_DEFAULT_HOURLY_RATE * TARS_PAYROLL_MULTIPLIER;

export const FINISH_BLOCKED_MESSAGE =
  'Parts are on order for this item. Receive or cancel the order before finishing.';

export interface TarsPartsRange {
  min: number;
  max: number;
}

export function moneyNumber(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export function isOpenPartsOrder(order: { status: string }): boolean {
  return (OPEN_ORDER_STATUSES as readonly string[]).includes(order.status);
}

export function isCommittedPartsOrder(order: { status: string }): boolean {
  return (COMMITTED_ORDER_STATUSES as readonly string[]).includes(order.status);
}

export function isSpendPartsOrder(order: { status: string }): boolean {
  return (SPEND_ORDER_STATUSES as readonly string[]).includes(order.status);
}

export function isLivePartsOrder(order: { status: string }): boolean {
  return !(CLOSED_ORDER_STATUSES as readonly string[]).includes(order.status);
}

/** Drafts go idle once a sibling is requested, approved, ordered, or received. */
export function isInactiveDraftOrder(
  order: { id: number; status: string },
  orders: Array<{ id: number; status: string }>,
): boolean {
  if (order.status !== 'draft') return false;
  return orders.some((other) => other.id !== order.id && isCommittedPartsOrder(other));
}

export function partsOrderStatusWord(order: {
  status: string;
  cancel_requested?: boolean;
  queued_behind?: number | null;
}): string {
  if (order.cancel_requested) return 'cancel asked';
  if (order.queued_behind) return 'queued';
  if (order.status === 'purchased') return 'ordered';
  return order.status;
}

export function laborCostForMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return (minutes / 60) * EFFECTIVE_LABOR_RATE;
}

/**
 * Ways this grade can be reached. Each live order is its own path.
 */
export function partsScenariosForGrade(
  orders: RestorationPartsOrderDTO[],
  grade: string,
): number[] {
  if (!grade) return [];
  return orders
    .filter((order) => isLivePartsOrder(order) && order.target_grade === grade)
    .map((order) => moneyNumber(order.parts_cost));
}

export type RequestIntent =
  | { kind: 'free' }
  | { kind: 'withdraw'; order: RestorationPartsOrderDTO }
  | { kind: 'askCancel'; order: RestorationPartsOrderDTO };

/** What Request does on this card, given the other orders on the item. */
export function requestIntent(
  orders: RestorationPartsOrderDTO[],
  target: RestorationPartsOrderDTO,
): RequestIntent {
  const others = orders.filter((order) => order.id !== target.id);
  const blocking = others.find((order) => order.status === 'approved' || order.status === 'purchased');
  if (blocking) return { kind: 'askCancel', order: blocking };
  const requested = others.find((order) => order.status === 'requested');
  if (requested) return { kind: 'withdraw', order: requested };
  return { kind: 'free' };
}

export function partsRangeForGrade(
  orders: RestorationPartsOrderDTO[],
  grade: string,
): TarsPartsRange | null {
  const scenarios = partsScenariosForGrade(orders, grade);
  if (scenarios.length === 0) return null;
  return { min: Math.min(...scenarios), max: Math.max(...scenarios) };
}

export function partsRangeByGrade(
  orders: RestorationPartsOrderDTO[],
): Record<string, TarsPartsRange> {
  const out: Record<string, TarsPartsRange> = {};
  const grades = new Set(
    orders
      .filter((order) => isLivePartsOrder(order) && order.target_grade)
      .map((order) => order.target_grade),
  );
  for (const grade of grades) {
    const range = partsRangeForGrade(orders, grade);
    if (range) out[grade] = range;
  }
  return out;
}

export function liveOrdersForGrade(
  orders: RestorationPartsOrderDTO[],
  grade: string,
): RestorationPartsOrderDTO[] {
  if (!grade) return [];
  return orders.filter((order) => isLivePartsOrder(order) && order.target_grade === grade);
}

export function spentPartsCost(orders: RestorationPartsOrderDTO[]): number {
  return orders.reduce((sum, order) => (
    isSpendPartsOrder(order) ? sum + moneyNumber(order.parts_cost) : sum
  ), 0);
}

/** Higher grade first (scale order), then dearer order first. */
export function sortOrdersForDesk(
  orders: RestorationPartsOrderDTO[],
  gradeOptions: string[],
): RestorationPartsOrderDTO[] {
  return [...orders].sort((a, b) => {
    const rankA = gradeOptions.indexOf(a.target_grade);
    const rankB = gradeOptions.indexOf(b.target_grade);
    const aPos = rankA === -1 ? gradeOptions.length : rankA;
    const bPos = rankB === -1 ? gradeOptions.length : rankB;
    if (aPos !== bPos) return aPos - bPos;
    return moneyNumber(b.total) - moneyNumber(a.total);
  });
}

export function orderNetValue(args: {
  targetValue: number | null;
  currentValue: number | null;
  laborMinutes: number;
  partsCost: number;
}): number | null {
  if (args.targetValue == null || args.currentValue == null) return null;
  return args.targetValue - args.currentValue - laborCostForMinutes(args.laborMinutes) - args.partsCost;
}

export function summarizePartsList(parts: RestorationPartDTO[]): Record<PurchaseSection, { count: number; cost: number }> & {
  all: { count: number; cost: number };
} {
  const empty = () => ({ count: 0, cost: 0 });
  const bySection: Record<PurchaseSection, { count: number; cost: number }> = {
    parts: empty(),
    supplies: empty(),
    ffe: empty(),
  };
  const all = empty();
  for (const part of parts) {
    const section = PURCHASE_SECTIONS.includes(part.category as PurchaseSection)
      ? (part.category as PurchaseSection)
      : 'parts';
    const cost = moneyNumber(part.line_total);
    bySection[section].count += 1;
    bySection[section].cost += cost;
    all.count += 1;
    all.cost += cost;
  }
  return { ...bySection, all };
}
