import { describe, expect, it } from 'vitest';
import { auditBlockers, issuesFound, runnerBlockers, submitLabel } from './runnerStatus';
import { previewAudit, previewSpot, previewTally } from './previewFixtures';
import type { RoutineResponses, SectionAuditResponses } from '../../../api/routines.api';

function checklist(over: Partial<RoutineResponses> = {}): RoutineResponses {
  return {
    sections: [{
      id: 'floor',
      title: 'Floor',
      checks: [
        { id: 'a', label: 'Swept', control: 'pass_fail', result: 'pass', value: null, photo: null, photo_file_id: null, notes: '', touched: true },
        { id: 'b', label: 'Locked', control: 'pass_fail', result: '', value: null, photo: null, photo_file_id: null, notes: '', touched: false },
      ],
    }],
    ...over,
  };
}

function readyAudit(over: Partial<SectionAuditResponses> = {}): SectionAuditResponses {
  return { ...previewAudit(), photo: 'data:image/png;base64,x', items_inspected: 30, ...over };
}

describe('runnerBlockers for a checklist', () => {
  it('counts what is unanswered', () => {
    expect(runnerBlockers('checklist', checklist(), 20)).toEqual(['1 left to answer']);
  });

  it('also wants the sign-off on the shift before', () => {
    const withVerify = checklist({ verify: { run_id: 4, result: '', note: '' } });
    withVerify.sections[0].checks[1].result = 'pass';
    expect(runnerBlockers('checklist', withVerify, 20)).toEqual(['Sign off on the last shift']);
  });

  it('is clear once everything is answered', () => {
    const done = checklist();
    done.sections[0].checks[1].result = 'fail';
    expect(runnerBlockers('checklist', done, 20)).toEqual([]);
    expect(submitLabel('checklist', done, 20)).toBe('Submit with 1 fail');
  });
});

describe('auditBlockers', () => {
  it('asks for the photo before anything else', () => {
    expect(auditBlockers(previewAudit(), 20)).toEqual([
      'Photo of the section first',
      'Inspect at least 20 items',
    ]);
  });

  it('still refuses a glance at four items', () => {
    expect(auditBlockers(readyAudit({ items_inspected: 4 }), 20)).toEqual(['Inspect at least 20 items']);
  });

  it('clears once both gates are past', () => {
    expect(auditBlockers(readyAudit(), 20)).toEqual([]);
  });
});

describe('runnerBlockers for section kinds', () => {
  it('lets a tally through as soon as someone keeps a section', () => {
    expect(runnerBlockers('section_tally', previewTally(), 20)).toEqual([]);
    expect(runnerBlockers('section_tally', { sections: [] }, 20)).toEqual([
      'You do not keep a section yet',
    ]);
  });

  it('wants the drawn checks answered and the audit gated', () => {
    const spot = previewSpot();
    expect(runnerBlockers('owner_spot', spot, 20)).toEqual([
      '2 drawn checks left',
      'Photo of the section first',
      'Inspect at least 20 items',
    ]);
    spot.checks = spot.checks.map((check) => ({ ...check, result: 'pass' as const }));
    spot.audit = readyAudit();
    expect(runnerBlockers('owner_spot', spot, 20)).toEqual([]);
  });
});

describe('issuesFound', () => {
  it('adds up counts across every shape', () => {
    expect(issuesFound('section_audit', readyAudit({ counts: { reshelf: 3, clean: 2 } }))).toBe(5);

    const tally = previewTally();
    tally.sections[0].counts = { hangers: 4 };
    tally.sections[1].counts = { reshelf: 1 };
    expect(issuesFound('section_tally', tally)).toBe(5);

    const spot = previewSpot();
    spot.checks[0].result = 'fail';
    spot.audit = readyAudit({ counts: { security: 2 } });
    expect(issuesFound('owner_spot', spot)).toBe(3);
  });
});

describe('submitLabel', () => {
  it('names the first blocker, then what will be recorded', () => {
    expect(submitLabel('section_audit', previewAudit(), 20)).toBe('Photo of the section first');
    expect(submitLabel('section_audit', readyAudit(), 20)).toBe('Submit · nothing found');
    expect(submitLabel('section_audit', readyAudit({ counts: { reshelf: 2 } }), 20))
      .toBe('Submit · 2 logged');
  });
});
