import type {
  AnyRoutineResponses,
  OwnerSpotResponses,
  RoutineKind,
  RoutineResponses,
  SectionAuditResponses,
  SectionTallyResponses,
} from '../../../api/routines.api';
import { failCount, unansweredCount } from '../scoring';

/**
 * Why the Submit button is not ready yet, in the order a person would fix
 * them. Mirrors `apps/routines/kinds.submit_blockers` so the phone never
 * lets someone reach a refusal they could have been told about up front.
 */
export function runnerBlockers(
  kind: RoutineKind,
  responses: AnyRoutineResponses | null,
  minItems: number,
): string[] {
  if (!responses) return ['Loading'];
  if (kind === 'checklist') {
    const checklist = responses as RoutineResponses;
    const left = unansweredCount(checklist);
    const out = left > 0 ? [`${left} left to answer`] : [];
    if (checklist.verify && !checklist.verify.result) out.push('Sign off on the last shift');
    return out;
  }
  if (kind === 'section_tally') {
    const tally = responses as SectionTallyResponses;
    return tally.sections.length ? [] : ['You do not keep a section yet'];
  }
  if (kind === 'section_audit') return auditBlockers(responses as SectionAuditResponses, minItems);
  const spot = responses as OwnerSpotResponses;
  const unanswered = (spot.checks || []).filter((check) => !check.result).length;
  return [
    ...(unanswered ? [`${unanswered} drawn check${unanswered === 1 ? '' : 's'} left`] : []),
    ...auditBlockers(spot.audit, minItems),
  ];
}

export function auditBlockers(audit: SectionAuditResponses | null, minItems: number): string[] {
  if (!audit) return ['Loading'];
  const out: string[] = [];
  if (!audit.photo) out.push('Photo of the section first');
  if ((audit.items_inspected || 0) < minItems) out.push(`Inspect at least ${minItems} items`);
  return out;
}

/** The label on the Submit button: the next blocker, or what submitting will record. */
export function submitLabel(
  kind: RoutineKind,
  responses: AnyRoutineResponses | null,
  minItems: number,
): string {
  const blockers = runnerBlockers(kind, responses, minItems);
  if (blockers.length) return blockers[0];
  if (kind === 'checklist') {
    const fails = failCount(responses as RoutineResponses);
    return fails > 0 ? `Submit with ${fails} fail${fails === 1 ? '' : 's'}` : 'Submit';
  }
  const found = issuesFound(kind, responses);
  return found > 0 ? `Submit · ${found} logged` : 'Submit · nothing found';
}

/** Total issues counted, across whichever shape this kind uses. */
export function issuesFound(kind: RoutineKind, responses: AnyRoutineResponses | null): number {
  if (!responses) return 0;
  const sum = (counts: Record<string, number> | undefined) =>
    Object.values(counts || {}).reduce((total, n) => total + (Number(n) || 0), 0);
  if (kind === 'section_tally') {
    return (responses as SectionTallyResponses).sections
      .reduce((total, row) => total + sum(row.counts), 0);
  }
  if (kind === 'section_audit') return sum((responses as SectionAuditResponses).counts);
  if (kind === 'owner_spot') {
    const spot = responses as OwnerSpotResponses;
    return sum(spot.audit?.counts) + spot.checks.filter((check) => check.result === 'fail').length;
  }
  return failCount(responses as RoutineResponses);
}
