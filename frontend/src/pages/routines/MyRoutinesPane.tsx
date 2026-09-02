import { Box, Typography } from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GroupHeader } from '../../components/duty/GroupHeader';
import { StatusTag } from '../../components/duty/StatusTag';
import { TaskRow, TaskRowAction, TaskRowIcon } from '../../components/duty/TaskRow';
import { dutyColors, thinScrollSx } from '../../components/duty/tokens';
import { useAuth } from '../../hooks/useAuth';
import { useMyRoutineRuns } from '../../hooks/useRoutines';
import type { Routine, RoutineDraft, RoutineRun } from '../../api/routines.api';
import { groupRoutineRuns } from './groupRoutineRuns';
import { RoutineListHeader } from './RoutineListHeader';
import { matchesQuery } from './matchesQuery';
import { runGlyphIcon, triggerGlyphIcon } from './routineGlyphs';
import { presentRun } from './runStatus';

function runMeta(run: RoutineRun): string {
  const when = run.nag_at
    ? format(parseISO(run.nag_at), 'EEE h:mma')
    : `${format(parseISO(run.due_at), 'EEE')} by clock-out`;
  const who = run.assignment === 'pooled' ? 'Anyone on shift' : (run.assigned_to_name || 'Assigned');
  const subject = run.section_name || run.subject;
  return `${when} · ${who}${subject ? ` · ${subject}` : ''}`;
}

function draftMeta(draft: RoutineDraft): string {
  const when = draft.started_at ? format(parseISO(draft.started_at), 'EEE h:mma') : 'Started';
  const mode = draft.mode === 'shelf'
    ? 'Shelf check'
    : draft.mode === 'non_shelf'
      ? 'Non-shelf check'
      : 'Started';
  const section = draft.section_name ? ` · ${draft.section_name}` : '';
  return `${mode}${section} · ${when}`;
}

function doneMeta(run: RoutineRun): string {
  const when = run.completed_at ? format(parseISO(run.completed_at), 'EEE h:mma') : '';
  const who = run.completed_by_name ? ` · ${run.completed_by_name}` : '';
  const subject = run.subject ? ` · ${run.subject}` : '';
  return `${when}${who}${subject}`;
}

