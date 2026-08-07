import { newId } from './tarsWorkRollup';
import type {
  TarsGradePlan,
  TarsPartLine,
  TarsProcurementGroup,
  TarsWorkSession,
} from './tarsWorkTypes';

/** @deprecated Legacy single fees bucket - shown as a normal order if present. */
export const PARTS_ORDER_FEES_SUPPLIER = 'Order fees';
export const PARTS_DRAWER_WIDTH = 740;

export interface TarsSessionPartRow {
  part: TarsPartLine;
  repairLabel: string;
  optionName: string;
}

export function partUnitPrice(part: TarsPartLine): number {
  return part.unitPriceActual > 0 ? part.unitPriceActual : part.unitPriceEstimate;
}

export function partLineTotal(part: TarsPartLine): number {
  return partUnitPrice(part) * (part.qty || 1);
}

export function orderPartQty(order: TarsProcurementGroup, part: TarsPartLine): number {
  const override = order.partQtyOverrides?.[part.id];
  if (override != null && override > 0) return override;
  return part.qty || 1;
}

export function orderPartLineTotal(order: TarsProcurementGroup, part: TarsPartLine): number {
  return partUnitPrice(part) * orderPartQty(order, part);
}

function sessionParts(session: TarsWorkSession): TarsPartLine[] {
  return session.parts ?? [];
}

export function collectSessionParts(session: TarsWorkSession): TarsSessionPartRow[] {
  return sessionParts(session).map((part) => ({ part, repairLabel: '', optionName: '' }));
}

function partsById(session: TarsWorkSession): Map<string, TarsPartLine> {
  return new Map(sessionParts(session).map((part) => [part.id, part]));
}

export function listSessionOrders(session: TarsWorkSession): TarsProcurementGroup[] {
  return session.orders ?? [];
}

export function orderPartsSubtotal(session: TarsWorkSession, order: TarsProcurementGroup): number {
  const lookup = partsById(session);
  return order.partIds.reduce((sum, id) => {
    const part = lookup.get(id);
    return part ? sum + orderPartLineTotal(order, part) : sum;
  }, 0);
}

function cleanOrderQtyOverrides(order: TarsProcurementGroup): TarsProcurementGroup {
  const overrides = order.partQtyOverrides ?? {};
  const partQtyOverrides: Record<string, number> = {};
  for (const id of order.partIds) {
    const qty = overrides[id];
    if (qty != null && qty > 0) partQtyOverrides[id] = qty;
  }
  return { ...order, partQtyOverrides };
}

export function orderFeesAmount(order: TarsProcurementGroup): number {
  return order.shipping + order.tax + order.fees;
}

export function orderGrandTotal(session: TarsWorkSession, order: TarsProcurementGroup): number {
  return orderPartsSubtotal(session, order) + orderFeesAmount(order);
}

export function newPartLine(): TarsPartLine {
  return {
    id: newId(),
    partNumber: '',
    description: '',
    url: '',
    qty: 1,
    unitPriceEstimate: 0,
    unitPriceActual: 0,
    status: 'considering',
    procurementGroupId: null,
  };
}

export function addSessionPart(session: TarsWorkSession): TarsWorkSession {
  return { ...session, parts: [...sessionParts(session), newPartLine()] };
}

export function addSessionParts(session: TarsWorkSession, parts: TarsPartLine[]): TarsWorkSession {
  if (parts.length === 0) return session;
  return { ...session, parts: [...sessionParts(session), ...parts] };
}

export function updateSessionPart(
  session: TarsWorkSession,
  partId: string,
  patch: Partial<TarsPartLine>,
): TarsWorkSession {
  return {
    ...session,
    parts: sessionParts(session).map((part) => (part.id === partId ? { ...part, ...patch } : part)),
  };
}

function stripPartFromOrders(session: TarsWorkSession, partId: string): TarsWorkSession {
  return {
    ...session,
    orders: listSessionOrders(session).map((g) => {
      const partQtyOverrides = { ...(g.partQtyOverrides ?? {}) };
      delete partQtyOverrides[partId];
      return {
        ...g,
        partIds: g.partIds.filter((id) => id !== partId),
        partQtyOverrides,
      };
    }),
  };
}

