import type { TarsActionType } from './tarsWorkTypes';

export const TARS_DECISION_SCHEMA_VERSION = 1 as const;
export const TARS_DECISION_CATALOG_VERSION = 'phase1-mvp-v1' as const;

export type TarsDecisionSchemaVersion = typeof TARS_DECISION_SCHEMA_VERSION;
export type TarsDecisionCatalogVersion = typeof TARS_DECISION_CATALOG_VERSION;

export type TarsStopOutResponseValue = 'unanswered' | 'clear' | 'blocked';
export type TarsCompletenessStatus = 'unknown' | 'complete' | 'incomplete' | 'not_applicable';
export type TarsTestedStatus = 'not_tested' | 'partially_tested' | 'tested';
export type TarsDecisionTestResult = 'pass' | 'fail' | 'unknown' | 'skipped' | 'not_applicable';
export type TarsSaleState = 'tested' | 'untested' | 'as_is' | 'broken' | 'parts_only' | 'salvage';
export type TarsQueuePressure = 'unknown' | 'low' | 'normal' | 'high';

export interface TarsDecisionHandoff {
  acknowledged: boolean;
  acknowledgedAt: string | null;
  contextSummary: string;
  correctionNotes: string;
}

export interface TarsStopOutResponse {
  stopOutId: string;
  response: TarsStopOutResponseValue;
  notes: string;
  respondedAt: string | null;
}

export interface TarsDecisionStopOutState {
  responses: TarsStopOutResponse[];
  blocked: boolean;
  blockedStopOutIds: string[];
}

export interface TarsDecisionCondition {
  /** Grade observed at the bench before any proposed work. */
  currentGrade: string | null;
  condition: string;
  completeness: TarsCompletenessStatus;
  testedStatus: TarsTestedStatus;
  evidence: string;
}

export interface TarsDecisionTest {
  id: string;
  catalogTestId: string | null;
  packId?: string | null;
  name: string;
  prompt: string;
  relevant: boolean;
  result: TarsDecisionTestResult | null;
  evidence: string;
  /** Optional sub-checks (e.g. visual inspection). */
  checklist?: Record<string, boolean | string | null>;
  createdAt: string;
  updatedAt: string;
}

export interface TarsDecisionUnknown {
  id: string;
  description: string;
  decisionImpact: string;
  resolved: boolean;
  resolution: string;
  createdAt: string;
  updatedAt: string;
}

export interface TarsViableOutcome {
  id: string;
  grade: string;
  saleState: TarsSaleState;
  action: TarsActionType;
  viable: boolean;
  nonviableReason: string;
  estimatedMinutes: number;
  estimatedAt?: string | null;
  estimatedById?: number | null;
}

export interface TarsOutcomeEconomics {
  outcomeId: string;
  grade: string;
  saleState: TarsSaleState;
  processorValue: number;
  estimatedMinutes: number;
  scoredMinutes: number;
  laborCost: number;
  partsAndOrdersCost: number;
  contribution: number;
  contributionPerLaborMinute: number;
  viable: boolean;
  blocked: boolean;
  exclusionReason: string;
}

export interface TarsEconomicSnapshot {
  effectiveLaborRate: number;
  queuePressure: TarsQueuePressure;
  queuePressureNote: string;
  /** Queue pressure is deliberately recorded as context and never changes candidate scores. */
  queuePressureAffectsScore: false;
  candidates: TarsOutcomeEconomics[];
  evaluatedAt: string | null;
}

export interface TarsDecisionRecommendation {
  outcomeId: string | null;
  grade: string | null;
  saleState: TarsSaleState | null;
  action: TarsActionType | null;
  contributionPerLaborMinute: number | null;
  reason: string;
  generatedAt: string | null;
}

export interface TarsDecisionSelection {
  outcomeId: string | null;
  grade: string | null;
  saleState: TarsSaleState | null;
  action: TarsActionType | null;
  reason: string;
  /** Justifies an ordinary workflow exception; mandatory stop-outs remain non-overridable. */
  overrideReason: string;
  selectedAt: string | null;
  selectedById?: number | null;
}

export interface TarsDecisionTimestamps {
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TarsDecisionWork {
  schemaVersion: TarsDecisionSchemaVersion;
  catalogVersion: TarsDecisionCatalogVersion;
  handoff: TarsDecisionHandoff;
  stopOut: TarsDecisionStopOutState;
  condition: TarsDecisionCondition;
  tests: TarsDecisionTest[];
  unknowns: TarsDecisionUnknown[];
  outcomes: TarsViableOutcome[];
  economics: TarsEconomicSnapshot;
  recommendation: TarsDecisionRecommendation;
  selection: TarsDecisionSelection;
  timestamps: TarsDecisionTimestamps;
}

export function createEmptyDecisionWork(now = new Date().toISOString()): TarsDecisionWork {
  return {
    schemaVersion: TARS_DECISION_SCHEMA_VERSION,
    catalogVersion: TARS_DECISION_CATALOG_VERSION,
    handoff: {
      acknowledged: false,
      acknowledgedAt: null,
      contextSummary: '',
      correctionNotes: '',
    },
    stopOut: {
      responses: [],
      blocked: false,
      blockedStopOutIds: [],
    },
    condition: {
      currentGrade: null,
      condition: '',
      completeness: 'unknown',
      testedStatus: 'not_tested',
      evidence: '',
    },
    tests: [],
    unknowns: [],
    outcomes: [],
    economics: {
      effectiveLaborRate: 19.8,
      queuePressure: 'unknown',
      queuePressureNote: '',
      queuePressureAffectsScore: false,
      candidates: [],
      evaluatedAt: null,
    },
    recommendation: {
      outcomeId: null,
      grade: null,
      saleState: null,
      action: null,
      contributionPerLaborMinute: null,
      reason: '',
      generatedAt: null,
    },
    selection: {
      outcomeId: null,
      grade: null,
      saleState: null,
      action: null,
      reason: '',
      overrideReason: '',
      selectedAt: null,
      selectedById: null,
    },
    timestamps: {
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
  };
}
