import {
  TARS_MANDATORY_STOP_OUTS,
  TARS_TEST_PACKS,
  TARS_UNIVERSAL_TEST_CATALOG,
  suggestTestPackIds,
  type TarsStopOutCatalogEntry,
} from './tarsDecisionCatalog';
import {
  createEmptyDecisionWork,
  TARS_DECISION_CATALOG_VERSION,
  TARS_DECISION_SCHEMA_VERSION,
  type TarsDecisionTest,
  type TarsDecisionTestResult,
  type TarsDecisionUnknown,
  type TarsDecisionWork,
  type TarsOutcomeEconomics,
  type TarsSaleState,
  type TarsStopOutResponse,
  type TarsStopOutResponseValue,
  type TarsViableOutcome,
} from './tarsDecisionTypes';
import { partsCostForGrade } from './tarsPartsSummary';
import decisionContract from './tarsDecisionContract.json';
import type { TarsItem } from './tarsTypes';
import type {
  TarsActionType,
  TarsGradePlan,
  TarsWorkBenchRow,
  TarsWorkSession,
} from './tarsWorkTypes';

// The server recomputes and overwrites these numbers on save. Reading both from
// the shared contract keeps the preview honest instead of merely coincidental.
export const TARS_DECISION_EFFECTIVE_LABOR_RATE = decisionContract.effectiveLaborRate;

/** Zero-work paths still consume intake, identification, disclosure, and routing time. */
export const TARS_MINIMUM_HANDLING_MINUTES: Readonly<Partial<Record<TarsSaleState, number>>> =
  decisionContract.minimumHandlingMinutes;

const TEST_RESULT_SET = new Set<TarsDecisionTestResult>([
  'pass',
  'fail',
  'unknown',
  'skipped',
  'not_applicable',
]);
const SALE_STATE_SET = new Set<TarsSaleState>([
  'tested',
  'untested',
  'as_is',
  'broken',
  'parts_only',
  'salvage',
]);
const ACTION_SET = new Set<TarsActionType>(['test', 'assemble', 'repair', 'salvage']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function finiteNonnegative(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback;
}

function normalizeTest(value: unknown, now: string): TarsDecisionTest | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  if (!id) return null;
  const rawResult = value.result;
  const checklist = isRecord(value.checklist)
    ? Object.fromEntries(
      Object.entries(value.checklist).map(([key, entry]) => [
        key,
        typeof entry === 'boolean' || typeof entry === 'string' || entry === null ? entry : null,
      ]),
    )
    : {};
  return {
    id,
    catalogTestId: nullableString(value.catalogTestId),
    packId: nullableString(value.packId),
    name: stringValue(value.name, 'Custom test'),
    prompt: stringValue(value.prompt),
    relevant: value.relevant === true,
    result:
      typeof rawResult === 'string' && TEST_RESULT_SET.has(rawResult as TarsDecisionTestResult)
        ? rawResult as TarsDecisionTestResult
        : null,
    evidence: stringValue(value.evidence),
    checklist,
    createdAt: stringValue(value.createdAt, now),
    updatedAt: stringValue(value.updatedAt, now),
  };
}

function normalizeUnknown(value: unknown, now: string): TarsDecisionUnknown | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  if (!id) return null;
  return {
    id,
    description: stringValue(value.description),
    decisionImpact: stringValue(value.decisionImpact),
    resolved: value.resolved === true,
    resolution: stringValue(value.resolution),
    createdAt: stringValue(value.createdAt, now),
    updatedAt: stringValue(value.updatedAt, now),
  };
}

function normalizeOutcome(value: unknown): TarsViableOutcome | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const grade = stringValue(value.grade);
  const saleState = stringValue(value.saleState);
  const action = stringValue(value.action);
  if (
    !id ||
    !grade ||
    !SALE_STATE_SET.has(saleState as TarsSaleState) ||
    !ACTION_SET.has(action as TarsActionType)
  ) return null;
  return {
    id,
    grade,
    saleState: saleState as TarsSaleState,
    action: action as TarsActionType,
    viable: value.viable !== false,
    nonviableReason: stringValue(value.nonviableReason),
    estimatedMinutes: finiteNonnegative(value.estimatedMinutes),
    estimatedAt: nullableString(value.estimatedAt),
    estimatedById: typeof value.estimatedById === 'number' ? value.estimatedById : null,
  };
}

