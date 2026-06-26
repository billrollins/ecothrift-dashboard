import { createRepairAction } from './tarsWorkDefaults';
import { newId } from './tarsWorkRollup';
import type {
  TarsPartLine,
  TarsProcurementGroup,
  TarsRepairAction,
  TarsWorkSession,
} from './tarsWorkTypes';

export const PARTS_LIST_COMPLAINT = 'Parts list';
/** @deprecated Legacy single fees bucket — shown as a normal order if present. */
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

export function collectSessionParts(session: TarsWorkSession): TarsSessionPartRow[] {
  const rows: TarsSessionPartRow[] = [];
  for (const action of session.actions) {
    if (action.type !== 'repair') continue;
    const repairLabel = action.complaint.trim() || action.diagnosis.trim() || 'Repair';
    for (const option of action.options) {
      for (const part of option.parts) {
        rows.push({
          part,
          repairLabel,
          optionName: option.name,
        });
      }
    }
  }
  return rows;
}

function partsById(session: TarsWorkSession): Map<string, TarsPartLine> {
  return new Map(collectSessionParts(session).map((row) => [row.part.id, row.part]));
}

export function listSessionOrders(session: TarsWorkSession): TarsProcurementGroup[] {
  return session.procurementGroups;
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

function ensurePartsListRepair(session: TarsWorkSession): { session: TarsWorkSession; optionId: string } {
  const existing = session.actions.find(
    (a): a is TarsRepairAction => a.type === 'repair' && a.complaint === PARTS_LIST_COMPLAINT,
  );
  if (existing) {
    const option = existing.options.find((o) => o.selected) ?? existing.options[0];
    return { session, optionId: option.id };
  }

  const action = createRepairAction();
  action.complaint = PARTS_LIST_COMPLAINT;
  action.diagnosis = 'Parts added from parts list drawer';
  action.options = [
    {
      id: newId(),
      name: 'Default',
      notes: '',
      timeEstimateHours: 0,
      timeActualHours: 0,
      parts: [],
      selected: true,
    },
  ];

  return {
    session: { ...session, actions: [...session.actions, action] },
    optionId: action.options[0].id,
  };
}

function mapRepairParts(
  session: TarsWorkSession,
  mapper: (parts: TarsPartLine[], action: TarsRepairAction, optionId: string) => TarsPartLine[],
): TarsWorkSession {
  return {
    ...session,
    actions: session.actions.map((action) => {
      if (action.type !== 'repair') return action;
      return {
        ...action,
        options: action.options.map((option) => ({
          ...option,
          parts: mapper(option.parts, action, option.id),
        })),
      };
    }),
  };
}

function stripPartFromOrders(session: TarsWorkSession, partId: string): TarsWorkSession {
  return {
    ...session,
    procurementGroups: session.procurementGroups.map((g) => {
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

function linkPartsToOrder(session: TarsWorkSession, order: TarsProcurementGroup): TarsWorkSession {
  const partIdSet = new Set(order.partIds);
  return mapRepairParts(session, (parts) =>
    parts.map((part) => {
      if (partIdSet.has(part.id)) return { ...part, procurementGroupId: order.id };
      if (part.procurementGroupId === order.id) return { ...part, procurementGroupId: null };
      return part;
    }),
  );
}

export function addSessionPart(session: TarsWorkSession): TarsWorkSession {
  const { session: withAction, optionId } = ensurePartsListRepair(session);
  const part: TarsPartLine = {
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

  return mapRepairParts(withAction, (parts, action, oid) =>
    action.complaint === PARTS_LIST_COMPLAINT && oid === optionId ? [...parts, part] : parts,
  );
}

export function updateSessionPart(
  session: TarsWorkSession,
  partId: string,
  patch: Partial<TarsPartLine>,
): TarsWorkSession {
  return mapRepairParts(session, (parts) =>
    parts.map((part) => (part.id === partId ? { ...part, ...patch } : part)),
  );
}

export function removeSessionPart(session: TarsWorkSession, partId: string): TarsWorkSession {
  const withoutPart = mapRepairParts(session, (parts) => parts.filter((part) => part.id !== partId));
  return stripPartFromOrders(withoutPart, partId);
}

export function upsertSessionOrder(session: TarsWorkSession, order: TarsProcurementGroup): TarsWorkSession {
  const normalized = cleanOrderQtyOverrides(order);
  const exists = session.procurementGroups.some((g) => g.id === normalized.id);
  const procurementGroups = exists
    ? session.procurementGroups.map((g) => (g.id === normalized.id ? normalized : g))
    : [...session.procurementGroups, normalized];
  return linkPartsToOrder({ ...session, procurementGroups }, normalized);
}

export function removeSessionOrder(session: TarsWorkSession, orderId: string): TarsWorkSession {
  const procurementGroups = session.procurementGroups.filter((g) => g.id !== orderId);
  return linkPartsToOrder({ ...session, procurementGroups }, {
    id: orderId,
    supplierName: '',
    cartUrl: '',
    shipping: 0,
    tax: 0,
    fees: 0,
    notes: '',
    partIds: [],
  });
}

export function partsSubtotal(session: TarsWorkSession): number {
  return collectSessionParts(session).reduce((sum, row) => sum + partLineTotal(row.part), 0);
}

export function allOrdersFeesTotal(session: TarsWorkSession): number {
  return session.procurementGroups.reduce((sum, g) => sum + orderFeesAmount(g), 0);
}

export function partsGrandTotal(session: TarsWorkSession): number {
  return partsSubtotal(session) + allOrdersFeesTotal(session);
}
