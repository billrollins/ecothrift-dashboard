import { describe, expect, it } from 'vitest';
import {
  normalizeProcessingHandoff,
  setProcessingQuickTestResult,
} from './processingHandoff';

describe('processing handoff', () => {
  it('defaults a new handoff to untested without optional evidence', () => {
    expect(normalizeProcessingHandoff(null)).toEqual({
      schema_version: 1,
      tested_status: 'untested',
    });
  });

  it('normalizes evidence and keeps valid quick test rows', () => {
    expect(normalizeProcessingHandoff({
      tested_status: 'partially_tested',
      condition_evidence: '  Scuff on housing  ',
      unknowns: ' ',
      quick_tests: [
        { test_id: 'power_on', name: 'Powers on', result: 'pass' },
        { test_id: 'bad_row', result: 'not-a-result' },
      ],
    })).toEqual({
      schema_version: 1,
      tested_status: 'partially_tested',
      condition_evidence: 'Scuff on housing',
      quick_tests: [{ test_id: 'power_on', name: 'Powers on', result: 'pass' }],
    });
  });

  it('sets, replaces, and clears one-tap quick test results', () => {
    const initial = normalizeProcessingHandoff(null);
    const preset = { test_id: 'power_on', name: 'Powers on' };
    const passed = setProcessingQuickTestResult(initial, preset, 'pass');
    const failed = setProcessingQuickTestResult(passed, preset, 'fail');

    expect(failed.quick_tests).toEqual([{ ...preset, result: 'fail' }]);
    expect(setProcessingQuickTestResult(failed, preset, null)).toEqual(initial);
  });
});
