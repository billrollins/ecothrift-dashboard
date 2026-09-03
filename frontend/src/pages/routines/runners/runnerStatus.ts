import type {
  AnyRoutineResponses,
  OwnerSpotResponses,
  RoutineKind,
  RoutineResponses,
  SectionAuditResponses,
  SectionTallyResponses,
  WorkCycleResponses,
} from '../../../api/routines.api';
import { failCount, unansweredCount } from '../scoring';

function hasChecklistSections(responses: AnyRoutineResponses | null): boolean {
  const sections = (responses as RoutineResponses | null)?.sections;
  return Array.isArray(sections) && sections.some((section) => Array.isArray(section?.checks));
}

/** A work-cycle payload has no check sections; scoring a checklist against it crashes. */
export function isWorkCycleResponses(
  responses: AnyRoutineResponses | null,
): responses is WorkCycleResponses {
  return Boolean(
    responses
    && typeof responses === 'object'
    && !hasChecklistSections(responses)
    && 'shelf' in responses
    && 'non_shelf' in responses,
  );
}

/** Prefer the payload when a draft arrives before the routine's kind does. */
export function resolveRunnerKind(
  kind: RoutineKind,
  responses: AnyRoutineResponses | null,
): RoutineKind {
  if (hasChecklistSections(responses)) return 'checklist';
  if (isWorkCycleResponses(responses)) return 'work_cycle';
  return kind;
}

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
  kind = resolveRunnerKind(kind, responses);
  if (kind === 'checklist') {
    const checklist = responses as RoutineResponses;
    const left = unansweredCount(checklist);
    const out = left > 0 ? [`${left} left to answer`] : [];
    const verifyLeft = (checklist.verify?.checks ?? []).filter((row) => !row.result).length;
    if (verifyLeft) out.push('Confirm every check from the last shift');
    return out;
  }
  if (kind === 'section_tally') {
    const tally = responses as SectionTallyResponses;
    return tally.sections?.length ? [] : ['You do not keep a section yet'];
  }
  if (kind === 'section_audit') return auditBlockers(responses as SectionAuditResponses);
  if (kind === 'work_cycle') {
    const cycle = responses as WorkCycleResponses;
    if (cycle.mode !== 'shelf' && cycle.mode !== 'non_shelf') return ['Pick shelf check or non-shelf check'];
    if (cycle.mode === 'shelf') {
      return cycle.shelf?.section_id ? [] : ['Pick the section you walked'];
    }
    const noted = Boolean((cycle.non_shelf?.notes || '').trim());
    return cycle.non_shelf?.done?.length || noted ? [] : ['Tick at least one check or write what you did'];
  }
  const spot = responses as OwnerSpotResponses;
  const unanswered = (spot.checks || []).filter((check) => !check.result).length;
  return [
    ...(unanswered ? [`${unanswered} drawn check${unanswered === 1 ? '' : 's'} left`] : []),
    ...auditBlockers(spot.audit),
  ];
}

export function auditBlockers(_audit: SectionAuditResponses | null): string[] {
  return [];
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
  kind = resolveRunnerKind(kind, responses);
  const sum = (counts: Record<string, number> | undefined) =>
    Object.values(counts || {}).reduce((total, n) => total + (Number(n) || 0), 0);
  if (kind === 'section_tally') {
    return (responses as SectionTallyResponses).sections
      .reduce((total, row) => total + sum(row.counts), 0);
  }
  if (kind === 'section_audit') return sum((responses as SectionAuditResponses).counts);
  if (kind === 'work_cycle') {
    const cycle = responses as WorkCycleResponses;
    if (cycle.mode === 'shelf') return sum(cycle.shelf.counts);
    return cycle.non_shelf.done.length;
  }
  if (kind === 'owner_spot') {
    const spot = responses as OwnerSpotResponses;
    return sum(spot.audit?.counts) + spot.checks.filter((check) => check.result === 'fail').length;
  }
  return failCount(responses as RoutineResponses);
}
