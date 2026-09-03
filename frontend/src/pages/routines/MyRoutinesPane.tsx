import { Box, Typography } from '@mui/material';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GroupHeader } from '../../components/duty/GroupHeader';
import { StatusTag } from '../../components/duty/StatusTag';
import { TaskRow, TaskRowAction } from '../../components/duty/TaskRow';
import { dutyColors, thinScrollSx } from '../../components/duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useMyRoutineRuns } from '../../hooks/useRoutines';
import { pick, t } from '../../i18n/routines';
import type { Routine, RoutineDraft, RoutineRun } from '../../api/routines.api';
import { groupRoutineRuns } from './groupRoutineRuns';
import { RoutineListHeader } from './RoutineListHeader';
import { runGlyphIcon, triggerGlyphIcon } from './routineGlyphs';
import { presentRun } from './runStatus';

function whenStamp(iso: string, language: string): string {
  return format(parseISO(iso), 'EEE h:mma', { locale: language === 'es' ? es : undefined });
}

function runMeta(run: RoutineRun, language: string): string {
  const when = run.nag_at
    ? whenStamp(run.nag_at, language)
    : `${format(parseISO(run.due_at), 'EEE', { locale: language === 'es' ? es : undefined })} ${t('byClockOut', language)}`;
  const who = run.assignment === 'pooled'
    ? (run.audience_type === 'shift' ? t('anyoneOnShift', language) : t('anyoneAssigned', language))
    : (run.assigned_to_name || t('assigned', language));
  const subject = run.section_name || run.subject;
  return `${when} · ${who}${subject ? ` · ${subject}` : ''}`;
}

function draftMeta(draft: RoutineDraft, language: string): string {
  const when = draft.started_at ? whenStamp(draft.started_at, language) : t('started', language);
  const mode = draft.mode === 'shelf'
    ? t('shelfCheck', language)
    : draft.mode === 'non_shelf'
      ? t('nonShelfCheck', language)
      : t('started', language);
  const section = draft.section_name ? ` · ${draft.section_name}` : '';
  return `${mode}${section} · ${when}`;
}

export function MyRoutinesPane({ desktop }: { desktop: boolean }) {
  const { user } = useAuth();
  const lang = user?.language === 'es' ? 'es' : 'en';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openRunId = Number(params.get('run') || 0) || null;
  const { data, isError } = useMyRoutineRuns();
  const grouped = useMemo(
    () => groupRoutineRuns(data?.open ?? [], data?.done ?? []),
    [data],
  );

  function fillRun(run: RoutineRun) {
    navigate(desktop ? `/routines?run=${run.id}` : `/routines/run/${run.id}`);
  }

  function fillOnDemand(routine: Routine) {
    navigate(`/routines/run/new?routine=${routine.id}`);
  }

  function fillDraft(draft: RoutineDraft) {
    navigate(draft.href);
  }

  const overdue = grouped.overdue;
  const today = grouped.today;
  const blocking = grouped.blocking;
  const onDemand = data?.on_demand ?? [];
  const drafts = data?.drafts ?? [];

  function runRow(run: RoutineRun, group: 'blocking' | 'overdue' | 'today') {
    const view = presentRun(run, group, lang);
    return (
      <TaskRow
        key={run.id}
        title={pick(run, 'title', lang) || run.title}
        tone={view.rail}
        glyph={runGlyphIcon(view.glyph)}
        selected={openRunId === run.id}
        onClick={() => fillRun(run)}
        meta={runMeta(run, lang)}
        tags={view.badges.map((badge) => (
          <StatusTag key={badge.label} small label={badge.label} tone={badge.tone} />
        ))}
        actions={(
          <TaskRowAction
            label={view.actionLabel}
            primary={view.action !== 'review'}
            onClick={() => fillRun(run)}
          />
        )}
      />
    );
  }

  const none = (
    <Typography sx={{ px: 2.5, pb: 1.25, fontSize: 12, color: dutyColors.ink40, minHeight: 18 }}>
      {t('none', lang)}
    </Typography>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.paper }}>
      <RoutineListHeader
        view="mine"
        desktop={desktop}
        onView={(next) => navigate(next === 'catalog' ? '/routines/catalog' : '/routines')}
        error={isError ? t('couldNotLoad', lang) : undefined}
      />
      <Box sx={{ flex: 1, overflow: 'auto', pb: 2, ...thinScrollSx }}>
        {blocking.map((run) => runRow(run, 'blocking'))}

        <GroupHeader title={t('inProgress', lang)} count={drafts.length} />
        {drafts.length ? drafts.map((draft) => (
          <TaskRow
            key={draft.id}
            title={draft.routine_title}
            tone="brand"
            glyph={triggerGlyphIcon('on_demand')}
            onClick={() => fillDraft(draft)}
            meta={draftMeta(draft, lang)}
            actions={(
              <TaskRowAction label={t('continue', lang)} primary onClick={() => fillDraft(draft)} />
            )}
          />
        )) : none}

        <GroupHeader title={t('overdue', lang)} count={overdue.length} />
        {overdue.length ? overdue.map((run) => runRow(run, 'overdue')) : none}

        <GroupHeader title={t('dueToday', lang)} count={today.length} />
        {today.length ? today.map((run) => runRow(run, 'today')) : none}

        <GroupHeader title={t('onDemand', lang)} count={onDemand.length} />
        {onDemand.length ? onDemand.map((routine) => (
          <TaskRow
            key={routine.id}
            title={pick(routine, 'title', lang) || routine.title}
            tone="brand"
            glyph={triggerGlyphIcon('on_demand')}
            onClick={() => fillOnDemand(routine)}
            meta={pick(routine, 'intro', lang) || routine.intro || t('startWhenever', lang)}
            actions={(
              <TaskRowAction label={t('fillIn', lang)} primary onClick={() => fillOnDemand(routine)} />
            )}
          />
        )) : none}
      </Box>
    </Box>
  );
}
