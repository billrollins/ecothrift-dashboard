import { TARS_MANDATORY_STOP_OUTS } from '../tarsDecisionCatalog';
import type { TarsDecisionWork } from '../tarsDecisionTypes';
import type { TarsStudioStepId } from './tarsStudioTheme';

export function stepComplete(step: TarsStudioStepId, decision: TarsDecisionWork): boolean {
  switch (step) {
    case 'handoff':
      return decision.handoff.acknowledged;
    case 'stopouts':
      return TARS_MANDATORY_STOP_OUTS.every((entry) => {
        const response = decision.stopOut.responses.find((r) => r.stopOutId === entry.id);
        return response && response.response !== 'unanswered';
      });
    case 'evidence':
      return Boolean(
        decision.condition.evidence.trim()
        && decision.condition.completeness !== 'unknown'
        && decision.condition.testedStatus,
      );
    case 'tests':
      return !decision.tests.some((test) => test.relevant && test.result === null);
    case 'paths':
      return Boolean(decision.selection.outcomeId);
    case 'decide':
      return Boolean(
        decision.selection.reason.trim()
        && decision.selection.grade
        && decision.selection.action
        && decision.selection.saleState,
      );
    default:
      return false;
  }
}

export function stepHint(step: TarsStudioStepId, decision: TarsDecisionWork): string {
  switch (step) {
    case 'handoff':
      return decision.handoff.acknowledged
        ? 'Processing context reviewed.'
        : 'Review Ashley\'s handoff and acknowledge before continuing.';
    case 'stopouts':
      return decision.stopOut.blocked
        ? 'A mandatory stop is active - use Hold or a compatible salvage path.'
        : 'Answer every stop-out. These cannot be overridden by margin.';
    case 'evidence':
      return 'Record what you see. This drives truthful sale state and grade direction.';
    case 'tests':
      return 'Only run tests that can change the decision. Skip or mark N/A when irrelevant.';
    case 'paths':
      return 'Compare contribution per labor minute. Parts and minutes change the ranking.';
    case 'decide':
      return 'Commit the grade, action, sale state, and a reason Mike can explain later.';
    default:
      return '';
  }
}