export function removeSessionPart(session: TarsWorkSession, partId: string): TarsWorkSession {
  const withoutPart = {
    ...session,
    parts: sessionParts(session).filter((part) => part.id !== partId),
  };
  return stripPartFromOrders(withoutPart, partId);
}

function linkPartsToOrder(session: TarsWorkSession, order: TarsProcurementGroup): TarsWorkSession {
  const partIdSet = new Set(order.partIds);
  return {
    ...session,
    parts: sessionParts(session).map((part) => {
      if (partIdSet.has(part.id)) return { ...part, procurementGroupId: order.id };
      if (part.procurementGroupId === order.id) return { ...part, procurementGroupId: null };
      return part;
    }),
  };
}

export function upsertSessionOrder(
  session: TarsWorkSession,
  order: TarsProcurementGroup,
): TarsWorkSession {
  const normalized = cleanOrderQtyOverrides(order);
  const orders = listSessionOrders(session);
  const exists = orders.some((g) => g.id === normalized.id);
  const nextOrders = exists
    ? orders.map((g) => (g.id === normalized.id ? normalized : g))
    : [...orders, normalized];
  return linkPartsToOrder({ ...session, orders: nextOrders }, normalized);
}

/** Drop an order id from every grade plan so eval cards never reference a deleted order. */
function pruneOrderFromGradePlans(session: TarsWorkSession, orderId: string): TarsWorkSession {
  const gradePlans = session.gradePlans ?? {};
  const next: typeof gradePlans = {};
  for (const [grade, plan] of Object.entries(gradePlans)) {
    next[grade] = { ...plan, orderIds: (plan.orderIds ?? []).filter((id) => id !== orderId) };
  }
  return { ...session, gradePlans: next };
}

export function removeSessionOrder(session: TarsWorkSession, orderId: string): TarsWorkSession {
  const orders = listSessionOrders(session).filter((g) => g.id !== orderId);
  const unlinked = linkPartsToOrder({ ...session, orders }, {
    id: orderId,
    supplierName: '',
    cartUrl: '',
    shipping: 0,
    tax: 0,
    fees: 0,
    notes: '',
    partIds: [],
  });
  return pruneOrderFromGradePlans(unlinked, orderId);
}

export function partsSubtotal(session: TarsWorkSession): number {
  return sessionParts(session).reduce((sum, part) => sum + partLineTotal(part), 0);
}

export function allOrdersFeesTotal(session: TarsWorkSession): number {
  return listSessionOrders(session).reduce((sum, g) => sum + orderFeesAmount(g), 0);
}

export function partsGrandTotal(session: TarsWorkSession): number {
  return partsSubtotal(session) + allOrdersFeesTotal(session);
}

export function gradePlanFor(session: TarsWorkSession, grade: string): TarsGradePlan {
  return session.gradePlans?.[grade] ?? { estimateHours: 0, orderIds: [] };
}

function setGradePlan(
  session: TarsWorkSession,
  grade: string,
  patch: Partial<TarsGradePlan>,
): TarsWorkSession {
  const plan = gradePlanFor(session, grade);
  return {
    ...session,
    gradePlans: { ...(session.gradePlans ?? {}), [grade]: { ...plan, ...patch } },
  };
}

export function setGradePlanHours(
  session: TarsWorkSession,
  grade: string,
  hours: number,
): TarsWorkSession {
  return setGradePlan(session, grade, { estimateHours: Number.isFinite(hours) && hours > 0 ? hours : 0 });
}

export function toggleGradeOrder(
  session: TarsWorkSession,
  grade: string,
  orderId: string,
): TarsWorkSession {
  const plan = gradePlanFor(session, grade);
  const has = plan.orderIds.includes(orderId);
  const orderIds = has ? plan.orderIds.filter((id) => id !== orderId) : [...plan.orderIds, orderId];
  return setGradePlan(session, grade, { orderIds });
}

export function attachGradeOrder(
  session: TarsWorkSession,
  grade: string,
  orderId: string,
): TarsWorkSession {
  const plan = gradePlanFor(session, grade);
  if (plan.orderIds.includes(orderId)) return session;
  return setGradePlan(session, grade, { orderIds: [...plan.orderIds, orderId] });
}