function normalizeCandidate(value: unknown): TarsOutcomeEconomics | null {
  if (!isRecord(value)) return null;
  const outcomeId = stringValue(value.outcomeId);
  const grade = stringValue(value.grade);
  const saleState = stringValue(value.saleState);
  if (!outcomeId || !grade || !SALE_STATE_SET.has(saleState as TarsSaleState)) return null;
  const number = (field: string) => finiteNonnegative(value[field]);
  const rawContribution = value.contribution;
  const rawPerMinute = value.contributionPerLaborMinute;
  return {
    outcomeId,
    grade,
    saleState: saleState as TarsSaleState,
    processorValue: number('processorValue'),
    estimatedMinutes: number('estimatedMinutes'),
    scoredMinutes: number('scoredMinutes'),
    laborCost: number('laborCost'),
    partsAndOrdersCost: number('partsAndOrdersCost'),
    contribution:
      typeof rawContribution === 'number' && Number.isFinite(rawContribution) ? rawContribution : 0,
    contributionPerLaborMinute:
      typeof rawPerMinute === 'number' && Number.isFinite(rawPerMinute) ? rawPerMinute : 0,
    viable: value.viable === true,
    blocked: value.blocked === true,
    exclusionReason: stringValue(value.exclusionReason),
  };
}

function normalizeStopOutResponse(value: unknown): TarsStopOutResponse | null {
  if (!isRecord(value)) return null;
  const stopOutId = stringValue(value.stopOutId);
  const rawResponse = stringValue(value.response);
  if (!stopOutId) return null;
  const response: TarsStopOutResponseValue =
    rawResponse === 'clear' || rawResponse === 'blocked' ? rawResponse : 'unanswered';
  return {
    stopOutId,
    response,
    notes: stringValue(value.notes),
    respondedAt: nullableString(value.respondedAt),
  };
}

