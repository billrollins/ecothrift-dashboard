/** Work session domain - parts/orders + per-grade plans + bench and decision work. */

import type { TarsBenchPlan } from './tarsBenchPlan';
import type { TarsDecisionWork } from './tarsDecisionTypes';

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

export type TarsPurchaseSection = 'parts' | 'supplies' | 'ffe';

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
  /**
   * What kind of buy this line is. Missing / unknown reads as Parts so
   * existing lists keep their cost math.
   */
  section?: TarsPurchaseSection;
  /**
   * The grades this part is needed for. A part usually buys one outcome, but
   * one screw can be on the way to several, so this is a list.
   *
   * Naming the grade the item is already at makes no sense - you do not buy
   * parts to stay where you are - but it is not refused. Someone marking it
   * that way is more likely to be recording something the model does not know
   * about than making a mistake worth blocking.
   */
  grades?: string[];
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
  durationMinutes?: number;
  performedAt?: string;
}

/** Per-grade plan - estimated hours + the orders attached to that grade option. */
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

export interface TarsWaitFor {
  time?: string;
  space?: string;
  help?: string;
  other?: string;
}

export interface TarsWithOtherItems {
  knowledge: 'known' | 'unknown';
  waitUntil?: string;
  waitingOnOrder?: string;
  otherSkus?: string;
}

export interface TarsPendingInfo {
  /** Derived rail label, or a legacy reason code on older jobs. */
  reason: string;
  needsPurchased: TarsPurchaseSection[];
  waitFor?: TarsWaitFor;
  withOtherItems?: TarsWithOtherItems | null;
  notes: string;
  storageLocation: string;
  pendingStartedAt: string;
  receivedSections?: TarsPurchaseSection[];
  /** Legacy single flag. Prefer receivedSections. */
  partsReceived?: boolean;
  partsReceivedAt?: string;
  legacyReason?: string;
}

export interface TarsWorkSession {
  workState: TarsWorkState;
  selectedGrade: string | null;
  parts: TarsPartLine[];
  orders: TarsProcurementGroup[];
  gradePlans: Record<string, TarsGradePlan>;
  benchRows: TarsWorkBenchRow[];
  /**
   * The grade table's answers: where the item stands, and the parts and
   * minutes for each grade it could reach.
   *
   * Declared here rather than tacked onto the session as a loose key, because
   * everything that reads a session back from the server rebuilds it from the
   * fields named in this type. A field that is not named is a field that is
   * silently dropped on the next refetch.
   */
  benchPlan?: TarsBenchPlan;
  /** Versioned Phase 1 decision worksheet; absent on legacy sessions. */
  decisionWork?: TarsDecisionWork;
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
