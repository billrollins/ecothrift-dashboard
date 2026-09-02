import type { RoutineCheckResponse, RoutineResponses } from '../../api/routines.api';

export function deriveResult(check: RoutineCheckResponse): RoutineCheckResponse['result'] {
  if (check.control === 'pass_fail' && (check.result === 'pass' || check.result === 'fail' || check.result === 'na')) {
    return check.result;
  }
  if (check.control === 'pass_fail_strict' && (check.result === 'pass' || check.result === 'fail')) {
    return check.result;
  }
  if (check.control === 'number') {
    return typeof check.value === 'number' ? 'pass' : '';
  }
  if (check.control === 'text') {
    return String(check.value || '').trim() ? 'pass' : '';
  }
  if (check.control === 'photo') {
    return check.photo ? 'pass' : '';
  }
  return '';
}

export function flattenChecks(responses: RoutineResponses | null): RoutineCheckResponse[] {
  return responses?.sections.flatMap((section) => section.checks) ?? [];
}

export function unansweredCount(responses: RoutineResponses | null): number {
  return flattenChecks(responses).filter((check) => !deriveResult(check)).length;
}

export function failCount(responses: RoutineResponses | null): number {
  return flattenChecks(responses).filter((check) => deriveResult(check) === 'fail').length;
}

export function answeredCount(responses: RoutineResponses | null): number {
  const checks = flattenChecks(responses);
  return checks.filter((check) => Boolean(deriveResult(check))).length;
}
