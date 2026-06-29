import type {
  QualityAuditCheck,
  QualityAuditResponses,
  QualityAuditSection,
  QualityCheckResult,
} from '../../types/qualityAudit.types';
import { QA_CONTROL_LABELS } from '../../types/qualityAudit.types';

/** Derive pass/fail/na from a check's control-specific fields (mirrors backend). */
export function deriveResult(check: QualityAuditCheck): QualityCheckResult {
  const result = (check.result || '').toLowerCase();
  if (result === 'pass' || result === 'fail' || result === 'na') return result;
  const control = (check.control || 'yesno').toLowerCase();

  if (control === 'rating' || control === 'emoji') {
    const r = check.rating;
    if (typeof r === 'number') {
      if (r >= 4) return 'pass';
      if (r <= 2) return 'fail';
      return 'na';
    }
    return '';
  }
  if (control === 'severity') {
    return check.severity === 'none' ? 'pass' : check.severity ? 'fail' : '';
  }
  if (control === 'slider') {
    const s = check.score;
    if (typeof s === 'number') {
      if (s >= 80) return 'pass';
      if (s <= 50) return 'fail';
      return 'na';
    }
    return '';
  }
  if (control === 'chips') return check.tags && check.tags.length > 0 ? 'fail' : 'pass';
  if (control === 'counter') {
    const c = check.count;
    if (typeof c === 'number') return c === 0 ? 'pass' : 'fail';
    return '';
  }
  if (control === 'zone') return check.zone ? 'pass' : '';
  if (control === 'photo') return check.photo ? 'pass' : 'fail';
  if (control === 'confidence') return check.confidence ? 'pass' : '';
  if (control === 'priority') return check.priority ? 'pass' : '';
  if (control === 'comment') return check.comment && check.comment.trim() ? 'pass' : '';
  if (control === 'grade') {
    const l = (check.letter || '').toUpperCase();
    if (['A', 'B', 'C'].includes(l)) return 'pass';
    if (['D', 'F'].includes(l)) return 'fail';
    return '';
  }
  return '';
}

export function isCheckComplete(check: QualityAuditCheck): boolean {
  return deriveResult(check) !== '';
}

export function countSectionAnswered(section: QualityAuditSection): number {
  return section.checks.filter(isCheckComplete).length;
}

export function isSectionComplete(section: QualityAuditSection): boolean {
  return section.checks.length > 0 && section.checks.every(isCheckComplete);
}

export function totalChecks(responses: QualityAuditResponses): number {
  return responses.sections.reduce((sum, section) => sum + section.checks.length, 0);
}

export function answeredChecks(responses: QualityAuditResponses): number {
  return responses.sections.reduce((sum, section) => sum + countSectionAnswered(section), 0);
}

export function passRate(responses: QualityAuditResponses): number {
  let scored = 0;
  let passed = 0;
  for (const section of responses.sections) {
    for (const check of section.checks) {
      const result = deriveResult(check);
      if (result === 'pass' || result === 'fail') {
        scored += 1;
        if (result === 'pass') passed += 1;
      }
    }
  }
  if (scored === 0) return 0;
  return passed / scored;
}

export function gradeFromPassRate(rate: number): string {
  if (rate >= 0.95) return 'A';
  if (rate >= 0.85) return 'B';
  if (rate >= 0.75) return 'C';
  if (rate >= 0.65) return 'D';
  return 'F';
}

export function overallGrade(responses: QualityAuditResponses): string {
  return gradeFromPassRate(passRate(responses));
}

export function completionPct(responses: QualityAuditResponses): number {
  const total = totalChecks(responses);
  if (total === 0) return 0;
  return Math.round((answeredChecks(responses) / total) * 100);
}

export function formatCheckResult(result: QualityCheckResult): string {
  if (result === 'pass') return 'Pass';
  if (result === 'fail') return 'Fail';
  if (result === 'na') return 'N/A';
  return '—';
}

const RESULT_COLORS: Record<QualityCheckResult, 'success' | 'error' | 'neutral' | 'warning'> = {
  pass: 'success',
  fail: 'error',
  na: 'neutral',
  '': 'warning',
};

export function resultColor(result: QualityCheckResult): 'success' | 'error' | 'neutral' | 'warning' {
  return RESULT_COLORS[result];
}

/** Human summary of a check's answer for the summary screen. */
export function summarizeCheck(check: QualityAuditCheck): string {
  const control = (check.control || 'yesno').toLowerCase();
  if (control === 'rating' || control === 'emoji') {
    return check.rating != null ? `${check.rating}/5 stars` : 'Not answered';
  }
  if (control === 'severity') {
    return check.severity ? check.severity.charAt(0).toUpperCase() + check.severity.slice(1) : 'Not answered';
  }
  if (control === 'slider') {
    return check.score != null ? `Condition ${check.score}/100` : 'Not answered';
  }
  if (control === 'chips') {
    return check.tags && check.tags.length > 0 ? `${check.tags.length} issue${check.tags.length > 1 ? 's' : ''} · ${check.tags.join(', ')}` : 'No issues';
  }
  if (control === 'counter') {
    return check.count != null ? `${check.count} found` : 'Not answered';
  }
  if (control === 'zone') {
    return check.zone ? `Zone: ${check.zone}` : 'Not answered';
  }
  if (control === 'photo') {
    return check.photo ? 'Photo captured' : 'No photo';
  }
  if (control === 'confidence') {
    return check.confidence ? `${check.confidence} confidence` : 'Not answered';
  }
  if (control === 'priority') {
    return check.priority ? `Priority: ${check.priority}` : 'Not answered';
  }
  if (control === 'comment') {
    return check.comment ? check.comment : 'No comment';
  }
  if (control === 'grade') {
    return check.letter ? `Grade ${check.letter}` : 'Not answered';
  }
  return formatCheckResult(deriveResult(check));
}

export function controlLabel(control: string): string {
  return QA_CONTROL_LABELS[control as keyof typeof QA_CONTROL_LABELS] ?? control;
}