/** Tolerant boundary normalization for optional/partial legacy JSON work_session data. */
export function normalizeDecisionWork(value: unknown, now = new Date().toISOString()): TarsDecisionWork {
  const base = createEmptyDecisionWork(now);
  if (!isRecord(value)) return base;
  const handoff = isRecord(value.handoff) ? value.handoff : {};
  const stopOut = isRecord(value.stopOut) ? value.stopOut : {};
  const condition = isRecord(value.condition) ? value.condition : {};
  const economics = isRecord(value.economics) ? value.economics : {};
  const recommendation = isRecord(value.recommendation) ? value.recommendation : {};
  const selection = isRecord(value.selection) ? value.selection : {};
  const timestamps = isRecord(value.timestamps) ? value.timestamps : {};
  const responses = Array.isArray(stopOut.responses)
    ? stopOut.responses.map(normalizeStopOutResponse).filter((entry): entry is TarsStopOutResponse => entry !== null)
    : [];
  const blockedStopOutIds = responses
    .filter((entry) => entry.response === 'blocked')
    .map((entry) => entry.stopOutId);

  const completeness = stringValue(condition.completeness);
  const testedStatus = stringValue(condition.testedStatus);
  const selectedSaleState = stringValue(selection.saleState);
  const selectedAction = stringValue(selection.action);

  return {
    schemaVersion: TARS_DECISION_SCHEMA_VERSION,
    catalogVersion: TARS_DECISION_CATALOG_VERSION,
    handoff: {
      acknowledged: handoff.acknowledged === true,
      acknowledgedAt: nullableString(handoff.acknowledgedAt),
      contextSummary: stringValue(handoff.contextSummary),
      correctionNotes: stringValue(handoff.correctionNotes),
    },
    stopOut: {
      responses,
      blocked: blockedStopOutIds.length > 0,
      blockedStopOutIds,
    },
    condition: {
      currentGrade: nullableString(condition.currentGrade),
      condition: stringValue(condition.condition),
      completeness:
        completeness === 'complete' || completeness === 'incomplete' || completeness === 'not_applicable'
          ? completeness
          : 'unknown',
      testedStatus:
        testedStatus === 'partially_tested' || testedStatus === 'tested'
          ? testedStatus
          : 'not_tested',
      evidence: stringValue(condition.evidence),
    },
    tests: Array.isArray(value.tests)
      ? value.tests.map((entry) => normalizeTest(entry, now)).filter((entry): entry is TarsDecisionTest => entry !== null)
      : [],
    unknowns: Array.isArray(value.unknowns)
      ? value.unknowns.map((entry) => normalizeUnknown(entry, now)).filter((entry): entry is TarsDecisionUnknown => entry !== null)
      : [],
    outcomes: Array.isArray(value.outcomes)
      ? value.outcomes.map(normalizeOutcome).filter((entry): entry is TarsViableOutcome => entry !== null)
      : [],
    economics: {
      effectiveLaborRate: TARS_DECISION_EFFECTIVE_LABOR_RATE,
      candidates: Array.isArray(economics.candidates)
        ? economics.candidates
          .map(normalizeCandidate)
          .filter((entry): entry is TarsOutcomeEconomics => entry !== null)
        : [],
      evaluatedAt: nullableString(economics.evaluatedAt),
    },
    recommendation: {
      outcomeId: nullableString(recommendation.outcomeId),
      grade: nullableString(recommendation.grade),
      saleState: SALE_STATE_SET.has(stringValue(recommendation.saleState) as TarsSaleState)
        ? stringValue(recommendation.saleState) as TarsSaleState
        : null,
      action: ACTION_SET.has(stringValue(recommendation.action) as TarsActionType)
        ? stringValue(recommendation.action) as TarsActionType
        : null,
      contributionPerLaborMinute:
        typeof recommendation.contributionPerLaborMinute === 'number' &&
        Number.isFinite(recommendation.contributionPerLaborMinute)
          ? recommendation.contributionPerLaborMinute
          : null,
      reason: stringValue(recommendation.reason),
      generatedAt: nullableString(recommendation.generatedAt),
    },
    selection: {
      outcomeId: nullableString(selection.outcomeId),
      grade: nullableString(selection.grade),
      saleState: SALE_STATE_SET.has(selectedSaleState as TarsSaleState)
        ? selectedSaleState as TarsSaleState
        : null,
      action: ACTION_SET.has(selectedAction as TarsActionType)
        ? selectedAction as TarsActionType
        : null,
      reason: stringValue(selection.reason),
      overrideReason: stringValue(selection.overrideReason),
      selectedAt: nullableString(selection.selectedAt),
      selectedById: typeof selection.selectedById === 'number' ? selection.selectedById : null,
    },
    timestamps: {
      createdAt: stringValue(timestamps.createdAt, now),
      updatedAt: stringValue(timestamps.updatedAt, now),
      completedAt: nullableString(timestamps.completedAt),
    },
  };
}

function defaultSaleState(grade: string): TarsSaleState {
  const normalized = grade.toLowerCase();
  if (normalized.includes('salvage')) return 'salvage';
  if (normalized.includes('parts')) return 'parts_only';
  if (normalized.includes('repair')) return 'broken';
  return 'untested';
}

function defaultAction(saleState: TarsSaleState): TarsActionType {
  if (saleState === 'salvage' || saleState === 'parts_only') return 'salvage';
  if (saleState === 'broken') return 'repair';
  return 'test';
}

/**
 * Seeds suggested test packs and grade paths without replacing saved work.
 * Soft stop-outs default to clear (no Stops screen).
 */
