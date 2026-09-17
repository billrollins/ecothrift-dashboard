import { addDays, format } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import type { QaDayTile } from '../../../api/routines.api';
import { LoadingScreen } from '../../../components/feedback/LoadingScreen';
import { useRoutineAssignees } from '../../../hooks/useRoutines';
import {
  useAssignQaBoard,
  useQaCallIn,
  useQaNudge,
  useQaPeople,
  useQaSpots,
  useQaToday,
  useQaWeek,
} from '../../../hooks/useRetailQa';
import { isoWeekKey, shiftWeek, weekMonday } from '../routines/gradeWeek';
import { displayName } from './commandCenter';
import { CALM_BOARD, CALM_DATE, CALM_PEOPLE, CALM_SPOTS, CALM_TILES, CALM_WEEK } from './calmFixture';
import { CommandHeader } from './CommandHeader';
import { IssuesBar } from './IssuesBar';
import { RoutinesCard } from './RoutinesCard';
import { ScheduleCard } from './ScheduleCard';
import { SummaryDialogs } from './SummaryDialogs';
import { WeekRoutinesModal } from './WeekRoutinesModal';
import './commandCenter.css';

export default function RetailQaPage() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [params, setParams] = useSearchParams();
  const fixture = params.get('fixture') === 'calm';
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const asked = params.get('day');
  const date = fixture
    ? CALM_DATE
    : asked && !Number.isNaN(Date.parse(asked)) ? asked : today;
  const week = fixture
    ? CALM_WEEK.week
    : params.get('week') || isoWeekKey(new Date(`${date}T12:00:00`));
  const weekQuery = useQaWeek(week);
  const todayQuery = useQaToday(date);
  const peopleQuery = useQaPeople(fixture ? undefined : week);
  const spotsQuery = useQaSpots(fixture ? {} : { week });
  const assignees = useRoutineAssignees();
  const assign = useAssignQaBoard();
  const callIn = useQaCallIn();
  const nudge = useQaNudge();
  const data = fixture ? CALM_WEEK : weekQuery.data;
  const board = fixture ? CALM_BOARD : todayQuery.data;

  const [weekOpen, setWeekOpen] = useState(false);
  const [drawer, setDrawer] = useState<'spot' | 'cross' | 'people' | null>(null);

  const tiles = useMemo(
    () => (fixture
      ? CALM_TILES
      : data?.tiles?.length ? data.tiles : fallbackTiles(week, today, data?.cross_check_due)),
    [data, week, today, fixture],
  );

  function setDay(next: string, nextWeek?: string) {
    const search = new URLSearchParams(params);
    if (fixture) search.set('fixture', 'calm');
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
    if (fixture) return;
    try {
      await callIn.mutateAsync({ user: personId, date });
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(typeof detail === 'string' ? detail : 'Could not mark called in', { variant: 'error' });
    }
  }

  async function copyNudge(runId: number) {
    if (fixture) return;
    const job = (board?.jobs ?? []).find((row) => row.run_id === runId);
    const text = job
      ? `${displayName(job.title, 'routine')} is ${job.status.toLowerCase()}${job.due_label ? `. Due ${job.due_label}` : ''}.`
      : 'Please finish this routine.';
    try {
      await navigator.clipboard.writeText(text);
      await nudge.mutateAsync({ run: runId, message: text });
      enqueueSnackbar('Copied', { variant: 'success' });
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
      const target = event.target as HTMLElement | null;
      if (target && target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (weekOpen) {
        if (event.key === 'Escape') setWeekOpen(false);
        return;
      }
      if (event.key === 'Escape') setDrawer(null);
      if (event.key === 'ArrowLeft') moveWeek(-1);
      if (event.key === 'ArrowRight') moveWeek(1);
      const num = Number(event.key);
      if (num >= 1 && num <= 7 && tiles[num - 1]) setDay(tiles[num - 1].date, week);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tiles, week, date, weekOpen]);

  if (!fixture && weekQuery.isLoading && !data) return <LoadingScreen message="Loading Command Center..." />;

  const issues = board?.issues ?? [];
  const alerts = issues.filter((row) => row.severity === 'red' || row.severity === 'amber').length;
  const weekNumber = week.includes('-W') ? `W${week.split('-W')[1]}` : week;
  const jobs = board?.jobs ?? [];
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
        today={fixture ? CALM_DATE : today}
        tiles={tiles}
        weekLetter={data?.letter ?? null}
        weekThirds={data?.thirds ?? { doing: null, owner: null, cross: null }}
        projectedLetter={data?.projected?.letter}
        weekData={data}
        board={board}
        sectionDone={fixture ? 7 : undefined}
        sectionTotal={fixture ? 23 : undefined}
        drawer={drawer}
        onDrawer={setDrawer}
        onMoveWeek={moveWeek}
        onSelectDay={(next) => setDay(next, week)}
      />
      <div className="body">
        <ScheduleCard date={date} staff={staff} onCallIn={(id) => void markCalledIn(id)} />
        <main className="col-right">
          <IssuesBar
            issues={issues}
            staff={staff}
            jobs={jobs}
            onCallIn={(id) => void markCalledIn(id)}
            onReassign={() => document.getElementById('rtBody')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            onNudge={(id) => void copyNudge(id)}
            onOpenCross={() => setDrawer('cross')}
            onDoSpot={() => board?.spot?.run_id && runnerReturn(board.spot.run_id)}
          />
          <RoutinesCard
            date={date}
            jobs={jobs}
            people={assignees.data ?? []}
            onAssign={(runId, userId) => void assignRun(runId, userId)}
            onNudge={(id) => void copyNudge(id)}
            onWeekView={() => setWeekOpen(true)}
          />
        </main>
      </div>
      <SummaryDialogs
        open={drawer}
        onClose={() => setDrawer(null)}
        week={week}
        today={fixture ? CALM_DATE : today}
        tiles={tiles}
        board={board}
        weekData={data}
        spots={fixture ? CALM_SPOTS : spotsQuery.data?.spots ?? []}
        people={peopleQuery.data?.people ?? []}
        fixturePeople={fixture ? CALM_PEOPLE : undefined}
        onDoSpot={() => board?.spot?.run_id && runnerReturn(board.spot.run_id)}
        onOpenRun={(runId) => runnerReturn(runId)}
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
