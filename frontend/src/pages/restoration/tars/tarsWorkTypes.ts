/** Work session domain — Evaluation directions vs TARS action records. */

export type TarsActionType = 'test' | 'assemble' | 'repair' | 'salvage';
export type TarsActionStatus = 'planned' | 'in_progress' | 'complete' | 'skipped';

export type TarsTestOutcome = 'pass' | 'fail' | 'partial' | 'not_tested';
export type TarsAssemblyStepStatus = 'todo' | 'in_progress' | 'done' | 'blocked';
export type TarsPartStatus =
  | 'considering'
  | 'planned'
  | 'ordered'
  | 'received'
  | 'installed'
  | 'skipped';

export type TarsSalvageDestination =
  | 'trash'
  | 'metals_general'
  | 'metals_aluminum'
  | 'metals_copper'
  | 'metals_steel'
  | 'metals_ewaste'
  | 'parts_sell'
  | 'parts_our_use';

export const SALVAGE_DESTINATION_LABELS: Record<TarsSalvageDestination, string> = {
  trash: 'Trash',
  metals_general: 'Metals — General Pile',
  metals_aluminum: 'Metals — Aluminum',
  metals_copper: 'Metals — Copper',
  metals_steel: 'Metals — Steel',
  metals_ewaste: 'Metals — E-waste',
  parts_sell: 'Parts — Sell',
  parts_our_use: 'Parts — Our Use',
};

export interface TarsActionBase {
  id: string;
  type: TarsActionType;
  status: TarsActionStatus;
  notes: string;
  timeEstimateHours: number;
  timeActualHours: number;
  startedAt?: string;
  stoppedAt?: string;
  /** Grade outcome this action supports, if any. */
  linkedGrade?: string;
}

export interface TarsTestRecord {
  id: string;
  testName: string;
  outcome: TarsTestOutcome;
  notes: string;
  timeEstimateHours: number;
  timeActualHours: number;
}

export interface TarsTestAction extends TarsActionBase {
  type: 'test';
  tests: TarsTestRecord[];
}

export interface TarsAssemblyStep {
  id: string;
  stepNumber: number;
  instruction: string;
  status: TarsAssemblyStepStatus;
  notes: string;
}

export interface TarsAssembleAction extends TarsActionBase {
  type: 'assemble';
  steps: TarsAssemblyStep[];
}

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

export interface TarsRepairOption {
  id: string;
  name: string;
  notes: string;
  timeEstimateHours: number;
  timeActualHours: number;
  parts: TarsPartLine[];
  selected: boolean;
}

export interface TarsRepairAction extends TarsActionBase {
  type: 'repair';
  complaint: string;
  diagnosis: string;
  correction: string;
  result: string;
  options: TarsRepairOption[];
}

export interface TarsSalvageLine {
  id: string;
  destination: TarsSalvageDestination;
  description: string;
  qty: number;
  weightLbs: number | null;
  valueRecovery: number;
  notes: string;
}

export interface TarsSalvageAction extends TarsActionBase {
  type: 'salvage';
  lines: TarsSalvageLine[];
}

export type TarsAction =
  | TarsTestAction
  | TarsAssembleAction
  | TarsRepairAction
  | TarsSalvageAction;

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
  expectedResumeAt: string;
  pendingStartedAt: string;
}

export interface TarsWorkSession {
  workState: TarsWorkState;
  selectedGrade: string | null;
  actions: TarsAction[];
  procurementGroups: TarsProcurementGroup[];
  benchStartedAt?: string;
  pending?: TarsPendingInfo;
}

export interface TarsGradeDirectionRow {
  grade: string;
  processorValue: number;
  estimatedActionCost: number | null;
  actualActionCost: number | null;
  partsCost: number;
  laborCost: number;
  projectedProfit: number | null;
  actualProfit: number | null;
  actionSummary: {
    testHours: number;
    assembleHours: number;
    repairParts: number;
    repairHours: number;
    salvageRecovery: number;
  };
  isSelected: boolean;
  isRecommended: boolean;
  hasUnknownCosts: boolean;
}

export interface TarsWorkEvaluation {
  directions: TarsGradeDirectionRow[];
  selectedGrade: string | null;
  recommendedGrade: string | null;
}
