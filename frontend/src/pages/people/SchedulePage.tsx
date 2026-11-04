/**
 * Schedule (owner 2026-10-21): managers build each week, one row per person, one column per day. Retail keeps fixed
 * shifts; every other department flexes (leave early on a slow day, come in or stay late on a busy one), so its times
 * are the plan. A shift opens to change it, remove it, or record a call-in; an empty day opens to add a shift or record
 * a call-in. Call-ins are counted per person over the last 30 and 90 days.
 * Everyone sees the week (Dash Updates #6, 2026-11-02), read-only, with each person's state right now from the time
 * clock (on shift, on break, late, off); call-ins, their counts and shift notes stay the managers'. English and Spanish.
 * At a glance (Bill, Dash Updates #55, 2026-11-03): a section per department, Retail first. Retail draws each shift as
 * a bar on the store-hours timeline; flexible departments say each person's usual week once and only draw the days that
 * differ. Today's column is tinted, a call-in replaces its shift, and every row is one fixed height.
 * Part A (Bill, Dash Updates #57, 2026-11-03): managers drag a bar's ends to change its times (15 minutes); a tap opens
 * the day enlarged (5 minutes). The actual clock-in to clock-out is a bright purple line under the bar, and Hrs reads scheduled /
 * actual. Every section collapses and has a coverage row (only fixed departments flag gaps). Sunday is a full day. A
 * phone shows one day at a time, everyone as bars across the screen.
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
  type Theme,
} from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../i18n/useLanguage';
import { getDepartments } from '../../api/hr.api';
import {
  copyScheduleWeek,
  createScheduledShift,
  deleteScheduledShift,
  fillScheduleFromUsual,
  getScheduleRequests,
  getScheduleWeek,
  recordCallIn,
  updateScheduledShift,
  type ActualSpan,
  type CallIn,
  type NowState,
  type ScheduleRequest,
  type ScheduleWeek,
  type ScheduledShift,
  type StoreDay,
} from '../../api/schedule.api';
import { AskDialog, DecideRow, RequestsDialog, useRequestCopy, type AskStart } from './ScheduleRequests';
import {
  dayKind,
  endMinutes,
  errorText,
  groupSections,
  minutes,
  range,
  sectionCoverage,
  short,
  snap,
  summarize,
  timelineWindow,
  toHHMM,
  usualText,
  type Person,
  type Section,
} from './scheduleLayout';

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

/** What staff read here, in English and Spanish. */
const COPY = {
  schedule: { en: 'Schedule', es: 'Horario' },
  thisWeek: { en: 'This week', es: 'Esta semana' },
  prevWeek: { en: 'Previous week', es: 'Semana anterior' },
  nextWeek: { en: 'Next week', es: 'Semana siguiente' },
  person: { en: 'Person', es: 'Persona' },
  hours: { en: 'Hrs', es: 'Hrs' },
  hoursTip: { en: 'Scheduled / actual (clocked) hours this week', es: 'Horas programadas / reales (marcadas) esta semana' },
  off: { en: 'Off', es: 'Libre' },
  dayOff: { en: 'Day off (usually works)', es: 'Día libre (normalmente trabaja)' },
  extra: { en: 'Extra shift (not a usual day)', es: 'Turno extra (no es día habitual)' },
  changed: { en: 'Different times from usual', es: 'Horas distintas a lo habitual' },
  noUsual: { en: 'No usual shifts set', es: 'Sin turnos habituales' },
  usual: { en: 'Usual week', es: 'Semana habitual' },
  on_shift: { en: 'On shift', es: 'Trabajando' },
  on_break: { en: 'On break', es: 'En descanso' },
  late: { en: 'Late', es: 'Tarde' },
  offNow: { en: 'Off now', es: 'Libre ahora' },
  clocked: { en: 'Clocked', es: 'Marcó' },
  stillIn: { en: 'still in', es: 'sigue' },
  coverage: { en: 'Coverage', es: 'Cobertura' },
  floorCoverage: { en: 'Floor coverage', es: 'Personal en piso' },
  closed: { en: 'Closed', es: 'Cerrado' },
  nobody: { en: 'Nobody', es: 'Nadie' },
  gap: { en: 'Gap', es: 'Sin nadie' },
  single: { en: '1 only', es: 'Solo 1' },
  covered: { en: 'covered', es: 'cubierto' },
  on: { en: 'on', es: 'en' },
  noDept: { en: 'No department', es: 'Sin departamento' },
  show: { en: 'Show', es: 'Mostrar' },
  hide: { en: 'Hide', es: 'Ocultar' },
  info: {
    en: 'Each shift is a bar from start to end; the purple line under it is when they actually clocked in and out. Retail times are fixed, and the coverage row under Retail counts people on the floor (red = nobody, amber = one person). Other departments flex: the times are the plan, their usual week is under each name, and only days that differ show. Managers drag a bar\'s ends to change its times, or tap it to open the day.',
    es: 'Cada turno es una barra de inicio a fin; la línea morada debajo es cuando realmente marcaron entrada y salida. Las horas de Retail son fijas, y la fila de cobertura bajo Retail cuenta a las personas en piso (rojo = nadie, ámbar = una persona). Los demás departamentos son flexibles: las horas son el plan, su semana habitual está bajo cada nombre y solo se muestran los días distintos. Los gerentes arrastran los extremos de una barra para cambiar sus horas, o la tocan para abrir el día.',
  },
  couldNotLoad: { en: 'Could not load the schedule.', es: 'No se pudo cargar el horario.' },
} satisfies Record<string, { en: string; es: string }>;

/** The reader's id, or undefined outside an AuthProvider (bare tests). */
function useMeId(): number | undefined {
  try {
    return useAuth().user?.id;
  } catch {
    return undefined;
  }
}

function useCopy() {
  const lang = useLanguage();
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  return {
    tr: (key: keyof typeof COPY) => COPY[key][lang],
    /** Day names in the reader's language. */
    day: (d: string, pattern: string) => format(parseISO(d), pattern, locale),
    /** Monday-first short day names, for the usual week. */
    dayNames: Array.from({ length: 7 }, (_v, i) => format(addDays(new Date(2026, 9, 19), i), 'EEE', locale)),
  };
}

