import { addDays, format, parseISO } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import type { QaDayTile } from '../../../api/routines.api';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useRoutineAssignees } from '../../../hooks/useRoutines';
import {
  useAssignQaBoard,
  useQaCallIn,
  useQaExclude,
  useQaLeftEarly,
  useQaNudge,
  useQaOverride,
  useQaPeople,
  useQaSpots,
  useQaToday,
  useQaWeek,
  useUndoQaCallIn,
} from '../../../hooks/useRetailQa';
import { isoWeekKey, shiftWeek, weekMonday } from '../routines/gradeWeek';
import { displayName, shortName } from './commandCenter';
import { commandKeyAction } from './commandKeys';
import { CommandHeader } from './CommandHeader';
import { IssuesBar } from './IssuesBar';
import { RoutinesCard } from './RoutinesCard';
import { ScheduleCard } from './ScheduleCard';
import { NudgePopover } from './NudgePopover';
import { ScoreDialog } from './ScoreDialog';
import { SummaryDialogs } from './SummaryDialogs';
import { WeekRoutinesModal } from './WeekRoutinesModal';
import './commandCenter.css';

export default function RetailQaPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [params, setParams] = useSearchParams();
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const asked = params.get('day');
  const date = asked && !Number.isNaN(Date.parse(asked)) ? asked : today;
  const week = params.get('week') || isoWeekKey(new Date(`${date}T12:00:00`));
  const weekQuery = useQaWeek(week);
  const todayQuery = useQaToday(date);
  const peopleQuery = useQaPeople(week);
  const spotsQuery = useQaSpots({ week });
  const assignees = useRoutineAssignees();
  const assign = useAssignQaBoard();
  const callIn = useQaCallIn();
  const undoCallIn = useUndoQaCallIn();
  const leftEarly = useQaLeftEarly();
  const exclude = useQaExclude();
  const override = useQaOverride();
  const nudge = useQaNudge();
  const [nudgeTarget, setNudgeTarget] = useState<{ runId: number; anchor: HTMLElement } | null>(null);
  const [nudgeStamp, setNudgeStamp] = useState<Record<number, string>>({});
  const data = weekQuery.data;
  const board = todayQuery.data;

  const [weekOpen, setWeekOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [summary, setSummary] = useState<'spot' | 'cross' | 'people' | null>(null);

  const tiles = useMemo(
    () => (data?.tiles?.length ? data.tiles : fallbackTiles(week, today, data?.cross_check_due)),
    [data, week, today],
  );

  function setDay(next: string, nextWeek?: string) {
    const search = new URLSearchParams(params);
    search.set('week', nextWeek || isoWeekKey(new Date(`${next}T12:00:00`)));
    search.set('day', next);
    setParams(search);
  }

  function moveWeek(delta: number) {
    const nextWeek = shiftWeek(week, delta);
    const monday = weekMonday(nextWeek);
    const selected = new Date(`${date}T12:00:00`);
    const offset = (selected.getDay() + 6) % 7;
    setDay(format(addDays(monday, offset), 'yyyy-MM-dd'), nextWeek);
  }

  async function markCalledIn(personId: number) {
    try {
      await callIn.mutateAsync({ user: personId, date });
      enqueueSnackbar('Called in');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not mark called in', { variant: 'error' });
    }
  }

  async function clearCalledIn(personId: number) {
    const row = (board?.staff ?? []).find((item) => item.id === personId);
    if (!row?.call_in_id) return;
    try {
      await undoCallIn.mutateAsync(row.call_in_id);
      enqueueSnackbar('Call-in cleared');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not clear that call-in', { variant: 'error' });
    }
  }

  async function markLeftEarly(personId: number) {
    try {
      await leftEarly.mutateAsync({ user: personId, date });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not mark left early', { variant: 'error' });
    }
  }

  async function removeFromToday(personId: number) {
    try {
      await exclude.mutateAsync({ user: personId, date });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not remove that person', { variant: 'error' });
    }
  }

  async function addPerson(input: { user: number; shift: number; time_in: string; time_out: string }) {
    try {
      await override.mutateAsync({ ...input, date });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not add that person', { variant: 'error' });
    }
  }

  function nudgePerson(personId: number) {
    const owned = (board?.jobs ?? []).filter((job) => job.owner?.id === personId && job.run_id && job.status !== 'Done');
    const anchor = document.getElementById('schedRows') || document.body;
    if (!owned.length) {
      enqueueSnackbar('No open routine to nudge', { variant: 'info' });
      return;
    }
    if (owned.length === 1) {
      setNudgeTarget({ runId: owned[0].run_id as number, anchor });
      return;
    }
    void Promise.all(owned.map((job) => copyNudge(job.run_id as number))).catch(() => undefined);
  }

  async function copyNudge(runId: number) {
    const job = (board?.jobs ?? []).find((row) => row.run_id === runId);
    const text = job
      ? `${displayName(job.title, 'routine')} is ${job.status.toLowerCase()}${job.due_label ? `. ${job.due_label}` : ''}.`
      : 'Please finish this routine.';
    try {
      await navigator.clipboard.writeText(text);
      await nudge.mutateAsync({ run: runId, message: text });
      setNudgeStamp((prev) => ({ ...prev, [runId]: format(new Date(), 'HH:mm') }));
      setNudgeTarget(null);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not copy that nudge', { variant: 'error' });
    }
  }

  function runnerReturn(runId: number) {
    const back = `/admin/retail-qa?week=${encodeURIComponent(week)}&day=${encodeURIComponent(date)}`;
    navigate(`/routines/run/${runId}?return=${encodeURIComponent(back)}`);
  }

  async function assignRun(runId: number, userId: number | '') {
    try {
      await assign.mutateAsync({ date, kind: 'run', run: runId, user: userId === '' ? null : userId });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not assign that routine', { variant: 'error' });
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const action = commandKeyAction(event);
      if (!action) return;
      if (action.type === 'escape') {
        setWeekOpen(false);
        setScoreOpen(false);
        setSummary(null);
        return;
      }
      if (weekOpen || scoreOpen || summary) return;
      if (action.type === 'week') moveWeek(action.delta);
      if (action.type === 'day' && tiles[action.index]) setDay(tiles[action.index].date, week);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tiles, week, date, weekOpen, scoreOpen, summary]);

  if (weekQuery.isLoading && !data) return <LoadingScreen message="Loading Command Center..." />;

  const issues = (board?.issues ?? []).map((row) => (
    row.run_id && nudgeStamp[row.run_id] ? { ...row, nudged_at: nudgeStamp[row.run_id] } : row
  ));
  const weekNumber = week.includes('-W') ? `Week ${Number(week.split('-W')[1])}` : week;
  const jobs = (board?.jobs ?? []).map((row) => (
    row.run_id && nudgeStamp[row.run_id] ? { ...row, nudged_at: nudgeStamp[row.run_id] } : row
  ));
  const staff = board?.staff ?? [];
  const closedLabel = null;

  return (
    <div className="cc-page">
      <CommandHeader
        store={board?.store || data?.store || 'Eco-Thrift'}
        openToday={data?.open_today ?? Boolean(board?.open)}
        week={week}
        weekNumber={weekNumber}
        date={date}
        today={today}
        tiles={tiles}
        weekLetter={data?.letter ?? null}
        weekThirds={data?.thirds ?? { doing: null, owner: null, cross: null }}
        projectedLetter={data?.projected?.letter}
        weekData={data}
        board={board}
        summary={summary}
        onSummary={setSummary}
        onScore={() => setScoreOpen(true)}
        onMoveWeek={moveWeek}
        onSelectDay={(next) => setDay(next, week)}
      />
      {date !== today ? (
        <div className="not-today">
          <span>Viewing {format(parseISO(date), 'EEE MMM d')}. You are not on today.</span>
          <button type="button" onClick={() => setDay(today)}>Back to today</button>
        </div>
      ) : null}
      <div className="body">
        <ScheduleCard
            date={date}
            staff={staff}
            off={board?.off}
            people={assignees.data ?? []}
            onCallIn={(id) => void markCalledIn(id)}
            onClearCallIn={(id) => void clearCalledIn(id)}
            onLeftEarly={(id) => void markLeftEarly(id)}
            onRemove={(id) => void removeFromToday(id)}
            onNudgePerson={nudgePerson}
            onAddPerson={(input) => void addPerson(input)}
            closedLabel={closedLabel}
          />
        <main className="col-right">
          <IssuesBar
            issues={issues}
            staff={staff}
            jobs={jobs}
            onCallIn={(id) => void markCalledIn(id)}
            onReassign={() => document.getElementById('rtBody')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            onNudge={(id, el) => setNudgeTarget({ runId: id, anchor: el })}
            onOpenCross={() => setSummary('cross')}
            onDoSpot={() => board?.spot?.run_id && runnerReturn(board.spot.run_id)}
            onOpenShifts={() => navigate('/admin/shifts')}
            onRemove={(id) => void removeFromToday(id)}
            closedLabel={closedLabel}
          />
          <RoutinesCard
            date={date}
            jobs={jobs}
            people={assignees.data ?? []}
            onAssign={(runId, userId) => void assignRun(runId, userId)}
            onNudge={(id, el) => setNudgeTarget({ runId: id, anchor: el })}
            onWeekView={() => setWeekOpen(true)}
            closedLabel={closedLabel}
          />
        </main>
      </div>
      <SummaryDialogs
        open={summary}
        onClose={() => setSummary(null)}
        week={week}
        today={today}
        tiles={tiles}
        board={board}
        weekData={data}
        spots={spotsQuery.data?.spots ?? []}
        people={peopleQuery.data?.people ?? []}
        onDoSpot={() => board?.spot?.run_id && runnerReturn(board.spot.run_id)}
        onOpenRun={(runId) => runnerReturn(runId)}
      />
      <ScoreDialog
        open={scoreOpen}
        onClose={() => setScoreOpen(false)}
        weekNumber={weekNumber}
        weekLetter={data?.letter ?? null}
        projectedLetter={data?.projected?.letter}
        weekThirds={data?.thirds ?? { doing: null, owner: null, cross: null }}
        weekItems={Array.isArray(data?.score_items) ? data.score_items : data?.score_items?.week ?? board?.score_items?.week ?? []}
        dayItems={board?.score_items?.day ?? []}
        tiles={tiles}
        weekData={data}
        board={board}
        posOnTask={data?.pos_on_task || board?.pos_on_task}
      />
      <NudgePopover
        anchor={nudgeTarget?.anchor ?? null}
        owner={shortName((jobs.find((row) => row.run_id === nudgeTarget?.runId)?.owner?.name) || 'Owner')}
        message={(() => {
          const job = jobs.find((row) => row.run_id === nudgeTarget?.runId);
          return job
            ? `${displayName(job.title, 'routine')} is ${job.status.toLowerCase()}${job.due_label ? `. ${job.due_label}` : ''}.`
            : 'Please finish this routine.';
        })()}
        onCopy={() => nudgeTarget && void copyNudge(nudgeTarget.runId)}
        onClose={() => setNudgeTarget(null)}
      />
      <WeekRoutinesModal open={weekOpen} onClose={() => setWeekOpen(false)} week={week} />
    </div>
  );
}

function fallbackTiles(week: string, today: string, due?: string | null): QaDayTile[] {
  const monday = weekMonday(week);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i);
    const iso = format(day, 'yyyy-MM-dd');
    return {
      date: iso,
      weekday: format(day, 'EEE'),
      open: true,
      letter: null,
      projected_letter: null,
      doing: null,
      spot: null,
      cross: due && iso >= due ? null : null,
      is_today: iso === today,
      is_future: iso > today,
    };
  });
}