export function ensureDecisionSession(
  session: TarsWorkSession,
  item: Pick<TarsItem, 'values' | 'category' | 'name' | 'brand'>,
  now = new Date().toISOString(),
): TarsWorkSession {
  const decision = normalizeDecisionWork(session.decisionWork, now);
  const packIds = suggestTestPackIds(item);
  const suggestedCatalogIds = new Set(
    TARS_TEST_PACKS
      .filter((pack) => packIds.includes(pack.id))
      .flatMap((pack) => pack.testIds),
  );
  // Always keep previously saved catalog tests; seed suggested pack tests.
  const catalogEntries = TARS_UNIVERSAL_TEST_CATALOG.filter(
    (entry) => suggestedCatalogIds.has(entry.id) || entry.defaultRelevant,
  );
  const testsByCatalogId = new Set(decision.tests.map((test) => test.catalogTestId).filter(Boolean));
  const tests = [
    ...decision.tests,
    ...catalogEntries
      .filter((entry) => !testsByCatalogId.has(entry.id))
      .map<TarsDecisionTest>((entry) => ({
        id: `catalog-test:${entry.id}`,
        catalogTestId: entry.id,
        packId: entry.packId ?? null,
        name: entry.name,
        prompt: entry.prompt,
        relevant: entry.defaultRelevant || suggestedCatalogIds.has(entry.id),
        result: null,
        evidence: '',
        checklist: entry.checklistKeys
          ? Object.fromEntries(entry.checklistKeys.map((key) => [key, null]))
          : {},
        createdAt: now,
        updatedAt: now,
      })),
  ];
  const responsesById = new Map(decision.stopOut.responses.map((response) => [response.stopOutId, response]));
  const responses = TARS_MANDATORY_STOP_OUTS.map<TarsStopOutResponse>(
    (entry) => responsesById.get(entry.id) ?? {
      stopOutId: entry.id,
      response: 'clear',
      notes: '',
      respondedAt: now,
    },
  );
  const outcomesByGrade = new Map(decision.outcomes.map((outcome) => [outcome.grade, outcome]));
  const outcomes = Object.entries(item.values ?? {})
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .map<TarsViableOutcome>(([grade]) => {
      const existing = outcomesByGrade.get(grade);
      if (existing) return existing;
      const saleState = defaultSaleState(grade);
      return {
        id: `grade:${grade}`,
        grade,
        saleState,
        action: defaultAction(saleState),
        viable: true,
        nonviableReason: '',
        estimatedMinutes: Math.max(0, (session.gradePlans?.[grade]?.estimateHours ?? 0) * 60),
        estimatedAt: null,
        estimatedById: null,
      };
    });

  return {
    ...session,
    decisionWork: {
      ...decision,
      tests,
      outcomes,
      stopOut: {
        responses,
        blocked: responses.some((response) => response.response === 'blocked'),
        blockedStopOutIds: responses
          .filter((response) => response.response === 'blocked')
          .map((response) => response.stopOutId),
      },
    },
  };
}

function pathBlockedBy(
  outcome: Pick<TarsViableOutcome, 'action' | 'saleState'>,
  entry: TarsStopOutCatalogEntry,
): boolean {
  return Boolean(
    entry.blocksAllSelections ||
    entry.blockedActions?.includes(outcome.action) ||
    entry.blockedSaleStates?.includes(outcome.saleState),
  );
}

function pathBlockReason(decision: TarsDecisionWork, outcome: TarsViableOutcome): string {
  for (const catalogEntry of TARS_MANDATORY_STOP_OUTS) {
    const response = decision.stopOut.responses.find((entry) => entry.stopOutId === catalogEntry.id);
    // Soft stop-outs: unanswered counts as clear.
    if (!response || response.response === 'unanswered' || response.response === 'clear') continue;
    if (response.response === 'blocked' && pathBlockedBy(outcome, catalogEntry)) {
      return catalogEntry.blockedGuidance;
    }
  }
  return '';
}

export function scoredMinutesForOutcome(outcome: Pick<TarsViableOutcome, 'estimatedMinutes' | 'saleState'>): number {
  const minimum = TARS_MINIMUM_HANDLING_MINUTES[outcome.saleState] ?? 1;
  return Math.max(minimum, finiteNonnegative(outcome.estimatedMinutes));
}

function gradeOrderCost(session: TarsWorkSession, grade: string): number {
  return partsCostForGrade(session.parts, grade);
}