/** Every row is this tall, so nothing moves (Bill hates content that shifts). */
const ROW = 44;
/** The actual clock-in to clock-out line: bright purple, so it stands apart from the green shift bars (Bill 11-03). */
const ACTUAL = '#7c4dff';
const NAME_W = { xs: 150, md: 210 };
const HOURS_W = 76;
const CALLS_W = 132;
/** Drag steps: 15 minutes on the week, 5 in the enlarged day. */
const WEEK_STEP = 15;
const DAY_STEP = 5;

const tint = (key: 'success' | 'warning' | 'error' | 'primary' | 'info', a: number) => (t: Theme) => alpha(t.palette[key].main, a);

/** '14:30' → '2:30 pm'. */
const clock = (hhmm: string) => {
  const m = minutes(hhmm);
  return `${short(m)} ${m < 12 * 60 ? 'am' : 'pm'}`;
};

export function weekLabel(start: string): string {
  const a = parseISO(start);
  const b = addDays(a, 6);
  return a.getMonth() === b.getMonth() ? `${format(a, 'MMM d')}-${format(b, 'd')}` : `${format(a, 'MMM d')}-${format(b, 'MMM d')}`;
}

/** Right now, beside a name: a small dot (nothing when the week is not this week). */
function NowDot({ state }: { state: NowState | undefined }) {
  const { tr } = useCopy();
  const color = state === 'on_shift' ? 'success.main' : state === 'on_break' ? 'warning.main' : state === 'late' ? 'error.main' : 'transparent';
  const label = state ? tr(state === 'off' ? 'offNow' : state) : '';
  return (
    <Tooltip title={label} disableInteractive>
      <Box
        component="span"
        data-testid={state ? `now-${state}` : undefined}
        aria-label={label || undefined}
        role={state ? 'img' : undefined}
        sx={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: color,
          border: state === 'off' ? 1 : 0, borderColor: 'text.disabled',
        }}
      />
    </Tooltip>
  );
}

/** A bar on a timeline: a shift, or the shift being edited in the enlarged day (id 0 for a new one). */
interface Bar {
  id: number;
  start_time: string;
  end_time: string;
  flexible: boolean;
  title: string;
}

/**
 * A timeline: store hours shaded, each shift a bar, the actual clock-in to clock-out a purple line under it. When
 * `onCommit` is given, each bar's ends drag (snapped to `step`); a tap on the bar opens it.
 */
