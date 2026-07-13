import { useMemo } from 'react';
import {
  ensureDecisionSession,
  recalculateDecisionEconomics,
  rankDecisionOutcomes,
  evaluateDecisionOutcomes,
  decisionGates,
  decisionProgress,
  selectDecisionOutcome,
  updateDecisionOutcome,
  updateStopOutResponse,
  updateStructuredTestResult,
} from '../tarsDecisionEngine';
import type { TarsDecisionWork, TarsDecisionTest, TarsDecisionUnknown } from '../tarsDecisionTypes';
import type { TarsItem } from '../tarsTypes';
import type { TarsWorkSession } from '../tarsWorkTypes';

export function useTarsDecisionSession(
  item: TarsItem,
  session: TarsWorkSession,
  onSessionChange: (session: TarsWorkSession) => void,
) {
  const prepared = useMemo(
    () => ensureDecisionSession(session, item, session.decisionWork?.timestamps.updatedAt),
    [item, session],
  );
  const decision = prepared.decisionWork as TarsDecisionWork;
  const economics = useMemo(() => evaluateDecisionOutcomes(item, prepared), [item, prepared]);
  const ranked = useMemo(() => rankDecisionOutcomes(item, prepared), [item, prepared]);
  const gates = useMemo(() => decisionGates(prepared), [prepared]);
  const progress = useMemo(() => decisionProgress(prepared), [prepared]);

  const emit = (next: TarsWorkSession) =>
    onSessionChange(recalculateDecisionEconomics(item, next));

  const patchDecision = (patch: Partial<TarsDecisionWork>) => emit({
    ...prepared,
    decisionWork: {
      ...decision,
      ...patch,
      timestamps: { ...decision.timestamps, updatedAt: new Date().toISOString() },
    },
  });

  const patchHandoff = (patch: Partial<TarsDecisionWork['handoff']>) =>
    patchDecision({ handoff: { ...decision.handoff, ...patch } });

  const patchCondition = (patch: Partial<TarsDecisionWork['condition']>) =>
    patchDecision({ condition: { ...decision.condition, ...patch } });

  const patchSelection = (patch: Partial<TarsDecisionWork['selection']>) =>
    patchDecision({ selection: { ...decision.selection, ...patch } });

  const patchTest = (id: string, patch: Partial<TarsDecisionTest>) => patchDecision({
    tests: decision.tests.map((test) => test.id === id
      ? { ...test, ...patch, updatedAt: new Date().toISOString() } : test),
  });

  const patchUnknown = (id: string, patch: Partial<TarsDecisionUnknown>) => patchDecision({
    unknowns: decision.unknowns.map((unknown) => unknown.id === id
      ? { ...unknown, ...patch, updatedAt: new Date().toISOString() } : unknown),
  });

  const patchOutcome = (id: string, patch: Parameters<typeof updateDecisionOutcome>[2]) =>
    emit(updateDecisionOutcome(prepared, id, patch));

  const selectOutcome = (outcomeId: string) => emit(selectDecisionOutcome(prepared, outcomeId));

  const setStopOut = (stopOutId: string, response: 'clear' | 'blocked', notes = '') =>
    emit(updateStopOutResponse(prepared, stopOutId, response, notes));

  const setTestResult = (
    testId: string,
    result: Parameters<typeof updateStructuredTestResult>[2],
    evidence?: string,
  ) => emit(updateStructuredTestResult(prepared, testId, result, evidence));

  const addTest = () => {
    const now = new Date().toISOString();
    patchDecision({
      tests: [...decision.tests, {
        id: `custom-test:${now}:${decision.tests.length}`,
        catalogTestId: null,
        name: 'Custom test',
        prompt: '',
        relevant: true,
        result: null,
        evidence: '',
        createdAt: now,
        updatedAt: now,
      }],
    });
  };

  const addUnknown = () => {
    const now = new Date().toISOString();
    patchDecision({
      unknowns: [...decision.unknowns, {
        id: `unknown:${now}:${decision.unknowns.length}`,
        description: '',
        decisionImpact: '',
        resolved: false,
        resolution: '',
        createdAt: now,
        updatedAt: now,
      }],
    });
  };

  return {
    prepared,
    decision,
    economics,
    ranked,
    gates,
    progress,
    emit,
    patchDecision,
    patchHandoff,
    patchCondition,
    patchSelection,
    patchTest,
    patchUnknown,
    patchOutcome,
    selectOutcome,
    setStopOut,
    setTestResult,
    addTest,
    addUnknown,
  };
}
