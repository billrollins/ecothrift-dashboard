import { describe, expect, it } from 'vitest';
import {
  decisionGates,
  ensureDecisionSession,
  rankDecisionOutcomes,
  scoredMinutesForOutcome,
  selectDecisionOutcome,
  updateDecisionOutcome,
  updateStopOutResponse,
  updateStructuredTestResult,
} from './tarsDecisionEngine';
import { normalizeWorkSession } from './tarsJobAdapter';
import { createEmptyWorkSession } from './tarsWorkRollup';
import type { TarsItem } from './tarsTypes';
import type { TarsWorkSession } from './tarsWorkTypes';

const NOW = '2026-07-10T20:00:00.000Z';
const ITEM: TarsItem = {
  sku: 'ITM-1',
  name: 'Test item',
  source: 'Other' as TarsItem['source'],
  category: 'Test',
  stage: 'bench',
  scale: 'Functional',
  values: { Working: 100, Repairable: 80, 'Parts-only': 30 },
};

function prepared(): TarsWorkSession {
  return ensureDecisionSession(createEmptyWorkSession('bench'), ITEM, NOW);
}

function clearMandatory(session: TarsWorkSession): TarsWorkSession {
  return ['legal_prohibited_sale', 'handling_stop', 'truthful_disclosure']
    .reduce((next, id) => updateStopOutResponse(next, id, 'clear', '', NOW), session);
}

describe('decision economics', () => {
  it('ranks viable paths by contribution per labor minute', () => {
    let session = clearMandatory(prepared());
    session = updateDecisionOutcome(session, 'grade:Working', { estimatedMinutes: 120 }, NOW);
    session = updateDecisionOutcome(session, 'grade:Repairable', { estimatedMinutes: 30 }, NOW);
    session = updateDecisionOutcome(session, 'grade:Parts-only', { viable: false }, NOW);

    const ranked = rankDecisionOutcomes(ITEM, session);

    expect(ranked.map((row) => row.grade)).toEqual(['Repairable', 'Working']);
    expect(ranked[0].contributionPerLaborMinute).toBeGreaterThan(ranked[1].contributionPerLaborMinute);
  });

  it('applies minimum handling time to zero-work paths', () => {
    expect(scoredMinutesForOutcome({ estimatedMinutes: 0, saleState: 'as_is' })).toBe(5);
    expect(scoredMinutesForOutcome({ estimatedMinutes: 0, saleState: 'untested' })).toBe(5);
    expect(scoredMinutesForOutcome({ estimatedMinutes: 0, saleState: 'salvage' })).toBe(3);
    expect(scoredMinutesForOutcome({ estimatedMinutes: 12, saleState: 'salvage' })).toBe(12);
  });

  it('excludes paths constrained by a mandatory stop-out', () => {
    let session = prepared();
    session = updateDecisionOutcome(session, 'grade:Parts-only', { saleState: 'salvage' }, NOW);
    session = updateStopOutResponse(session, 'legal_prohibited_sale', 'blocked', '', NOW);
    session = updateStopOutResponse(session, 'handling_stop', 'clear', '', NOW);
    session = updateStopOutResponse(session, 'truthful_disclosure', 'clear', '', NOW);

    const ranked = rankDecisionOutcomes(ITEM, session);

    expect(ranked.map((row) => row.grade)).toEqual(['Parts-only']);
  });
});

describe('decision gates', () => {
  it('allows an ordinary override but never overrides a mandatory blocker', () => {
    let session = clearMandatory(prepared());
    session = {
      ...session,
      decisionWork: {
        ...session.decisionWork!,
        selection: {
          ...session.decisionWork!.selection,
          overrideReason: 'Cannot replace the required final decision.',
        },
      },
    };
    expect(decisionGates(session).canFinalize).toBe(false);

    session = selectDecisionOutcome(session, 'grade:Working', NOW);
    session = {
      ...session,
      decisionWork: {
        ...session.decisionWork!,
        selection: {
          ...session.decisionWork!.selection,
          reason: 'Best valid path',
          overrideReason: 'Condition detail unavailable; item is represented as untested.',
        },
      },
    };
    expect(decisionGates(session).canFinalize).toBe(true);

    session = updateStopOutResponse(session, 'handling_stop', 'blocked', 'Needs controlled handling', NOW);
    const blocked = decisionGates(session);
    expect(blocked.canFinalize).toBe(false);
    expect(blocked.mandatoryBlockers).not.toHaveLength(0);
  });
});

describe('legacy normalization', () => {
  it('normalizes partial legacy sessions and creates decision defaults', () => {
    const normalized = normalizeWorkSession({
      workState: 'bench',
      selectedGrade: 'Working',
      parts: null,
      gradePlans: null,
      benchRows: [{ id: 'old', category: 'test', name: 'Old', notes: '', result: 'pass' }],
    });

    expect(normalized.workState).toBe('bench');
    expect(normalized.parts).toEqual([]);
    expect(normalized.orders).toEqual([]);
    expect(normalized.gradePlans).toEqual({});
    expect(normalized.benchRows).toHaveLength(1);
    expect(normalized.decisionWork?.schemaVersion).toBe(1);
    expect(normalized.decisionWork?.catalogVersion).toBe('phase1-mvp-v1');
  });

  it('preserves saved decision fields while filling missing nested fields', () => {
    const normalized = normalizeWorkSession({
      decisionWork: {
        handoff: { acknowledged: true, contextSummary: 'Ashley note' },
        selection: { grade: 'Repairable', reason: 'Known issue' },
      },
    });

    expect(normalized.decisionWork?.handoff.contextSummary).toBe('Ashley note');
    expect(normalized.decisionWork?.selection.grade).toBe('Repairable');
    expect(normalized.decisionWork?.condition.testedStatus).toBe('not_tested');
  });
});

describe('immutable update helpers', () => {
  it('syncs chosen grade and estimated minutes to legacy work-session fields', () => {
    const original = prepared();
    const estimated = updateDecisionOutcome(original, 'grade:Working', { estimatedMinutes: 90 }, NOW);
    const selected = selectDecisionOutcome(estimated, 'grade:Working', NOW);
    const revised = updateDecisionOutcome(selected, 'grade:Working', {
      action: 'assemble',
      saleState: 'as_is',
    }, NOW);

    expect(original.gradePlans.Working).toBeUndefined();
    expect(estimated.gradePlans.Working.estimateHours).toBe(1.5);
    expect(selected.selectedGrade).toBe('Working');
    expect(selected.decisionWork?.selection.grade).toBe('Working');
    expect(revised.decisionWork?.selection.action).toBe('assemble');
    expect(revised.decisionWork?.selection.saleState).toBe('as_is');
  });

  it('syncs a structured result to a WorkBench test row without mutation', () => {
    const original = prepared();
    const testId = 'catalog-test:visual_identity_condition';
    const updated = updateStructuredTestResult(original, testId, 'pass', 'Identity matches', NOW);

    expect(original.benchRows).toEqual([]);
    expect(updated.decisionWork?.tests.find((test) => test.id === testId)?.result).toBe('pass');
    expect(updated.benchRows).toContainEqual({
      id: `decision-test:${testId}`,
      category: 'test',
      name: 'Identity and visible condition',
      notes: 'Identity matches',
      result: 'pass',
    });
  });
});
