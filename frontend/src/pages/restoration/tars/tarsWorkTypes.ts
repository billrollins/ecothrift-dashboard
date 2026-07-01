/** Work session domain — simplified MVP: parts/orders + per-grade plans + a free-form bench log. */

export type TarsActionType = 'test' | 'assemble' | 'repair' | 'salvage';

export const TARS_ACTION_TYPE_LABELS: Record<TarsActionType, string> = {
  test: 'Test',
  assemble: 'Assemble',
  repair: 'Repair',
  salvage: 'Salvage',
};

export type TarsPartStatus =
  | 'considering'
  | 'planned'
  | 'ordered'
  | 'received'
  | 'installed'
  | 'skipped';

export interface TarsPartLine {
  id: string;
  partNumber: string;
  description: string;
  url: string;
  qty: number;
  unitPriceEstimate: number;
  unitPriceActual: number;
  status: TarsPartStatus;
  procurementGroupId: string | null;
}

export interface TarsProcurementGroup {
  id: string;
  supplierName: string;
  cartUrl: string;
  shipping: number;
  tax: number;
  fees: number;
  notes: string;
  partIds: string[];
  /** Order-only qty overrides; parts list qty remains the source of truth. */
  partQtyOverrides?: Record<string, number>;
}

/** One free-form action row in the unified WorkBench log. */
export interface TarsWorkBenchRow {
  id: string;
  category: TarsActionType;
  name: string;
  notes: string;
  result: string;
}

/** Per-grade plan — estimated hours + the orders attached to that grade option. */
export interface TarsGradePlan {
  estimateHours: number;
  orderIds: string[];
}

export type TarsWorkState = 'queue' | 'bench' | 'pending' | 'done' | 'returned';

export type TarsPendingReason =
  | 'parts_needed'
  | 'need_more_time'
  | 'pending_test'
  | 'repair_time_needed'
  | 'tools_needed'
  | 'needs_approval'
  | 'research_sop'
  | 'safety_hold'
  | 'between_steps'
  | 'other';

export const TARS_PENDING_REASON_LABELS: Record<TarsPendingReason, string> = {
  parts_needed: 'Parts needed',
  need_more_time: 'Need more time',
  pending_test: 'Pending test',
  repair_time_needed: 'Repair time needed',
  tools_needed: 'Tools needed',
  needs_approval: 'Needs approval',
  research_sop: 'Research / SOP',
  safety_hold: 'Safety hold',
  between_steps: 'Between steps',
  other: 'Other',
};

export interface TarsPendingInfo {
  reason: TarsPendingReason;
  notes: string;
  storageLocation: string;
  pendingStartedAt: string;
  /** Set by the backend when a linked parts request is received. */
  partsReceived?: boolean;
  partsReceivedAt?: string;
}

export interface TarsWorkSession {
  workState: TarsWorkState;
  selectedGrade: string | null;
  parts: TarsPartLine[];
  orders: TarsProcurementGroup[];
  gradePlans: Record<string, TarsGradePlan>;
  benchRows: TarsWorkBenchRow[];
  pending?: TarsPendingInfo;
}

export interface TarsGradeDirectionRow {
  grade: string;
  processorValue: number;
  estimateHours: number;
  laborCost: number;
  ordersCost: number;
  restoreCost: number;
  orderCount: number;
  isSelected: boolean;
}

export interface TarsWorkEvaluation {
  directions: TarsGradeDirectionRow[];
  selectedGrade: string | null;
}