export function evaluateDecisionOutcomes(
  item: Pick<TarsItem, 'values'>,
  session: TarsWorkSession,
): TarsOutcomeEconomics[] {
  const decision = normalizeDecisionWork(session.decisionWork);
  return decision.outcomes.map((outcome) => {
    const estimatedMinutes = finiteNonnegative(outcome.estimatedMinutes);
    const scoredMinutes = scoredMinutesForOutcome(outcome);
    const processorValue = finiteNonnegative(item.values?.[outcome.grade]);
    const laborCost = (scoredMinutes / 60) * TARS_DECISION_EFFECTIVE_LABOR_RATE;
    const partsAndOrdersCost = gradeOrderCost(session, outcome.grade);
    const contribution = processorValue - laborCost - partsAndOrdersCost;
    const blockedReason = pathBlockReason(decision, outcome);
    const exclusionReason = !outcome.viable
      ? outcome.nonviableReason || 'Marked nonviable'
      : blockedReason;
    return {
      outcomeId: outcome.id,
      grade: outcome.grade,
      saleState: outcome.saleState,
      processorValue,
      estimatedMinutes,
      scoredMinutes,
      laborCost,
      partsAndOrdersCost,
      contribution,
      contributionPerLaborMinute: contribution / scoredMinutes,
      viable: outcome.viable,
      blocked: Boolean(blockedReason),
      exclusionReason,
    };
  });
}

export function rankDecisionOutcomes(
  item: Pick<TarsItem, 'values'>,
  session: TarsWorkSession,
): TarsOutcomeEconomics[] {
  return evaluateDecisionOutcomes(item, session)
    .filter((candidate) => candidate.viable && !candidate.blocked)
    .sort((a, b) =>
      b.contributionPerLaborMinute - a.contributionPerLaborMinute ||
      b.contribution - a.contribution ||
      a.scoredMinutes - b.scoredMinutes,
    );
}

export function recalculateDecisionEconomics(
  item: Pick<TarsItem, 'values'>,
  session: TarsWorkSession,
  now = new Date().toISOString(),
): TarsWorkSession {
  const decision = normalizeDecisionWork(session.decisionWork, now);
  const candidates = evaluateDecisionOutcomes(item, { ...session, decisionWork: decision });
  const ranked = candidates
    .filter((candidate) => candidate.viable && !candidate.blocked)
    .sort((a, b) => b.contributionPerLaborMinute - a.contributionPerLaborMinute);
  const best = ranked[0];
  const bestOutcome = best
    ? decision.outcomes.find((outcome) => outcome.id === best.outcomeId)
    : undefined;
  return {
    ...session,
    decisionWork: {
      ...decision,
      economics: {
        ...decision.economics,
        effectiveLaborRate: TARS_DECISION_EFFECTIVE_LABOR_RATE,
        candidates,
        evaluatedAt: now,
      },
      recommendation: best && bestOutcome
        ? {
          outcomeId: best.outcomeId,
          grade: best.grade,
          saleState: best.saleState,
          action: bestOutcome.action,
          contributionPerLaborMinute: best.contributionPerLaborMinute,
          reason: `Highest restoration contribution per labor minute (${best.contribution.toFixed(2)} contribution over ${best.scoredMinutes} minutes).`,
          generatedAt: now,
        }
        : {
          outcomeId: null,
          grade: null,
          saleState: null,
          action: null,
          contributionPerLaborMinute: null,
          reason: 'No viable, unblocked path is available.',
          generatedAt: now,
        },
      timestamps: { ...decision.timestamps, updatedAt: now },
    },
  };
}

function replaceDecision(
  session: TarsWorkSession,
  decision: TarsDecisionWork,
  now: string,
): TarsWorkSession {
  return {
    ...session,
    decisionWork: {
      ...decision,
      timestamps: { ...decision.timestamps, updatedAt: now },
    },
  };
}

