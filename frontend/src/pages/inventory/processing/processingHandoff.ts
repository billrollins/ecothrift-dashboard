import type {
  ProcessingHandoff,
  ProcessingQuickTestResult,
  ProcessingQuickTestRow,
  ProcessingTestedStatus,
} from '../../../types/inventory.types';

export const PROCESSING_QUICK_TEST_PRESETS = [
  { test_id: 'power_on', name: 'Powers on' },
  { test_id: 'controls_respond', name: 'Controls respond' },
  { test_id: 'basic_function', name: 'Basic function works' },
  { test_id: 'handling_stop', name: 'No obvious handling stop-out' },
] as const;

export const PROCESSING_TESTED_STATUSES: Array<{
  value: ProcessingTestedStatus;
  label: string;
}> = [
  { value: 'untested', label: 'Untested' },
  { value: 'partially_tested', label: 'Partially tested' },
  { value: 'tested', label: 'Tested' },
];

export const PROCESSING_QUICK_TEST_RESULTS: Array<{
  value: ProcessingQuickTestResult;
  label: string;
}> = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'unknown', label: 'Unsure' },
];

const testedStatuses = new Set<ProcessingTestedStatus>(
  PROCESSING_TESTED_STATUSES.map(({ value }) => value),
);
const quickTestResults = new Set<ProcessingQuickTestResult>(
  PROCESSING_QUICK_TEST_RESULTS.map(({ value }) => value),
);

function optionalText(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

export function normalizeProcessingHandoff(value: unknown): ProcessingHandoff {
  const input = value && typeof value === 'object' ? value as Partial<ProcessingHandoff> : {};
  const testedStatus =
    typeof input.tested_status === 'string' &&
    testedStatuses.has(input.tested_status as ProcessingTestedStatus)
      ? input.tested_status as ProcessingTestedStatus
      : 'untested';
  const quickTests = Array.isArray(input.quick_tests)
    ? input.quick_tests.flatMap((row): ProcessingQuickTestRow[] => {
        if (!row || typeof row !== 'object') return [];
        const candidate = row as Partial<ProcessingQuickTestRow>;
        const testId = optionalText(candidate.test_id);
        const name = optionalText(candidate.name);
        if (
          (!testId && !name) ||
          typeof candidate.result !== 'string' ||
          !quickTestResults.has(candidate.result as ProcessingQuickTestResult)
        ) {
          return [];
        }
        const notes = optionalText(candidate.notes);
        return [{
          ...(testId ? { test_id: testId } : {}),
          ...(name ? { name } : {}),
          result: candidate.result as ProcessingQuickTestResult,
          ...(notes ? { notes } : {}),
        }];
      })
    : [];
  const conditionEvidence = optionalText(input.condition_evidence);
  const unknowns =
    Array.isArray(input.unknowns)
      ? input.unknowns.map(optionalText).filter((text): text is string => Boolean(text))
      : optionalText(input.unknowns);

  return {
    schema_version: 1,
    tested_status: testedStatus,
    ...(conditionEvidence ? { condition_evidence: conditionEvidence } : {}),
    ...(Array.isArray(unknowns) ? (unknowns.length ? { unknowns } : {}) : (unknowns ? { unknowns } : {})),
    ...(quickTests.length ? { quick_tests: quickTests } : {}),
  };
}

export function processingHandoffUnknownsText(handoff: ProcessingHandoff): string {
  return Array.isArray(handoff.unknowns) ? handoff.unknowns.join('\n') : handoff.unknowns ?? '';
}

export function setProcessingQuickTestResult(
  handoff: ProcessingHandoff,
  test: Readonly<{ test_id: string; name: string }>,
  result: ProcessingQuickTestResult | null,
): ProcessingHandoff {
  const rows = (handoff.quick_tests ?? []).filter((row) => row.test_id !== test.test_id);
  if (result) rows.push({ ...test, result });
  return normalizeProcessingHandoff({
    ...handoff,
    quick_tests: rows,
  });
}