export function MyRoutinesPane({ desktop }: { desktop: boolean }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openRunId = Number(params.get('run') || 0) || null;
  const { data, isError } = useMyRoutineRuns();
  const [query, setQuery] = useState('');
  const [doneOpen, setDoneOpen] = useState(false);
  const grouped = useMemo(
    () => groupRoutineRuns(data?.open ?? [], data?.done ?? []),
    [data],
  );
  const canEdit = Boolean(user?.is_superuser);

  function fillRun(run: RoutineRun) {
    navigate(desktop ? `/routines?run=${run.id}` : `/routines/run/${run.id}`);
  }

  function fillOnDemand(routine: Routine) {
    navigate(`/routines/run/new?routine=${routine.id}`);
  }

  function fillDraft(draft: RoutineDraft) {
    navigate(draft.href);
  }

  function editRoutine(routineId: number) {
    navigate(`/routines/${routineId}/edit`);
  }

  const filterRuns = (runs: RoutineRun[]) => runs.filter((run) => matchesQuery(query, run.title, run.subject));
  const overdue = filterRuns(grouped.overdue);
  const today = filterRuns(grouped.today);
  const week = filterRuns(grouped.week);
  const done = filterRuns(grouped.done);
  const blocking = filterRuns(grouped.blocking);
  const onDemand = (data?.on_demand ?? []).filter((routine) => matchesQuery(query, routine.title, routine.intro));
  const drafts = (data?.drafts ?? []).filter((draft) => matchesQuery(query, draft.routine_title, draft.section_name));

  function runRow(run: RoutineRun, group: 'blocking' | 'overdue' | 'today' | 'week' | 'done') {
    const view = presentRun(run, group);
    return (
      <TaskRow
        key={run.id}
        title={run.title}
        tone={view.rail}
        glyph={runGlyphIcon(view.glyph)}
        selected={openRunId === run.id}
        onClick={() => fillRun(run)}
        meta={view.action === 'review' ? doneMeta(run) : runMeta(run)}
        tags={view.badges.map((badge) => (
          <StatusTag key={badge.label} small label={badge.label} tone={badge.tone} />
        ))}
        actions={(
          <>
            <TaskRowAction
              label={view.actionLabel}
              primary={view.action !== 'review'}
              onClick={() => fillRun(run)}
            />
            <TaskRowIcon
              label="Edit routine"
              icon={<EditOutlined sx={{ fontSize: 17 }} />}
              disabled={!canEdit}
              onClick={() => editRoutine(run.routine)}
            />
          </>
        )}
      />
    );
  }

  const none = (
    <Typography sx={{ px: 2.5, pb: 1.25, fontSize: 12, color: dutyColors.ink40, minHeight: 18 }}>
      None
    </Typography>
  );

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: dutyColors.paper }}>
      <RoutineListHeader
        view="mine"
        onView={(next) => navigate(next === 'catalog' ? '/routines/catalog' : '/routines')}
        eyebrow="Assigned to me"
        note={isError ? 'Could not load routines.' : 'Periodic and on-demand checklists.'}
        noteIsError={isError}
        canCreate={canEdit}
        onCreate={() => navigate('/routines/new')}
        query={query}
        onQuery={setQuery}
      />
      <Box sx={{ flex: 1, overflow: 'auto', pb: 2, ...thinScrollSx }}>
        <Box sx={{ minHeight: 74, mt: 1.25 }}>
          {blocking.length ? blocking.map((run) => runRow(run, 'blocking')) : (
            <Box
              sx={{
                mx: 1.5,
                px: 1.75,
                height: 64,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                border: `1px dashed ${dutyColors.ink15}`,
                borderRadius: '12px',
              }}
            >
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: dutyColors.ink60 }}>
                Nothing blocking the floor
              </Typography>
              <Typography sx={{ fontSize: 11.5, color: dutyColors.ink40 }}>
                A blocking routine would pin here.
              </Typography>
            </Box>
          )}
        </Box>

        <GroupHeader title="In progress" count={drafts.length} />
        {drafts.length ? drafts.map((draft) => (
          <TaskRow
            key={draft.id}
            title={draft.routine_title}
            tone="brand"
            glyph={triggerGlyphIcon('on_demand')}
            onClick={() => fillDraft(draft)}
            meta={draftMeta(draft)}
            actions={(
              <TaskRowAction label="Continue" primary onClick={() => fillDraft(draft)} />
            )}
          />
        )) : none}

        <GroupHeader title="Overdue" count={overdue.length} />
        {overdue.length ? overdue.map((run) => runRow(run, 'overdue')) : none}

        <GroupHeader title="Due today" count={today.length} />
        {today.length ? today.map((run) => runRow(run, 'today')) : none}

        <GroupHeader title="This week" count={week.length} />
        {week.length ? week.map((run) => runRow(run, 'week')) : none}

        <GroupHeader title="On demand" count={onDemand.length} />
        {onDemand.length ? onDemand.map((routine) => (
          <TaskRow
            key={routine.id}
            title={routine.title}
            tone="brand"
            glyph={triggerGlyphIcon('on_demand')}
            onClick={() => fillOnDemand(routine)}
            meta={routine.intro || 'Start whenever you need it.'}
            actions={(
              <>
                <TaskRowAction label="Fill in" primary onClick={() => fillOnDemand(routine)} />
                <TaskRowIcon
                  label="Edit routine"
                  icon={<EditOutlined sx={{ fontSize: 17 }} />}
                  disabled={!canEdit}
                  onClick={() => editRoutine(routine.id)}
                />
              </>
            )}
          />
        )) : none}

        <GroupHeader
          title="Done this week"
          count={done.length}
          collapsed={!doneOpen}
          onToggle={() => setDoneOpen((open) => !open)}
        />
        {doneOpen ? (done.length ? done.map((run) => runRow(run, 'done')) : none) : null}
      </Box>
    </Box>
  );
}