export function updateStopOutResponse(
  session: TarsWorkSession,
  stopOutId: string,
  response: TarsStopOutResponseValue,
  notes?: string,
  now = new Date().toISOString(),
): TarsWorkSession {
  const decision = normalizeDecisionWork(session.decisionWork, now);
  const current = decision.stopOut.responses.find((entry) => entry.stopOutId === stopOutId);
  const nextResponse: TarsStopOutResponse = {
    stopOutId,
    response,
    notes: notes ?? current?.notes ?? '',
    respondedAt: response === 'unanswered' ? null : now,
  };
  const responses = current
    ? decision.stopOut.responses.map((entry) => entry.stopOutId === stopOutId ? nextResponse : entry)
    : [...decision.stopOut.responses, nextResponse];
  return replaceDecision(session, {
    ...decision,
    stopOut: {
      responses,
      blocked: responses.some((entry) => entry.response === 'blocked'),
      blockedStopOutIds: responses
        .filter((entry) => entry.response === 'blocked')
        .map((entry) => entry.stopOutId),
    },
  }, now);
}

export function updateDecisionOutcome(
  session: TarsWorkSession,
  outcomeId: string,
  patch: Partial<Omit<TarsViableOutcome, 'id'>>,
  now = new Date().toISOString(),
  userId?: number | null,
): TarsWorkSession {
  const decision = normalizeDecisionWork(session.decisionWork, now);
  let changedOutcome: TarsViableOutcome | undefined;
  const outcomes = decision.outcomes.map((outcome) => {
    if (outcome.id !== outcomeId) return outcome;
    changedOutcome = {
      ...outcome,
      ...patch,
      estimatedMinutes: finiteNonnegative(patch.estimatedMinutes ?? outcome.estimatedMinutes),
      estimatedAt: patch.estimatedAt ?? now,
      estimatedById: patch.estimatedById ?? userId ?? outcome.estimatedById ?? null,
    };
    return changedOutcome;
  });
  if (!changedOutcome) return session;
  const grade = changedOutcome.grade;
  const previousPlan: TarsGradePlan = session.gradePlans?.[grade] ?? { estimateHours: 0, orderIds: [] };
  const selection = decision.selection.outcomeId === changedOutcome.id
    ? {
      ...decision.selection,
      grade: changedOutcome.grade,
      saleState: changedOutcome.saleState,
      action: changedOutcome.action,
    }
    : decision.selection;
  return replaceDecision({
    ...session,
    selectedGrade: selection.outcomeId === changedOutcome.id ? changedOutcome.grade : session.selectedGrade,
    gradePlans: {
      ...(session.gradePlans ?? {}),
      [grade]: {
        ...previousPlan,
        estimateHours: changedOutcome.estimatedMinutes / 60,
      },
    },
  }, { ...decision, outcomes, selection }, now);
}

export function selectDecisionOutcome(
  session: TarsWorkSession,
  outcomeId: string,
  now = new Date().toISOString(),
  userId?: number | null,
): TarsWorkSession {
  const decision = normalizeDecisionWork(session.decisionWork, now);
  const outcome = decision.outcomes.find((entry) => entry.id === outcomeId);
  if (!outcome) return session;
  return replaceDecision({
    ...session,
    selectedGrade: outcome.grade,
  }, {
    ...decision,
    selection: {
      ...decision.selection,
      outcomeId: outcome.id,
      grade: outcome.grade,
      saleState: outcome.saleState,
      action: outcome.action,
      selectedAt: now,
      selectedById: userId ?? decision.selection.selectedById ?? null,
    },
  }, now);
}

export function updateStructuredTestResult(
  session: TarsWorkSession,
  testId: string,
  result: TarsDecisionTestResult | null,
  evidence?: string,
  now = new Date().toISOString(),
): TarsWorkSession {
  const decision = normalizeDecisionWork(session.decisionWork, now);
  const test = decision.tests.find((entry) => entry.id === testId);
  if (!test) return session;
  const nextEvidence = evidence ?? test.evidence;
  const tests = decision.tests.map((entry) => entry.id === testId
    ? { ...entry, result, evidence: nextEvidence, updatedAt: now }
    : entry);
  const benchRowId = `decision-test:${testId}`;
  const benchRow: TarsWorkBenchRow = {
    id: benchRowId,
    category: 'test',
    name: test.name,
    notes: nextEvidence,
    result: result ?? '',
  };
  const rows = session.benchRows ?? [];
  const benchRows = rows.some((row) => row.id === benchRowId)
    ? rows.map((row) => row.id === benchRowId ? benchRow : row)
    : [...rows, benchRow];
  return replaceDecision({ ...session, benchRows }, { ...decision, tests }, now);
}

