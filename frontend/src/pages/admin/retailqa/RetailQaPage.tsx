import { addDays, format, parseISO } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Button } from '@mui/material';
import type { QaDayTile } from '../../../api/routines.api';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useRoutineAssignees } from '../../../hooks/useRoutines';
import {
  useAssignQaBoard,
  useQaCallIn,
  useUndoQaCallIn,
  useQaNudge,
  useQaPeople,
  useQaSpots,
  useQaToday,
  useQaWeek,
} from '../../../hooks/useRetailQa';
import { isoWeekKey, shiftWeek, weekMonday } from '../routines/gradeWeek';
import { displayName, shortName } from './commandCenter';
import { commandKeyAction } from './commandKeys';
import { CALM_BOARD, CALM_DATE, CALM_PEOPLE, CALM_SPOTS, CALM_TILES, CALM_WEEK } from './calmFixture';
import { CALLIN_BOARD, PROBLEM_BOARD, PROBLEM_DATE, PROBLEM_PEOPLE, PROBLEM_SPOTS, PROBLEM_TILES, PROBLEM_WEEK, SCROLL_BOARD } from './problemFixture';
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
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const [params, setParams] = useSearchParams();
  const fixtureName = params.get('fixture');
  const fixture = fixtureName === 'calm' || fixtureName === 'problem' || fixtureName === 'scroll' || fixtureName === 'callin';
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const asked = params.get('day');
  const date = fixture
    ? (fixtureName === 'calm' ? CALM_DATE : PROBLEM_DATE)
    : asked && !Number.isNaN(Date.parse(asked)) ? asked : today;
  const week = fixture
    ? (fixtureName === 'calm' ? CALM_WEEK.week : PROBLEM_WEEK.week)
    : params.get('week') || isoWeekKey(new Date(`${date}T12:00:00`));
  const weekQuery = useQaWeek(fixture ? null : week);
  const todayQuery = useQaToday(fixture ? null : date);
  const peopleQuery = useQaPeople(week, !fixture);
  const spotsQuery = useQaSpots(fixture ? { enabled: false } : { week });
  const assignees = useRoutineAssignees();
  const assign = useAssignQaBoard();
  const callIn = useQaCallIn();
  const undoCallIn = useUndoQaCallIn();
  const nudge = useQaNudge();
  const [callInOverlay, setCallInOverlay] = useState(false);
  const [nudgeTarget, setNudgeTarget] = useState<{ runId: number; anchor: HTMLElement } | null>(null);
  const [nudgeStamp, setNudgeStamp] = useState<Record<number, string>>({});
  const data = fixtureName === 'calm' ? CALM_WEEK : fixture ? PROBLEM_WEEK : weekQuery.data;
  const board = fixtureName === 'scroll'
    ? SCROLL_BOARD
    : fixtureName === 'callin' || (fixtureName === 'problem' && callInOverlay)
      ? CALLIN_BOARD
      : fixtureName === 'problem'
        ? PROBLEM_BOARD
        : fixtureName === 'calm'
          ? CALM_BOARD
          : todayQuery.data;

  const [weekOpen, setWeekOpen] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [drawer, setDrawer] = useState<'spot' | 'cross' | 'people' | null>(null);

  const tiles = useMemo(
    () => (fixture
      ? (fixtureName === 'calm' ? CALM_TILES : PROBLEM_TILES)
      : data?.tiles?.length ? data.tiles : fallbackTiles(week, today, data?.cross_check_due)),
    [data, week, today, fixture, fixtureName],
  );

  function setDay(next: string, nextWeek?: string) {
    const search = new URLSearchParams(params);
    if (fixtureName) search.set('fixture', fixtureName);
    search.set('week', nextWeek || isoWeekKey(new Date(`${next}T12:00:00`)));
    search.set('day', next);
    setParams(search);
  }

  function moveWeek(delta: number) {
    if (fixture) return;
    const nextWeek = shiftWeek(week, delta);
    const monday = weekMonday(nextWeek);
    const selected = new Date(`${date}T12:00:00`);
    const offset = (selected.getDay() + 6) % 7;
    setDay(format(addDays(monday, offset), 'yyyy-MM-dd'), nextWeek);
  }

  async function markCalledIn(personId: number) {
    const undo = (id?: number) => (
      <Button
        color="inherit"
        size="small"
        onClick={() => {
          if (fixture) setCallInOverlay(false);
          else if (id) void undoCallIn.mutateAsync(id).catch(() => undefined);
          closeSnackbar();
        }}
      >
        Undo
      </Button>
    );
    if (fixture) {
      setCallInOverlay(true);
      enqueueSnackbar('Called in', { action: () => undo(), autoHideDuration: 10000 });
      return;
    }
    try {
      const result = await callIn.mutateAsync({ user: personId, date });
      enqueueSnackbar('Called in', { action: () => undo(result.data.call_in.id), autoHideDuration: 10000 });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not mark called in', { variant: 'error' });
    }
  }

  async function copyNudge(runId: number) {
    const job = (board?.jobs ?? []).find((row) => row.run_id === runId);
    const text = job
      ? `${displayName(job.title, 'routine')} is ${job.status.toLowerCase()}${job.due_label ? `. ${job.due_label}` : ''}.`
      : 'Please finish this routine.';
    try {
      await navigator.clipboard.writeText(text);
      if (!fixture) await nudge.mutateAsync({ run: runId, message: text });
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
    if (fixture) return;
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
        setDrawer(null);
        return;
      }
      if (weekOpen || scoreOpen || drawer) return;
      if (action.type === 'week') moveWeek(action.delta);
      if (action.type === 'day' && tiles[action.index]) setDay(tiles[action.index].date, week);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tiles, week, date, weekOpen, scoreOpen, drawer]);

  if (!fixture && weekQuery.isLoading && !data) return <LoadingScreen message="Loading Command Center..." />;

  const issues = (board?.issues ?? []).map((row) => (
    row.run_id && nudgeStamp[row.run_id] ? { ...row, nudged_at: nudgeStamp[row.run_id] } : row
  ));
  const alerts = issues.filter((row) => row.severity === 'red' || row.severity === 'amber').length;
  const weekNumber = week.includes('-W') ? `W${week.split('-W')[1]}` : week;
  const jobs = (board?.jobs ?? []).map((row) => (
    row.run_id && nudgeStamp[row.run_id] ? { ...row, nudged_at: nudgeStamp[row.run_id] } : row
  ));
  const staff = board?.staff ?? [];

  return (
    <div className="cc-page">
      <CommandHeader
        store={board?.store || data?.store || 'Eco-Thrift'}
        openToday={data?.open_today ?? Boolean(board?.open)}
        alerts={board?.alerts.total ?? alerts}
        week={week}
        weekNumber={weekNumber}
        date={date}
        today={fixture ? date : today}
        tiles={tiles}
        weekLetter={data?.letter ?? null}
        weekThirds={data?.thirds ?? { doing: null, owner: null, cross: null }}
        projectedLetter={data?.projected?.letter}
        weekData={data}
        board={board}
        sectionDone={fixture && fixtureName !== 'calm' ? 7 : fixtureName === 'calm' ? 3 : undefined}
        sectionTotal={fixture && fixtureName !== 'calm' ? 23 : fixtureName === 'calm' ? 17 : undefined}
        drawer={drawer}
        onDrawer={setDrawer}
        onScore={() => setScoreOpen(true)}
        onMoveWeek={moveWeek}
        onSelectDay={(next) => setDay(next, week)}
      />
      {!fixture && date !== today ? (
        <div className="not-today">
          <span>Viewing {format(parseISO(date), 'EEE MMM d')}. You are not on today.</span>
          <button type="button" onClick={() => setDay(today)}>Back to today</button>
        </div>
      ) : null}
      <div className="body">
        <ScheduleCard date={date} staff={staff} onCallIn={(id) => void markCalledIn(id)} />
        <main className="col-right">
          <IssuesBar
            issues={issues}
            staff={staff}
            jobs={jobs}
            onCallIn={(id) => void markCalledIn(id)}
            onReassign={() => document.getElementById('rtBody')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            onNudge={(id, el) => setNudgeTarget({ runId: id, anchor: el })}
            onOpenCross={() => setDrawer('cross')}
            onDoSpot={() => board?.spot?.run_id && runnerReturn(board.spot.run_id)}
          />
          <RoutinesCard
            date={date}
            jobs={jobs}
            people={assignees.data ?? []}
            onAssign={(runId, userId) => void assignRun(runId, userId)}
            onNudge={(id, el) => setNudgeTarget({ runId: id, anchor: el })}
            onWeekView={() => setWeekOpen(true)}
          />
        </main>
      </div>
      <SummaryDialogs
        open={drawer}
        onClose={() => setDrawer(null)}
        week={week}
        today={fixture ? date : today}
        tiles={tiles}
        board={board}
        weekData={data}
        spots={fixture ? (fixtureName === 'calm' ? CALM_SPOTS : PROBLEM_SPOTS) : spotsQuery.data?.spots ?? []}
        people={peopleQuery.data?.people ?? []}
        fixturePeople={fixture ? (fixtureName === 'calm' ? CALM_PEOPLE : PROBLEM_PEOPLE) : undefined}
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
