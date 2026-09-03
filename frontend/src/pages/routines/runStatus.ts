import type { RoutineRun } from '../../api/routines.api';
import type { StatusTagTone } from '../../components/duty/tokens';
import type { TaskRowTone } from '../../components/duty/TaskRow';
import { t } from '../../i18n/routines';
import { runUrgency } from './runIsDue';

/** What the tile on the left of a run row draws. Icons live in `routineGlyphs.tsx`. */
export type RunGlyph = 'alert' | 'pin' | 'today' | 'week' | 'progress' | 'passed' | 'failed' | 'critical';

export interface RunPresentation {
  /** Tone of the glyph tile. Same meaning in every routine list. */
  rail: TaskRowTone;
  glyph: RunGlyph;
  /** Only facts the row's position in the list does not already say. */
  badges: Array<{ label: string; tone: StatusTagTone }>;
  /** The one thing you can do with this row. */
  action: 'fill' | 'continue' | 'review';
  actionLabel: string;
}

/**
 * One status model for every routine surface.
 *
 * `inGroup` is the bucket the row is being drawn in. A badge is never shown
 * for the fact the group header already states (an "Overdue" chip inside the
 * Overdue group is noise), but the same fact *is* shown when the row sits
 * somewhere else - an overdue run pinned in Blocking still needs the word.
 */
export function presentRun(
  run: RoutineRun,
  inGroup: 'blocking' | 'overdue' | 'today' | 'week' | 'done',
  language?: string | null,
): RunPresentation {
  if (inGroup === 'done' || run.status === 'done') {
    const badges: RunPresentation['badges'] = [];
    let glyph: RunGlyph = 'passed';
    if (run.has_critical_fail) {
      glyph = 'critical';
      badges.push({ label: t('criticalFail', language), tone: 'red' });
    } else if (run.failed_count > 0) {
      glyph = 'failed';
      const failWord = run.failed_count === 1 ? t('failOne', language) : t('failMany', language);
      badges.push({ label: `${run.failed_count} ${failWord}`, tone: 'red' });
    } else badges.push({ label: t('passed', language), tone: 'green' });
    if (run.completed_late) badges.push({ label: t('late', language), tone: 'amber' });
    return {
      rail: glyph === 'passed' ? 'green' : 'red',
      glyph,
      badges,
      action: 'review',
      actionLabel: t('review', language),
    };
  }

  const badges: RunPresentation['badges'] = [];
  if (inGroup === 'blocking' && run.is_overdue) badges.push({ label: t('overdue', language), tone: 'red' });
  // The hard nag has started but the deadline has not passed: the row says so
  // even though the group header cannot, since it is still filed under today.
  else if (!run.is_overdue && runUrgency(run) === 'hard') badges.push({ label: t('dueNow', language), tone: 'amber' });
  const started = (run.progress?.answered ?? 0) > 0;
  if (started && run.progress) {
    badges.push({ label: `${run.progress.answered}/${run.progress.total}`, tone: 'blue' });
  }

  let rail: TaskRowTone;
  let glyph: RunGlyph;
  if (inGroup === 'blocking') {
    rail = 'violet';
    glyph = 'pin';
  } else if (run.is_overdue) {
    rail = 'red';
    glyph = 'alert';
  } else if (started) {
    rail = 'blue';
    glyph = 'progress';
  } else if (inGroup === 'today') {
    rail = 'brand';
    glyph = 'today';
  } else {
    rail = 'none';
    glyph = 'week';
  }

  return {
    rail,
    glyph,
    badges,
    action: started ? 'continue' : 'fill',
    actionLabel: started ? t('continue', language) : t('fillIn', language),
  };
}