function Track({ span, store, bars, actuals, step, height = 26, onCommit, onOpen, big = false, now }: {
  span: [number, number];
  store?: StoreDay;
  bars: Bar[];
  actuals: ActualSpan[];
  step: number;
  height?: number;
  onCommit?: (bar: Bar, start: number, end: number) => unknown;
  onOpen?: (bar: Bar) => void;
  big?: boolean;
  /** Minutes now, for a punch still open today. */
  now?: number;
}) {
  const { tr } = useCopy();
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: number; start: number; end: number } | null>(null);
  const [a, b] = span;
  const pct = (m: number) => ((Math.min(Math.max(m, a), b) - a) / (b - a)) * 100;
  const place = (from: number, to: number) => ({ left: `${pct(from)}%`, width: `${Math.max(pct(to) - pct(from), 0)}%` });
  const strip = big ? 3 : 2;
  const barH = height - strip - 2;

  const begin = (e: ReactPointerEvent, bar: Bar, edge: 'start' | 'end') => {
    if (!onCommit || !ref.current) return;
    e.stopPropagation();
    e.preventDefault();
    const width = ref.current.getBoundingClientRect().width;
    const s0 = minutes(bar.start_time);
    const e0 = endMinutes(bar);
    const x0 = e.clientX;
    let cur = { id: bar.id, start: s0, end: e0 };
    const move = (ev: PointerEvent) => {
      const d = ((ev.clientX - x0) / width) * (b - a);
      cur = edge === 'start'
        ? { ...cur, start: Math.max(0, Math.min(snap(s0 + d, step), cur.end - step)) }
        : { ...cur, end: Math.min(24 * 60, Math.max(snap(e0 + d, step), cur.start + step)) };
      setDrag(cur);
    };
    const up = async () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (cur.start === s0 && cur.end === e0) {
        setDrag(null);
        return;
      }
      try {
        await onCommit(bar, cur.start, cur.end);
      } finally {
        setDrag(null);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const handle = (bar: Bar, edge: 'start' | 'end') => (
    <Box
      component="span"
      data-testid={`handle-${edge}-${bar.id}`}
      aria-hidden
      onPointerDown={(e) => begin(e, bar, edge)}
      onClick={(e) => e.stopPropagation()}
      sx={{
        position: 'absolute', top: 0, bottom: 0, [edge === 'start' ? 'left' : 'right']: big ? -4 : -3, width: big ? 12 : 8,
        cursor: 'ew-resize', touchAction: 'none', zIndex: 2,
        '&::after': {
          content: '""', position: 'absolute', top: '25%', bottom: '25%', left: '50%', width: 2, ml: '-1px', borderRadius: 1,
          bgcolor: 'success.dark', opacity: big ? 0.8 : 0, transition: 'opacity .1s',
        },
        '&:hover::after': { opacity: 0.8 },
      }}
    />
  );

  return (
    <Box ref={ref} sx={{ position: 'relative', height }}>
      {store?.open ? (
        <Box sx={{ position: 'absolute', top: 0, height: barH, ...place(minutes(store.start), minutes(store.end)), bgcolor: 'action.hover', borderRadius: '4px' }} />
      ) : null}
      {bars.map((bar) => {
        const live = drag?.id === bar.id ? drag : null;
        const from = live?.start ?? minutes(bar.start_time);
        const to = live?.end ?? endMinutes(bar);
        return (
          <Box
            key={bar.id}
            data-testid={`bar-${bar.id}`}
            title={bar.title}
            onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(bar); } : undefined}
            sx={{
              position: 'absolute', top: 0, height: barH, ...place(from, to),
              bgcolor: bar.flexible ? tint('primary', 0.12) : tint('success', 0.24),
              boxShadow: (t: Theme) => `inset 3px 0 0 ${bar.flexible ? t.palette.primary.main : t.palette.success.main}`,
              outline: live ? 2 : 0, outlineColor: 'success.main', borderRadius: '4px',
              fontSize: big ? 13 : 11, lineHeight: `${barH}px`, pl: 0.75, overflow: 'visible', whiteSpace: 'nowrap',
              cursor: onOpen ? 'pointer' : 'default', userSelect: 'none',
            }}
          >
            <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'clip' }}>
              {big ? null : `${short(from)}-${short(to)}`}
            </Box>
            {big ? (
              <>
                <Box component="span" data-testid="edge-start" sx={{ position: 'absolute', bottom: '100%', left: 0, mb: 0.25, fontSize: 12, fontWeight: 700 }}>{clock(toHHMM(from))}</Box>
                <Box component="span" data-testid="edge-end" sx={{ position: 'absolute', bottom: '100%', right: 0, mb: 0.25, fontSize: 12, fontWeight: 700 }}>{clock(toHHMM(to))}</Box>
              </>
            ) : null}
            {onCommit ? (
              <>
                {handle(bar, 'start')}
                {handle(bar, 'end')}
              </>
            ) : null}
          </Box>
        );
      })}
      {actuals.map((t) => {
        const from = minutes(t.start);
        const to = t.end ? minutes(t.end) : now ?? from;
        // Hovered at once, it says the clocked times; a taller see-through box around the thin line makes it easy to hit.
        return (
          <Tooltip
            key={`${t.start}-${t.employee}`}
            title={`${tr('clocked')} ${clock(t.start)}-${t.end ? clock(t.end) : tr('stillIn')}`}
            enterDelay={0}
            enterNextDelay={0}
            disableInteractive
            placement="bottom"
          >
            <Box
              data-testid="actual-strip"
              sx={{ position: 'absolute', bottom: -3, height: strip + 7, ...place(from, Math.max(to, from + 5)), zIndex: 1, display: 'flex', alignItems: 'flex-end', pb: '3px' }}
            >
              <Box sx={{ width: '100%', height: strip, bgcolor: ACTUAL, borderRadius: 99 }} />
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

/** Hour marks under a timeline: every hour when there is room, else every other one. */
function HourTicks({ span, every = 1 }: { span: [number, number]; every?: number }) {
  const [a, b] = span;
  const hours: number[] = [];
  for (let m = Math.ceil(a / 60) * 60; m <= b; m += 60 * every) hours.push(m);
  return (
    <Box sx={{ position: 'relative', height: 16 }}>
      {hours.map((m) => (
        <Typography key={m} component="span" sx={{
          position: 'absolute', left: `${((m - a) / (b - a)) * 100}%`, transform: 'translateX(-50%)', fontSize: 10,
          color: 'text.secondary', whiteSpace: 'nowrap',
        }}>
          {short(m)}
        </Typography>
      ))}
    </Box>
  );
}

type Target = { person: Person; day: string; shift: ScheduledShift | null };

function ShiftDialog({ target, span, store, actuals, requests, onClose, onSaved }: {
  target: Target | null;
  span: [number, number];
  store?: StoreDay;
  actuals: ActualSpan[];
  /** Their waiting requests touching this day: answer them here. */
  requests: ScheduleRequest[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const departments = useQuery({ queryKey: ['departments'], queryFn: async () => (await getDepartments()).data, staleTime: 300_000 });
  const shift = target?.shift ?? null;
  const [dept, setDept] = useState<number | ''>(shift?.department ?? target?.person.department ?? '');
  const [start, setStart] = useState(shift?.start_time ?? '09:00');
  const [end, setEnd] = useState(shift?.end_time ?? '15:00');
  const [note, setNote] = useState(shift?.note ?? '');
  const [callIn, setCallIn] = useState(false);
  const [kind, setKind] = useState<CallIn['kind']>('called_in');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!target) return null;
  // The enlarged day: the week's timeline, widened to this shift, an hour either side when there is room.
  const valid = Boolean(start && end);
  const big: [number, number] = [
    Math.max(0, Math.min(span[0], valid ? Math.floor(minutes(start) / 60) * 60 : span[0])),
    Math.min(24 * 60, Math.max(span[1], valid ? Math.ceil(endMinutes({ start_time: start, end_time: end }) / 60) * 60 : span[1])),
  ];

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      enqueueSnackbar(done, { variant: 'success' });
      onSaved();
      onClose();
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not save'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const save = () => run(
    () => (shift
      ? updateScheduledShift(shift.id, { department: dept === '' ? null : dept, start_time: start, end_time: end, note })
      : createScheduledShift({
        employee: target.person.id, date: target.day, department: dept === '' ? null : dept,
        start_time: start, end_time: end, note,
      })),
    shift ? 'Shift saved' : 'Shift added',
  );
  const saveCallIn = () => run(
    () => recordCallIn({ employee: target.person.id, shift_date: target.day, scheduled_shift: shift?.id ?? null, kind, reason }),
    kind === 'no_show' ? 'No-show recorded' : 'Call-in recorded',
  );

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {target.person.name} · {format(parseISO(target.day), 'EEE MMM d')}
      </DialogTitle>
      <DialogContent>
        {!callIn && requests.length ? (
          <Box data-testid="dialog-requests" sx={{ mb: 1, px: 1.5, borderRadius: '8px', border: 1, borderStyle: 'dashed', borderColor: 'info.main', bgcolor: tint('info', 0.05) }}>
            {requests.map((r) => <DecideRow key={r.id} request={r} onDone={() => { onSaved(); onClose(); }} />)}
          </Box>
        ) : null}
        {!callIn ? (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {valid ? (
              <Box data-testid="day-editor" sx={{ pt: 2.5, px: 1 }}>
                <Track
                  span={big}
                  store={store}
                  bars={[{ id: shift?.id ?? 0, start_time: start, end_time: end, flexible: false, title: '' }]}
                  actuals={actuals}
                  step={DAY_STEP}
                  height={40}
                  big
                  onCommit={(_bar, s, e) => { setStart(toHHMM(s)); setEnd(toHHMM(e)); }}
                />
                <HourTicks span={big} />
                {actuals.length ? (
                  <Typography variant="caption" color="text.secondary">
                    Clocked {actuals.map((t) => `${clock(t.start)}-${t.end ? clock(t.end) : 'still in'}`).join(', ')}
                  </Typography>
                ) : null}
              </Box>
            ) : null}
            <FormControl fullWidth size="small">
              <InputLabel>Department</InputLabel>
              <Select label="Department" value={dept} onChange={(e) => setDept(String(e.target.value) === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">None</MenuItem>
                {(departments.data ?? []).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1.5}>
              <TextField label="Start" type="time" size="small" value={start} onChange={(e) => setStart(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ step: 300 }} fullWidth />
              <TextField label="End" type="time" size="small" value={end} onChange={(e) => setEnd(e.target.value)} InputLabelProps={{ shrink: true }} inputProps={{ step: 300 }} fullWidth />
            </Stack>
            <TextField label="Note (optional)" size="small" value={note} onChange={(e) => setNote(e.target.value)} fullWidth />
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {shift ? <Typography variant="body2" color="text.secondary">Shift: {shift.text} {shift.department_name}</Typography> : null}
            <ToggleButtonGroup exclusive size="small" value={kind} onChange={(_e, v) => v && setKind(v)}>
              <ToggleButton value="called_in">Called in</ToggleButton>
              <ToggleButton value="no_show">No call, no show</ToggleButton>
            </ToggleButtonGroup>
            <TextField label="Reason" size="small" value={reason} onChange={(e) => setReason(e.target.value)} fullWidth
              helperText={kind === 'called_in' ? 'Recorded as called now.' : ' '} />
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {!callIn && shift ? (
          <Button color="error" disabled={busy} onClick={() => run(() => deleteScheduledShift(shift.id), 'Shift removed')} sx={{ mr: 'auto' }}>
            Remove
          </Button>
        ) : null}
        {!callIn ? (
          <Button disabled={busy} onClick={() => setCallIn(true)}>Record call-in</Button>
        ) : (
          <Button disabled={busy} onClick={() => setCallIn(false)}>Back</Button>
        )}
        <Button disabled={busy} onClick={onClose}>Cancel</Button>
        {!callIn ? (
          <Button variant="contained" disabled={busy || !start || !end} onClick={save}>{shift ? 'Save' : 'Add shift'}</Button>
        ) : (
          <Button variant="contained" color="warning" disabled={busy} onClick={saveCallIn}>Save call-in</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

/** What every row and cell of the week needs. */
interface Grid {
  week: ScheduleWeek;
  byCell: Map<string, ScheduledShift[]>;
  callIns: Map<string, CallIn[]>;
  actual: Map<string, ActualSpan[]>;
  /** Waiting requests by person and day (a run of days off is on each of its days). */
  requests: Map<string, ScheduleRequest[]>;
  /** Null when the reader cannot change the week. */
  onPick: ((target: Target) => void) | null;
  /** Staff: tap a day of their own, today or later, to ask for a change (null for managers). */
  onAsk: ((person: Person, day: string, shift: ScheduledShift | undefined) => void) | null;
  /** Null when the reader cannot change the week: drag a bar's end to new times. */
  onTimes: ((shift: ScheduledShift, start: number, end: number) => Promise<unknown>) | null;
  todayIdx: number;
  /** 'yyyy-MM-dd'. */
  today: string;
  nowMinutes: number;
  /** One timeline for the week, minutes after midnight. */
  span: [number, number];
  weekBuilt: boolean;
  dayNames: string[];
}

const barOf = (s: ScheduledShift): Bar => ({
  id: s.id, start_time: s.start_time, end_time: s.end_time, flexible: s.flexible,
  title: `${s.text}${s.department_name ? ` ${s.department_name}` : ''}${s.note ? ` · ${s.note}` : ''}`,
});

/** One person's day as a timeline, editable for managers. */
function DayTrack({ g, person, day, shifts, height }: { g: Grid; person: Person; day: string; shifts: ScheduledShift[]; height?: number }) {
  const i = g.week.days.indexOf(day);
  const byId = new Map(shifts.map((s) => [s.id, s]));
  return (
    <Track
      span={g.span}
      store={g.week.store_hours?.[i]}
      bars={shifts.map(barOf)}
      actuals={g.actual.get(`${person.id}:${day}`) ?? []}
      step={WEEK_STEP}
      height={height}
      now={i === g.todayIdx ? g.nowMinutes : undefined}
      onCommit={g.onTimes ? (bar, s, e) => g.onTimes!(byId.get(bar.id)!, s, e) : undefined}
      onOpen={g.onPick ? (bar) => g.onPick!({ person, day, shift: byId.get(bar.id) ?? null }) : undefined}
    />
  );
}

const cellSx = (g: Grid, i: number) => ({
  height: ROW,
  px: 0.5,
  py: 0,
  overflow: 'hidden',
  bgcolor: i === g.todayIdx ? tint('primary', 0.07) : undefined,
  cursor: g.onPick ? 'pointer' : 'default',
  ...(g.onPick ? { '&:hover': { boxShadow: (t: Theme) => `inset 0 0 0 1px ${alpha(t.palette.primary.main, 0.5)}` } } : {}),
});

/** One line, small, regular weight; the shape every exception takes. */
const chipSx = {
  display: 'block', height: 22, lineHeight: '20px', px: 0.75, borderRadius: '6px', fontSize: 12, fontWeight: 400,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: 1, maxWidth: '100%', boxSizing: 'border-box',
} as const;

/** A call-in replaces the shift: red tint, the label, then the struck-through time (the label survives a narrow cell). */
function CallInChip({ calls, shift }: { calls: CallIn[]; shift: ScheduledShift | undefined }) {
  const c = calls[0];
  const time = shift ? range(shift.start_time, shift.end_time) : c.shift_text.split(' ')[0];
  return (
    <Box
      component="span"
      data-testid="callin-cell"
      title={`${c.kind_label}${c.reason ? `: ${c.reason}` : ''}`}
      sx={{ ...chipSx, bgcolor: tint('error', 0.12), borderColor: tint('error', 0.35), color: 'error.main' }}
    >
      {c.kind_label}
      {time ? <Box component="s" sx={{ color: 'text.secondary', ml: 0.5 }}>{time}</Box> : null}
    </Box>
  );
}

/** A manager's shift note: a small mark in the corner, the note on hover. */
function NoteMark({ note }: { note: string }) {
  return (
    <Box component="span" title={note} aria-label={note}
      sx={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main' }} />
  );
}

/** A flexible row on a day that is not today: only what differs from the usual week. */
function Exception({ g, person, i, shifts, calls }: { g: Grid; person: Person; i: number; shifts: ScheduledShift[]; calls: CallIn[] }) {
  const { tr } = useCopy();
  const kind = dayKind(person.usual ?? [], i, shifts, calls, g.weekBuilt);
  if (kind === 'off') {
    return (
      <Box component="span" title={tr('dayOff')} sx={{ ...chipSx, borderStyle: 'dashed', borderColor: 'divider', color: 'text.secondary', display: 'inline-block' }}>
        {tr('off')}
      </Box>
    );
  }
  if (kind !== 'extra' && kind !== 'changed') return null;
  const s = shifts[0];
  return (
    <Box
      component="span"
      title={`${tr(kind)}: ${shifts.map((x) => `${x.text}${x.department_name ? ` ${x.department_name}` : ''}`).join(', ')}`}
      sx={{ ...chipSx, display: 'inline-block', borderColor: kind === 'extra' ? 'primary.main' : 'divider', color: 'text.primary' }}
    >
      {kind === 'extra' ? '+ ' : ''}{range(s.start_time, s.end_time)}{shifts.length > 1 ? ` +${shifts.length - 1}` : ''}
    </Box>
  );
}

/** What a tap on a person's day does: a manager opens it; staff ask about a day of their own, today or later. */
function tapFor(g: Grid, person: Person, day: string, shifts: ScheduledShift[]): (() => void) | undefined {
  if (g.onPick) return () => g.onPick!({ person, day, shift: shifts[0] ?? null });
  if (g.onAsk && day >= g.today) return () => g.onAsk!(person, day, shifts[0]);
  return undefined;
}

/** A waiting request on this day: a dashed blue frame round the cell (nothing inside moves), the ask on hover. */
function RequestMark({ requests }: { requests: ScheduleRequest[] }) {
  const { t, describe } = useRequestCopy();
  const text = requests.map((r) => `${describe(r)}${r.note ? ` · “${r.note}”` : ''}`).join('\n');
  return (
    <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{`${t('asked')}: ${text}`}</span>} enterDelay={0} disableInteractive>
      <Box component="span" data-testid="request-mark" aria-label={`${t('asked')}: ${text}`}
        sx={{ position: 'absolute', inset: 2, border: '1.5px dashed', borderColor: 'info.main', borderRadius: '6px', zIndex: 1 }} />
    </Tooltip>
  );
}

function DayCell({ g, person, i, fixed }: { g: Grid; person: Person; i: number; fixed: boolean }) {
  const day = g.week.days[i];
  const shifts = g.byCell.get(`${person.id}:${day}`) ?? [];
  const calls = g.callIns.get(`${person.id}:${day}`) ?? [];
  const hasActual = Boolean(g.actual.get(`${person.id}:${day}`)?.length);
  let body: ReactNode = null;
  if (calls.length) body = <CallInChip calls={calls} shift={shifts[0]} />;
  // Retail every day; a flexible row today (to set against the clock), or any day someone clocked in.
  else if (fixed || ((i === g.todayIdx || hasActual) && (shifts.length || hasActual))) {
    body = shifts.length || hasActual ? <DayTrack g={g} person={person} day={day} shifts={shifts} /> : null;
  }
  else body = <Exception g={g} person={person} i={i} shifts={shifts} calls={calls} />;
  const note = shifts.find((s) => s.note)?.note;
  const asked = g.requests.get(`${person.id}:${day}`);
  const tap = tapFor(g, person, day, shifts);
  return (
    <Box component="td" data-testid={`cell-${person.id}-${day}`} onClick={tap}
      sx={{ ...cellSx(g, i), position: 'relative', cursor: tap ? 'pointer' : 'default' }}>
      {body}
      {note && !calls.length ? <NoteMark note={note} /> : null}
      {asked ? <RequestMark requests={asked} /> : null}
    </Box>
  );
}

/** A section's shifts on one day, minus anyone who called in: who counts toward its coverage. */
function sectionShifts(g: Grid, section: Section, day: string): ScheduledShift[] {
  return g.week.shifts.filter((s) => s.date === day
    && (section.fixed ? !s.flexible : String(s.department ?? 'none') === section.key)
    && !(g.callIns.get(`${s.employee}:${day}`)?.length));
}

/** One day's coverage: the head count as a strip, then a few words. Fixed departments flag gaps and single cover. */
function CoverageCell({ g, section, day, i, wide }: { g: Grid; section: Section; day: string; i: number; wide?: boolean }) {
  const { tr } = useCopy();
  const [a, b] = g.span;
  const pos = (m: number) => `${((Math.min(Math.max(m, a), b) - a) / (b - a)) * 100}%`;
  const cov = sectionCoverage(sectionShifts(g, section, day), g.week.store_hours?.[i], section.fixed);
  if (!cov.window) {
    return <Typography variant="caption" color="text.disabled">{g.week.store_hours?.[i]?.open === false ? tr('closed') : tr('nobody')}</Typography>;
  }
  const sum = summarize(cov.segments);
  let text: string;
  let color = 'text.secondary';
  if (cov.flagged && (sum.gaps.length || sum.singles.length)) {
    const list = sum.gaps.length ? sum.gaps : sum.singles;
    text = `${tr(sum.gaps.length ? 'gap' : 'single')} ${short(list[0].from)}-${short(list[0].to)}${list.length > 1 ? ` +${list.length - 1}` : ''}`;
    color = sum.gaps.length ? 'error.main' : 'warning.main';
  } else if (cov.flagged) {
    text = `${Math.min(...cov.segments.map((s) => s.count))}+ ${tr('covered')}`;
    color = 'success.main';
  } else {
    text = `${sum.peak} ${tr('on')} ${short(cov.window[0])}-${short(cov.window[1])}`;
  }
  const shade = (n: number) => (cov.flagged
    ? (n === 0 ? tint('error', 0.55) : n === 1 ? tint('warning', 0.5) : tint('success', 0.35))
    : (n === 0 ? 'transparent' : tint('primary', Math.min(0.12 + 0.08 * n, 0.5))));
  return (
    <Box data-testid={`coverage-${section.key}-${day}`} title={cov.segments.map((s) => `${short(s.from)}-${short(s.to)}: ${s.count}`).join(' · ')}>
      <Box sx={{ position: 'relative', height: 8, mt: 0.5 }}>
        {cov.segments.map((s) => (
          <Box key={s.from} sx={{ position: 'absolute', top: 0, bottom: 0, left: pos(s.from), right: `calc(100% - ${pos(s.to)})`, bgcolor: shade(s.count) }} />
        ))}
      </Box>
      <Typography component="div" noWrap sx={{ fontSize: wide ? 12 : 11, lineHeight: '18px', mt: 0.25, color }}>{text}</Typography>
    </Box>
  );
}

function CoverageRow({ g, section, canEdit }: { g: Grid; section: Section; canEdit: boolean }) {
  const { tr } = useCopy();
  return (
    <tr data-testid={`coverage-row-${section.key}`}>
      <Box component="td" sx={{ height: ROW, position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', px: 1 }}>
        <Typography variant="body2" color="text.secondary" noWrap>{tr(section.fixed ? 'floorCoverage' : 'coverage')}</Typography>
      </Box>
      <td />
      {g.week.days.map((day, i) => (
        <Box component="td" key={day} sx={{ ...cellSx(g, i), cursor: 'default', '&:hover': undefined }}>
          <CoverageCell g={g} section={section} day={day} i={i} />
        </Box>
      ))}
      {canEdit ? <td /> : null}
    </tr>
  );
}

/** Scheduled / actual: '34 / 31.5'; the actual only when the reader may see it. */
function HoursText({ person }: { person: Person }) {
  const actual = person.actual_hours;
  return (
    <>
      <Box component="span" sx={{ color: 'text.secondary' }}>{person.hours || '-'}</Box>
      {actual != null ? (
        <Box component="span" data-testid={`actual-hours-${person.id}`} sx={{ color: 'text.primary' }}> / {Math.round(actual * 10) / 10}</Box>
      ) : null}
    </>
  );
}

function CallInsCell({ g, person }: { g: Grid; person: Person }) {
  const counts = person.call_ins;
  const thisWeek = g.week.call_ins.filter((c) => c.employee === person.id).length;
  if (!counts) return <td />;
  const text = thisWeek
    ? `${thisWeek} call-in${thisWeek === 1 ? '' : 's'} this week`
    : counts.d30 ? `${counts.d30} in 30 days` : '';
  return (
    <Box component="td" sx={{ height: ROW, px: 1, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden' }}>
      {text ? (
        <Tooltip title={`Call-ins and no-shows: ${counts.d30} in the last 30 days, ${counts.d90} in the last 90 (${counts.no_show_90} no-show${counts.no_show_90 === 1 ? '' : 's'}).`}>
          <Typography component="span" sx={{ fontSize: 12, color: counts.d30 >= 2 ? 'error.main' : thisWeek ? 'text.primary' : 'text.secondary' }}>
            {text}
          </Typography>
        </Tooltip>
      ) : null}
    </Box>
  );
}

/** A section's name, head count and the collapse arrow (every section collapses). */
function SectionTitle({ section, collapsed, onToggle }: { section: Section; collapsed: boolean; onToggle: () => void }) {
  const { tr } = useCopy();
  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
      <IconButton size="small" aria-label={`${collapsed ? tr('show') : tr('hide')} ${section.name || tr('noDept')}`} aria-expanded={!collapsed} onClick={onToggle} sx={{ ml: -0.5, p: 0.25 }}>
        <ExpandMoreRounded fontSize="small" sx={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} />
      </IconButton>
      <Typography fontWeight={800} noWrap>{section.name || tr('noDept')}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap>{section.people.length}</Typography>
    </Stack>
  );
}

/** The name cell: status dot and name; a flexible row says its usual week underneath. */
function NameCell({ g, person, fixed }: { g: Grid; person: Person; fixed: boolean }) {
  const { tr } = useCopy();
  const usual = fixed ? '' : usualText(person.usual ?? [], g.dayNames);
  return (
    <>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
        <NowDot state={g.week.now?.[String(person.id)]} />
        <Typography variant="body2" fontWeight={700} noWrap title={person.name}>{person.name}</Typography>
      </Stack>
      {fixed ? null : (
        <Typography noWrap data-testid={`usual-${person.id}`} title={usual ? `${tr('usual')}: ${usual}` : tr('noUsual')}
          sx={{ fontSize: 11, lineHeight: '15px', pl: '14px', color: usual ? 'text.secondary' : 'text.disabled' }}>
          {usual || tr('noUsual')}
        </Typography>
      )}
    </>
  );
}

function SectionTable({ g, section, canEdit, collapsed, onToggle }: {
  g: Grid; section: Section; canEdit: boolean; collapsed: boolean; onToggle: () => void;
}) {
  const { tr, day: dayName } = useCopy();
  const { fixed } = section;
  // A narrow screen opens each section at today, not Monday; once per week shown, so a refetch never moves it.
  const scrollToToday = (el: HTMLDivElement | null) => {
    if (!el || g.todayIdx < 1 || el.dataset.scrolledFor === g.week.start) return;
    el.dataset.scrolledFor = g.week.start;
    const head = el.querySelectorAll('thead th');
    const name = head[0] as HTMLElement | undefined;
    const today = head[2 + g.todayIdx] as HTMLElement | undefined;
    if (name && today && today.offsetLeft + today.offsetWidth > el.clientWidth) {
      el.scrollLeft = today.offsetLeft - name.offsetWidth;
    }
  };
  return (
    <Box data-testid={`section-${section.key}`} ref={scrollToToday}
      sx={{ mb: 1.5, border: 1, borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper', overflowX: 'auto', overflowY: 'hidden' }}>
      <Box component="table" sx={{
        width: '100%', minWidth: canEdit ? 1000 : 860, tableLayout: 'fixed', borderCollapse: 'collapse',
        '& td, & th': { borderTop: 1, borderColor: 'divider', verticalAlign: 'middle' },
        '& thead th': { borderTop: 0 },
      }}>
        <colgroup>
          <Box component="col" sx={{ width: NAME_W }} />
          <col style={{ width: HOURS_W }} />
          {g.week.days.map((d) => <col key={d} />)}
          {canEdit ? <col style={{ width: CALLS_W }} /> : null}
        </colgroup>
        <thead>
          <tr>
            <Box component="th" sx={{ height: 40, textAlign: 'left', px: 1, position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper' }}>
              <SectionTitle section={section} collapsed={collapsed} onToggle={onToggle} />
            </Box>
            <Box component="th" sx={{ textAlign: 'right', pr: 1, fontSize: 12, fontWeight: 400, color: 'text.secondary' }}>
              <Tooltip title={tr('hoursTip')}><span>{tr('hours')}</span></Tooltip>
            </Box>
            {g.week.days.map((d, i) => (
              <Box component="th" key={d} sx={{
                textAlign: 'left', px: 0.75, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden',
                fontWeight: i === g.todayIdx ? 800 : 400, color: i === g.todayIdx ? 'primary.main' : 'text.secondary',
                bgcolor: i === g.todayIdx ? tint('primary', 0.07) : undefined,
              }}>
                {dayName(d, 'EEE d')}
              </Box>
            ))}
            {canEdit ? (
              <Box component="th" sx={{ textAlign: 'right', pr: 1, fontSize: 12, fontWeight: 400, color: 'text.secondary' }}>Call-ins</Box>
            ) : null}
          </tr>
        </thead>
        {collapsed ? null : (
          <tbody>
            {section.people.map((person) => (
              <tr key={person.id} data-testid={`schedule-row-${person.id}`}>
                <Box component="td" sx={{ height: ROW, px: 1, position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', overflow: 'hidden' }}>
                  <NameCell g={g} person={person} fixed={fixed} />
                </Box>
                <Box component="td" sx={{ height: ROW, textAlign: 'right', pr: 1, fontSize: 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  <HoursText person={person} />
                </Box>
                {g.week.days.map((d, i) => <DayCell key={d} g={g} person={person} i={i} fixed={fixed} />)}
                {canEdit ? <CallInsCell g={g} person={person} /> : null}
              </tr>
            ))}
            <CoverageRow g={g} section={section} canEdit={canEdit} />
          </tbody>
        )}
      </Box>
    </Box>
  );
}

/** The phone: one day at a time, everyone's bars across the screen, a section each (Bill, Dash Updates #57). */
function PhoneDay({ g, sections, day, onDay, collapsed, onToggle }: {
  g: Grid;
  sections: Section[];
  day: string;
  onDay: (day: string) => void;
  collapsed: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  const { tr, day: dayName } = useCopy();
  const i = g.week.days.indexOf(day);
  return (
    <Box data-testid="schedule-phone">
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5, mb: 1.5 }}>
        {g.week.days.map((d, n) => (
          <Button key={d} size="small" variant={d === day ? 'contained' : 'outlined'} onClick={() => onDay(d)}
            sx={{ minWidth: 0, px: 0, flexDirection: 'column', lineHeight: 1.2, borderColor: n === g.todayIdx && d !== day ? 'primary.main' : undefined }}>
            <span>{dayName(d, 'EEE')}</span>
            <span>{format(parseISO(d), 'd')}</span>
          </Button>
        ))}
      </Box>
      {sections.map((section) => {
        const shut = Boolean(collapsed[section.key]);
        return (
          <Box key={section.key} data-testid={`section-${section.key}`}
            sx={{ mb: 1.5, border: 1, borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper', overflow: 'hidden' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: 40, px: 1 }}>
              <SectionTitle section={section} collapsed={shut} onToggle={() => onToggle(section.key)} />
            </Box>
            {shut ? null : (
              <>
                <Box sx={{ display: 'grid', gridTemplateColumns: '112px 1fr 52px', px: 1, borderTop: 1, borderColor: 'divider' }}>
                  <span />
                  <HourTicks span={g.span} every={2} />
                  <span />
                </Box>
                {section.people.map((person) => {
                  const shifts = g.byCell.get(`${person.id}:${day}`) ?? [];
                  const calls = g.callIns.get(`${person.id}:${day}`) ?? [];
                  const asked = g.requests.get(`${person.id}:${day}`);
                  const tap = tapFor(g, person, day, shifts);
                  return (
                    <Box key={person.id} data-testid={`schedule-card-${person.id}`} onClick={tap}
                      sx={{ display: 'grid', gridTemplateColumns: '112px 1fr 52px', alignItems: 'center', height: ROW, px: 1, borderTop: 1, borderColor: 'divider', cursor: tap ? 'pointer' : 'default', position: 'relative' }}>
                      {asked ? <RequestMark requests={asked} /> : null}
                      <Box sx={{ minWidth: 0, pr: 0.5 }}><NameCell g={g} person={person} fixed={section.fixed} /></Box>
                      <Box sx={{ minWidth: 0 }}>
                        {calls.length ? <CallInChip calls={calls} shift={shifts[0]} />
                          : section.fixed || shifts.length || g.actual.get(`${person.id}:${day}`)?.length
                            ? <DayTrack g={g} person={person} day={day} shifts={shifts} />
                            : <Exception g={g} person={person} i={i} shifts={shifts} calls={calls} />}
                      </Box>
                      <Box sx={{ textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}><HoursText person={person} /></Box>
                    </Box>
                  );
                })}
                <Box sx={{ display: 'grid', gridTemplateColumns: '112px 1fr 52px', alignItems: 'center', height: ROW, px: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" color="text.secondary" noWrap>{tr(section.fixed ? 'floorCoverage' : 'coverage')}</Typography>
                  <CoverageCell g={g} section={section} day={day} i={i} wide />
                  <span />
                </Box>
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

const COLLAPSE_KEY = 'schedule.collapsed';

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

export default function SchedulePage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const wide = useMediaQuery(useTheme().breakpoints.up('md'));
  const thisMonday = fmt(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [start, setStart] = useState(thisMonday);
  const [target, setTarget] = useState<Target | null>(null);
  const [phoneDay, setPhoneDay] = useState<string | null>(null);
  const [ask, setAsk] = useState<AskStart | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);
  // Every minute, so "right now" stays right (react-query pauses it while the tab is hidden).
  const query = useQuery({
    queryKey: ['scheduleWeek', start],
    queryFn: async () => (await getScheduleWeek(start)).data,
    refetchInterval: 60_000,
  });
  const week = query.data;
  const canEdit = Boolean(week?.can_edit);
  const { tr, dayNames } = useCopy();
  const { t: rt } = useRequestCopy();
  // Managers: every waiting request, any week (the count on the Requests button).
  const waiting = useQuery({
    queryKey: ['scheduleRequests', 'pending'],
    queryFn: async () => (await getScheduleRequests('pending')).data,
    enabled: canEdit,
    refetchInterval: 60_000,
  });
  const meId = useMeId();
  const now = new Date();
  const today = fmt(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['scheduleRequests'] });
    return queryClient.invalidateQueries({ queryKey: ['scheduleWeek'] });
  };

  // Drag a bar's end: save the new times, then show them once the week has reloaded (the bar holds still meanwhile).
  const onTimes = async (shift: ScheduledShift, s: number, e: number) => {
    try {
      await updateScheduledShift(shift.id, { start_time: toHHMM(s), end_time: toHHMM(e) });
      await refresh();
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not change the times'), { variant: 'error' });
    }
  };

  const grid = useMemo<Grid | null>(() => {
    if (!week) return null;
    const group = <T,>(rows: T[], key: (r: T) => string) => {
      const map = new Map<string, T[]>();
      for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
      return map;
    };
    // A waiting request sits on each of its days in this week.
    const asked = new Map<string, ScheduleRequest[]>();
    for (const r of week.requests ?? []) {
      if (r.status !== 'pending') continue;
      for (const d of week.days) {
        if (d >= r.date && d <= r.end_date) asked.set(`${r.employee}:${d}`, [...(asked.get(`${r.employee}:${d}`) ?? []), r]);
      }
    }
    return {
      week,
      byCell: group(week.shifts, (s) => `${s.employee}:${s.date}`),
      requests: asked,
      callIns: group(week.call_ins, (c) => `${c.employee}:${c.shift_date}`),
      actual: group(week.actual ?? [], (t) => `${t.employee}:${t.date}`),
      weekBuilt: week.shifts.length > 0,
      dayNames,
      onPick: canEdit ? setTarget : null,
      onTimes: canEdit ? onTimes : null,
      onAsk: canEdit ? null : (person, d, shift) => {
        if (person.id === meId) setAsk({ date: d, start_time: shift?.start_time, end_time: shift?.end_time });
      },
      todayIdx: week.days.indexOf(today),
      today,
      nowMinutes,
      span: timelineWindow(week.store_hours ?? [], [
        ...week.shifts,
        // A punch still open runs to now (never to midnight).
        ...(week.actual ?? []).map((t) => ({ start_time: t.start, end_time: t.end ?? toHHMM(Math.max(nowMinutes, minutes(t.start) + 1)) })),
      ]),
    };
    // dayNames and onTimes are rebuilt each render; the language only changes with a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, canEdit, today, meId, Math.floor(nowMinutes / 5)]);
  const sections = useMemo(() => groupSections(week?.people ?? [], canEdit ? undefined : meId), [week, canEdit, meId]);
  const day = phoneDay && week?.days.includes(phoneDay) ? phoneDay : week?.days.includes(today) ? today : week?.days[0] ?? '';

  const toggle = (key: string) => setCollapsed((prev) => {
    const next = { ...prev, [key]: !prev[key] };
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {
      // A private window: it just won't be remembered.
    }
    return next;
  });
  const move = (days: number) => setStart(fmt(addDays(parseISO(start), days)));
  const quick = async (work: () => Promise<{ data: { made: number } }>, what: string) => {
    try {
      const { data } = await work();
      enqueueSnackbar(data.made ? `${data.made} shifts added from ${what}` : `Nothing to add from ${what}`, { variant: data.made ? 'success' : 'info' });
      refresh();
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not fill the week'), { variant: 'error' });
    }
  };

  return (
    <Box sx={{ pb: 4, minWidth: 0 }} data-testid="schedule-page">
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight={800}>{tr('schedule')}</Typography>
        <Tooltip title={tr('info')} enterTouchDelay={0} leaveTouchDelay={8000}>
          <IconButton size="small" aria-label={tr('info')} sx={{ color: 'text.secondary' }}><InfoOutlined fontSize="small" /></IconButton>
        </Tooltip>
        <Stack direction="row" alignItems="center" sx={{ border: 1, borderColor: 'divider', borderRadius: '10px', bgcolor: 'background.paper', ml: { md: 1 } }}>
          <IconButton aria-label={tr('prevWeek')} onClick={() => move(-7)}><ChevronLeftRounded /></IconButton>
          <Typography fontWeight={800} sx={{ minWidth: 112, textAlign: 'center', fontSize: 16 }} data-testid="schedule-week-label">{weekLabel(start)}</Typography>
          <IconButton aria-label={tr('nextWeek')} onClick={() => move(7)}><ChevronRightRounded /></IconButton>
        </Stack>
        <Button variant="contained" size="small" disabled={start === thisMonday} onClick={() => setStart(thisMonday)}>
          {tr('thisWeek')}
        </Button>
        <Box sx={{ flex: 1 }} />
        {week ? (
          <Button size="small" variant={canEdit && waiting.data?.length ? 'contained' : 'outlined'} color={canEdit && waiting.data?.length ? 'info' : 'primary'}
            data-testid="requests-button" onClick={() => setShowRequests(true)}>
            {canEdit ? `${rt('requests')}${waiting.data?.length ? ` (${waiting.data.length})` : ''}` : rt('myRequests')}
          </Button>
        ) : null}
        {canEdit ? (
          <Stack direction="row" spacing={0.5}>
            <Button size="small" color="inherit" sx={{ color: 'text.secondary' }} onClick={() => quick(() => copyScheduleWeek(fmt(addDays(parseISO(start), -7)), start), 'last week')}>
              Copy last week
            </Button>
            <Button size="small" color="inherit" sx={{ color: 'text.secondary' }} onClick={() => quick(() => fillScheduleFromUsual(start), 'usual shifts')}>
              Fill from usual shifts
            </Button>
          </Stack>
        ) : null}
      </Stack>
      {query.isError ? <Alert severity="error">{tr('couldNotLoad')}</Alert> : null}

      {grid && !wide ? (
        <PhoneDay g={grid} sections={sections} day={day} onDay={setPhoneDay} collapsed={collapsed} onToggle={toggle} />
      ) : null}
      {grid && wide ? sections.map((section) => (
        <SectionTable
          key={section.key}
          g={grid}
          section={section}
          canEdit={canEdit}
          collapsed={Boolean(collapsed[section.key])}
          onToggle={() => toggle(section.key)}
        />
      )) : null}

      {target && grid ? (
        <ShiftDialog
          key={`${target.person.id}-${target.day}-${target.shift?.id ?? 'new'}`}
          target={target}
          span={grid.span}
          store={grid.week.store_hours?.[grid.week.days.indexOf(target.day)]}
          actuals={grid.actual.get(`${target.person.id}:${target.day}`) ?? []}
          requests={grid.requests.get(`${target.person.id}:${target.day}`) ?? []}
          onClose={() => setTarget(null)}
          onSaved={refresh}
        />
      ) : null}
      {showRequests ? (
        <RequestsDialog
          manager={canEdit}
          onAsk={() => { setShowRequests(false); setAsk({ date: today }); }}
          onClose={() => setShowRequests(false)}
          onChanged={refresh}
        />
      ) : null}
      {ask ? <AskDialog initial={ask} today={today} onClose={() => setAsk(null)} onSent={refresh} /> : null}
    </Box>
  );
}