export interface TarsDecisionGates {
  mandatoryBlockers: string[];
  requiredBlockers: string[];
  ordinaryBlockers: string[];
  canFinalize: boolean;
  usesOverride: boolean;
}

export interface TarsDecisionProgress {
  answeredStopOuts: number;
  totalStopOuts: number;
  completedRelevantTests: number;
  totalRelevantTests: number;
  unresolvedUnknowns: number;
  viableUnblockedOutcomes: number;
  hasSelection: boolean;
  canFinalize: boolean;
}

export function decisionGates(session: TarsWorkSession): TarsDecisionGates {
  const decision = normalizeDecisionWork(session.decisionWork);
  const mandatoryBlockers: string[] = [];
  for (const entry of TARS_MANDATORY_STOP_OUTS) {
    const response = decision.stopOut.responses.find((candidate) => candidate.stopOutId === entry.id);
    if (response?.response === 'blocked') {
      mandatoryBlockers.push(entry.blockedGuidance);
    }
  }
  const selectedOutcome = decision.outcomes.find((outcome) => outcome.id === decision.selection.outcomeId);
  if (selectedOutcome) {
    const blockReason = pathBlockReason(decision, selectedOutcome);
    if (blockReason) mandatoryBlockers.push(blockReason);
  }

  const requiredBlockers: string[] = [];
  if (!decision.condition.currentGrade) {
    requiredBlockers.push('Record the current grade.');
  }
  if (!selectedOutcome || !decision.selection.grade || !decision.selection.action || !decision.selection.saleState) {
    requiredBlockers.push('Select a viable outcome.');
  } else if (!selectedOutcome.viable) {
    requiredBlockers.push('The selected outcome is marked nonviable.');
  }
  if (!decision.selection.reason.trim()) requiredBlockers.push('Record the decision reason.');

  const ordinaryBlockers: string[] = [];
  if (decision.tests.some((test) => test.relevant && test.result === null)) {
    ordinaryBlockers.push('Record a result for each relevant test.');
  }
  if (decision.selection.saleState === 'tested' && decision.condition.testedStatus !== 'tested') {
    ordinaryBlockers.push('A tested sale state requires tested status.');
  }
  const usesOverride = ordinaryBlockers.length > 0 && Boolean(decision.selection.overrideReason.trim());
  return {
    mandatoryBlockers,
    requiredBlockers,
    ordinaryBlockers,
    canFinalize:
      mandatoryBlockers.length === 0 &&
      requiredBlockers.length === 0 &&
      (ordinaryBlockers.length === 0 || usesOverride),
    usesOverride,
  };
}

export function decisionProgress(session: TarsWorkSession): TarsDecisionProgress {
  const decision = normalizeDecisionWork(session.decisionWork);
  const gates = decisionGates(session);
  const relevantTests = decision.tests.filter((test) => test.relevant);
  return {
    answeredStopOuts: decision.stopOut.responses.filter((response) => response.response !== 'unanswered').length,
    totalStopOuts: TARS_MANDATORY_STOP_OUTS.length,
    completedRelevantTests: relevantTests.filter((test) => test.result !== null).length,
    totalRelevantTests: relevantTests.length,
    unresolvedUnknowns: decision.unknowns.filter((unknown) => !unknown.resolved).length,
    viableUnblockedOutcomes: decision.outcomes.filter((outcome) =>
      outcome.viable && !pathBlockReason(decision, outcome),
    ).length,
    hasSelection: Boolean(decision.selection.outcomeId),
    canFinalize: gates.canFinalize,
  };
}
