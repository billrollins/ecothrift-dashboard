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
 * Much better (Bill, Dash Updates #74, 2026-11-05): every department draws its shifts as the green bars Retail has (the
 * "only what differs from usual" chips of #55 are gone), a manager can clear the shown week after typing to confirm,
 * and Hrs says planned for the week plus worked against planned so far, so a manager sees who is on track.
 * Round 2 (Bill, 2026-11-05): one scroll for every department across this week and next (the week buttons land on a
 * Monday; the header and hours follow once next Monday is reached), weekends shaded and a line before Monday, coverage
 * as its own band, wider days with the times inside the bars, drags held orange until Save / Cancel, and a call-in
 * keeps its bar with a red line under it. Call-in counts sit under the name.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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
  Menu,
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
  clearScheduleWeek,
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
  endMinutes,
  errorText,
  groupSections,
  hoursPace,
  minutes,
  ON_TRACK,
  range,
  sectionCoverage,
  short,
  snap,
  summarize,
  timelineWindow,
  toHHMM,
  type Pace,
  type Person,
  type Section,
} from './scheduleLayout';
import { StaffLink } from '../../components/staff/StaffLink';

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

/** What staff read here, in English and Spanish. */
const COPY = {
  schedule: { en: 'Schedule', es: 'Horario' },
  thisWeek: { en: 'This week', es: 'Esta semana' },
  weekTools: { en: 'Week tools', es: 'Herramientas' },
  prevWeek: { en: 'Previous week', es: 'Semana anterior' },
  nextWeek: { en: 'Next week', es: 'Semana siguiente' },
  prevDay: { en: 'Earlier day', es: 'Día anterior' },
  nextDay: { en: 'Later day', es: 'Día siguiente' },
  person: { en: 'Person', es: 'Persona' },
  hoursTip: {
    en: 'Worked: hours clocked so far this week. Due: hours scheduled up to now. Week: hours scheduled for the whole week. Worked is green when it matches Due (within half an hour), amber when behind or ahead.',
    es: 'Trabajó: horas marcadas en la semana hasta ahora. Debe: horas programadas hasta ahora. Semana: horas programadas en toda la semana. Trabajó es verde si coincide con Debe (media hora), ámbar si va atrás o adelante.',
  },
  planned: { en: 'planned', es: 'plan' },
  of: { en: 'of', es: 'de' },
  onTrack: { en: 'on track', es: 'al día' },
  behind: { en: 'behind', es: 'atrás' },
  ahead: { en: 'ahead', es: 'adelante' },
  soFar: { en: 'so far', es: 'hasta ahora' },
  worked: { en: 'Worked', es: 'Trabajó' },
  workedLow: { en: 'worked', es: 'trab.' },
  hoursHead: { en: 'Worked / plan', es: 'Trabajó / plan' },
  colWorked: { en: 'Worked', es: 'Trabajó' },
  colDue: { en: 'Due', es: 'Debe' },
  colWeek: { en: 'Week', es: 'Semana' },
  today: { en: 'Today', es: 'Hoy' },
  paceFor: { en: 'If the rest goes as planned, the week ends at', es: 'Si el resto va según el plan, la semana termina en' },
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
  on: { en: 'on', es: 'en' },
  noDept: { en: 'No department', es: 'Sin departamento' },
  show: { en: 'Show', es: 'Mostrar' },
  hide: { en: 'Hide', es: 'Ocultar' },
  info: {
    en: 'Each shift is a bar from start to end; the purple line under it is when they actually clocked in and out. The coverage row under each department counts who is on; under Retail it flags the floor (red = nobody, amber = one person). A red line under a bar is a call-in. Scroll sideways to see next week. Managers drag a bar\'s ends to change its times (orange until Save), or tap it to open the day.',
    es: 'Cada turno es una barra de inicio a fin; la línea morada debajo es cuando realmente marcaron entrada y salida. La fila de cobertura bajo cada departamento cuenta quién está; bajo Retail marca el piso (rojo = nadie, ámbar = una persona). Una línea roja bajo una barra es una ausencia avisada. Desplace de lado para ver la semana siguiente. Los gerentes arrastran los extremos de una barra para cambiar sus horas (naranja hasta Guardar), o la tocan para abrir el día.',
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
  };
}

/** Every row is this tall, so nothing moves (Bill hates content that shifts). */
const ROW = 42;
/** The actual clock-in to clock-out line: bright purple, so it stands apart from the green shift bars (Bill 11-03). */
const ACTUAL = '#7c4dff';
/** The desk grid: name and hours stay put while the days scroll (two weeks, one scroll for every department). */
const NAME_W = 156;
/** Worked / Due / Week, three labelled columns (Bill 11-05: the numbers must say what they are). */
const HOURS_W = 138;
const HCOLS = '1fr 1fr 1fr';
/** Wide enough that a shift's times read inside its bar (Bill, 2026-11-05). */
const DAY_W = 220;
/** Never narrower than this: below it a shift's times stop reading. */
const DAY_MIN = 150;
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
  title: string;
  /** Changed here and not saved yet: drawn orange until Save (Bill, 2026-11-05). */
  pending?: boolean;
  /** A call-in on this shift: the hover text; the bar keeps its size and gets a red line under it. */
  calledIn?: string;
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
  // The track's width in pixels, so a time label can sit inside its bar or wholly beside it (0 until measured).
  const [trackW, setTrackW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setTrackW(el.getBoundingClientRect().width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [drag, setDrag] = useState<{ id: number; start: number; end: number } | null>(null);
  const [a, b] = span;
  const pct = (m: number) => ((Math.min(Math.max(m, a), b) - a) / (b - a)) * 100;
  const place = (from: number, to: number) => ({ left: `${pct(from)}%`, width: `${Math.max(pct(to) - pct(from), 0)}%` });
  const strip = big ? 3 : 2;
  const barH = height - strip - 2;
  // One hover text for the bar and the line: the clocked times that day ('' = none, so no hover).
  const actualText = actuals
    .map((t) => `${tr('clocked')} ${clock(t.start)}-${t.end ? clock(t.end) : tr('stillIn')}`)
    .join(' · ');

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
      data-grip
      aria-hidden
      onPointerDown={(e) => begin(e, bar, edge)}
      onClick={(e) => e.stopPropagation()}
      sx={{
        // A wide grab zone at each end (critic 11-05), with a grip that shows on hover.
        position: 'absolute', top: 0, bottom: 0, [edge === 'start' ? 'left' : 'right']: -6, width: big ? 16 : 14,
        cursor: 'ew-resize', touchAction: 'none', zIndex: 2,
        '&::after': {
          content: '""', position: 'absolute', top: '25%', bottom: '25%', left: '50%', width: 3, ml: '-1.5px', borderRadius: 1,
          // Always faintly there, so you can see where to grab; stronger on hover.
          bgcolor: 'success.dark', opacity: big ? 0.8 : 0, transition: 'opacity .1s',
        },
        '&:hover::after': { opacity: 0.8 },
      }}
    />
  );

  return (
    <Box ref={ref} sx={{ position: 'relative', height }}>
      {big && store?.open ? (
        <Box sx={{ position: 'absolute', top: 0, height: barH, ...place(minutes(store.start), minutes(store.end)), bgcolor: 'action.hover', borderRadius: '4px' }} />
      ) : null}
      {bars.map((bar) => {
        const live = drag?.id === bar.id ? drag : null;
        const from = live?.start ?? minutes(bar.start_time);
        const to = live?.end ?? endMinutes(bar);
        // The bar shows the scheduled times already; hovering it (like the line under it) says the clocked times, at
        // once (Bill, 2026-11-04). No clock-in that day: no hover.
        return (
          <Tooltip
            key={bar.id}
            title={[`${short(minutes(bar.start_time))}-${short(endMinutes(bar))}`, bar.calledIn || actualText].filter(Boolean).join(' · ')}
            enterDelay={0}
            enterNextDelay={0}
            disableInteractive
            placement="bottom"
          >
          <Box
            data-testid={`bar-${bar.id}`}
            onClick={onOpen ? (e) => { e.stopPropagation(); onOpen(bar); } : undefined}
            sx={{
              position: 'absolute', top: 0, height: barH, ...place(from, to),
              // A called-in shift is a red bar (Bill, 2026-11-05), with the red line under it.
              bgcolor: bar.pending ? tint('warning', 0.28) : bar.calledIn ? tint('error', 0.16) : tint('success', 0.16),
              boxShadow: (t: Theme) => `inset 3px 0 0 ${bar.pending ? t.palette.warning.main : bar.calledIn ? t.palette.error.main : t.palette.success.main}`,
              outline: live ? 2 : 0, outlineColor: bar.pending ? 'warning.main' : 'success.main', borderRadius: '4px',
              fontSize: big ? 13 : 11, lineHeight: `${barH}px`, overflow: 'visible', whiteSpace: 'nowrap',
              cursor: onOpen ? 'pointer' : 'default', userSelect: 'none',
            }}
          >
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
          </Tooltip>
        );
      })}
      {/* The times, inside the bar (Bill, 2026-11-05): 12 px when they fit, smaller for a short shift. Never outside
          the day's track. Taps go through to the bar or the day, so the ends still drag. */}
      {big ? null : bars.map((bar) => {
        const live = drag?.id === bar.id ? drag : null;
        const from = live?.start ?? minutes(bar.start_time);
        const to = live?.end ?? endMinutes(bar);
        const text = `${short(from)}-${short(to)}`;
        const x0 = (pct(from) / 100) * trackW;
        const x1 = (pct(to) / 100) * trackW;
        const room = x1 - x0 - 10; // less the drag handles at each end
        // About 0.6 of the font size a character at weight 600.
        const fits = (t: string, f: number) => t.length * f * 0.62 <= room;
        // The full times always read (critic 11-05: "8:30" alone looks like a shift with no end): inside the bar at
        // 12 px, or 11 px; a shift too short for them has them beside it on the white, on the side with room.
        const shown = text;
        let size = 12;
        let left: number | undefined;
        let beside = false;
        if (trackW) {
          const w = (f: number) => text.length * f * 0.62;
          if (fits(text, 12)) left = x0 + 6;
          else if (fits(text, 11)) { size = 11; left = x0 + 6; }
          else if (fits(text, 10)) { size = 10; left = x0 + 6; }
          else {
            size = 11;
            beside = true;
            left = trackW - x1 >= w(11) + 6 ? x1 + 6 : x0 >= w(11) + 6 ? x0 - w(11) - 6 : Math.max(0, trackW - w(11) - 2);
          }
        }
        return (
          <Box key={`label-${bar.id}`} component="span" data-testid={`bar-label-${bar.id}`} aria-hidden
            sx={{
              position: 'absolute', top: 0, height: barH, lineHeight: `${barH}px`, fontSize: size, fontWeight: 600,
              ...(left == null ? { left: `calc(${pct(from)}% + 6px)` } : { left }),
              whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 1,
              color: bar.pending ? 'warning.dark' : bar.calledIn ? 'error.dark' : beside ? 'text.secondary' : 'text.primary',
            }}>
            {shown}
          </Box>
        );
      })}
      {bars.filter((bar) => bar.calledIn).map((bar) => (
        <Box key={`called-${bar.id}`} data-testid={`callin-mark-${bar.id}`} aria-label={bar.calledIn}
          sx={{ position: 'absolute', bottom: 0, height: strip + 1, ...place(minutes(bar.start_time), endMinutes(bar)), bgcolor: 'error.main', borderRadius: 99, zIndex: 1 }} />
      ))}
      {actuals.map((t) => {
        const from = minutes(t.start);
        const to = t.end ? minutes(t.end) : now ?? from;
        // A normal day is quiet (critic vision letter 11-05): clocked within 10 minutes of a shift's start and end, the
        // line is a whisper; off the plan, it is plain purple.
        const onPlan = bars.some((bar) => Math.abs(minutes(bar.start_time) - from) <= 10
          && (!t.end || Math.abs(endMinutes(bar) - to) <= 10));
        // Hovered at once, it says the clocked times; a taller see-through box around the thin line makes it easy to hit.
        return (
          <Tooltip
            key={`${t.start}-${t.employee}`}
            title={actualText}
            enterDelay={0}
            enterNextDelay={0}
            disableInteractive
            placement="bottom"
          >
            <Box
              data-testid="actual-strip"
              sx={{ position: 'absolute', bottom: -3, height: strip + 7, ...place(from, Math.max(to, from + 5)), zIndex: 1, display: 'flex', alignItems: 'flex-end', pb: '3px' }}
            >
              <Box data-on-plan={onPlan || undefined} sx={{ width: '100%', height: strip, bgcolor: ACTUAL, borderRadius: 99, opacity: onPlan ? 0.22 : 0.85 }} />
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
        <StaffLink userId={target.person.id}>{target.person.name}</StaffLink> · {format(parseISO(target.day), 'EEE MMM d')}
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
                  bars={[{ id: shift?.id ?? 0, start_time: start, end_time: end, title: '' }]}
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
  /** Each person's hours: planned, so far, worked. */
  pace: Map<number, Pace>;
  /** Dragged times not saved yet, by shift id. */
  pending: Map<number, { start_time: string; end_time: string }>;
  /** The days of the week the header names (hours and call-in counts are for it). */
  weekDays: string[];
}

/** A shift as a bar: unsaved times drawn orange; a call-in keeps the bar and says so on hover. */
function barOf(g: Grid, s: ScheduledShift, calls: CallIn[]): Bar {
  const edit = g.pending.get(s.id);
  const c = calls.find((x) => x.scheduled_shift === s.id) ?? calls[0];
  return {
    id: s.id, start_time: edit?.start_time ?? s.start_time, end_time: edit?.end_time ?? s.end_time,
    title: `${s.text}${s.department_name ? ` ${s.department_name}` : ''}${s.note ? ` · ${s.note}` : ''}`,
    pending: Boolean(edit),
    calledIn: c ? `${c.kind_label}${c.reason ? `: ${c.reason}` : ''}` : undefined,
  };
}

/** Saturday and Sunday (shaded), and Monday (a line before it): the week's anchors (Bill, 2026-11-05). */
const weekday = (day: string) => parseISO(day).getDay();
const isWeekend = (day: string) => weekday(day) === 0 || weekday(day) === 6;

/** One person's day as a timeline, editable for managers. */
function DayTrack({ g, person, day, shifts, height }: { g: Grid; person: Person; day: string; shifts: ScheduledShift[]; height?: number }) {
  const i = g.week.days.indexOf(day);
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const calls = g.callIns.get(`${person.id}:${day}`) ?? [];
  return (
    <Track
      span={g.span}
      store={g.week.store_hours?.[i]}
      bars={shifts.map((s) => barOf(g, s, calls))}
      actuals={g.actual.get(`${person.id}:${day}`) ?? []}
      step={WEEK_STEP}
      height={height ?? 28}
      now={i === g.todayIdx ? g.nowMinutes : undefined}
      onCommit={g.onTimes ? (bar, s, e) => g.onTimes!(byId.get(bar.id)!, s, e) : undefined}
      onOpen={g.onPick ? (bar) => g.onPick!({ person, day, shift: byId.get(bar.id) ?? null }) : undefined}
    />
  );
}

/** Today's column: a bright green line down each side. */
const todayEdge = (g: Grid, i: number) => (i === g.todayIdx
  // '&&' wins over the table's own grey cell borders (critic 11-05: the outline came out grey).
  ? { '&&': { borderLeft: 2, borderLeftStyle: 'solid', borderLeftColor: 'primary.main', borderRight: 2, borderRightStyle: 'solid', borderRightColor: 'primary.main' } }
  : {});

const cellSx = (g: Grid, i: number) => ({
  height: ROW,
  px: 0.5,
  py: 0,
  overflow: 'hidden',
  // Only Saturday and Sunday are shaded (the week's anchor); today is a bright outline, never a fill (Bill 11-05).
  bgcolor: isWeekend(g.week.days[i]) ? 'action.hover' : undefined,
  // Thin lines between the days (Bill, 2026-11-05).
  borderLeft: 1, borderLeftColor: 'divider',
  ...todayEdge(g, i),
  // The bar-end grips show on the day under the pointer (lean: no marks on every bar).
  '&:hover [data-grip]::after': { opacity: 0.7 },
  cursor: g.onPick ? 'pointer' : 'default',
  ...(g.onPick ? { '&:hover': { boxShadow: (t: Theme) => `inset 0 0 0 1px ${alpha(t.palette.primary.main, 0.5)}` } } : {}),
});

/** One line, small, regular weight: the call-in label's shape. */
const chipSx = {
  display: 'block', height: 22, lineHeight: '20px', px: 0.75, borderRadius: '6px', fontSize: 12, fontWeight: 400,
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: 1, maxWidth: '100%', boxSizing: 'border-box',
} as const;

/** A call-in on a day with no shift: red tint, the label, then the struck-through time it was for. */
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

function DayCell({ g, person, i }: { g: Grid; person: Person; i: number }) {
  const day = g.week.days[i];
  const shifts = g.byCell.get(`${person.id}:${day}`) ?? [];
  const calls = g.callIns.get(`${person.id}:${day}`) ?? [];
  const hasActual = Boolean(g.actual.get(`${person.id}:${day}`)?.length);
  // Every department draws the day as bars (Dash Updates #74); a called-in shift keeps its bar with a red line under it
  // (Bill, 2026-11-05). Only a call-in with no shift that day shows the small label.
  let body: ReactNode = null;
  if (shifts.length || hasActual) body = <DayTrack g={g} person={person} day={day} shifts={shifts} />;
  else if (calls.length) body = <CallInChip calls={calls} shift={undefined} />;
  const note = shifts.find((s) => s.note)?.note;
  const asked = g.requests.get(`${person.id}:${day}`);
  const tap = tapFor(g, person, day, shifts);
  return (
    <Box component="td" data-testid={`cell-${person.id}-${day}`} onClick={tap}
      sx={{ ...cellSx(g, i), position: 'relative', cursor: tap ? 'pointer' : 'default' }}>
      {body}
      {note ? <NoteMark note={note} /> : null}
      {asked ? <RequestMark requests={asked} /> : null}
    </Box>
  );
}

/** A section's shifts on one day, minus anyone who called in: who counts toward its coverage. */
function sectionShifts(g: Grid, section: Section, day: string): ScheduledShift[] {
  return g.week.shifts.filter((s) => s.date === day
    && (section.fixed ? !s.flexible : String(s.department ?? 'none') === section.key)
    && !(g.callIns.get(`${s.employee}:${day}`)?.length))
    // Unsaved times count, so coverage shows what Save will do (critic 11-05).
    .map((s) => ({ ...s, ...(g.pending.get(s.id) ?? {}) }));
}

/** One day's coverage: the head count as a strip, then a few words. Fixed departments flag gaps and single cover. */
function CoverageCell({ g, section, day, i, wide }: { g: Grid; section: Section; day: string; i: number; wide?: boolean }) {
  const { tr } = useCopy();
  const [a, b] = g.span;
  const pos = (m: number) => `${((Math.min(Math.max(m, a), b) - a) / (b - a)) * 100}%`;
  const cov = sectionCoverage(sectionShifts(g, section, day), g.week.store_hours?.[i], section.fixed);
  // Every day draws the same full-width strip on the bars' timeline, grey where nobody is on, and one line of words
  // under it, so the band never has a blank day and every day lines up (Bill, 2026-11-05).
  const strip = (children?: ReactNode) => (
    <Box sx={{ position: 'relative', height: 5, borderRadius: 99, overflow: 'hidden', bgcolor: 'action.selected' }}>{children}</Box>
  );
  const words = (text: string, color: string) => (
    <Typography component="div" noWrap sx={{ fontSize: wide ? 12 : 11, lineHeight: '14px', mt: '3px', color }}>{text}</Typography>
  );
  if (!cov.window) {
    const quiet = g.week.store_hours?.[i]?.open === false ? tr('closed') : tr('nobody');
    return (
      <Box data-testid={`coverage-${section.key}-${day}`} aria-label={quiet} title={quiet}>
        {strip()}
        {words(quiet, 'text.disabled')}
      </Box>
    );
  }
  const sum = summarize(cov.segments);
  let text: string;
  // Only a thin spot on the floor is written out (Bill, 2026-11-05: lean); every other count is the strip, in words
  // on hover.
  let flag = '';
  let color = 'text.secondary';
  if (cov.flagged && (sum.gaps.length || sum.singles.length)) {
    // The worst stretch first by its times, then every other thin spot as "+N more"; the hover lists them all.
    const list = [...sum.gaps, ...sum.singles];
    const extra = list.length - 1;
    text = `${tr(sum.gaps.length ? 'gap' : 'single')} ${short(list[0].from)}-${short(list[0].to)}${extra ? ` +${extra}` : ''}`;
    flag = text;
    color = sum.gaps.length ? 'error.main' : 'warning.main';
  } else if (cov.flagged) {
    text = `${Math.min(...cov.segments.map((s) => s.count))}+ ${tr('on')} ${short(cov.window[0])}-${short(cov.window[1])}`;
  } else {
    // A count that changes over the span says its range ("2-3 on 9-5"), so it is true for all of it.
    const low = Math.min(...cov.segments.filter((x) => x.count > 0).map((x) => x.count));
    text = `${low < sum.peak ? `${low}-${sum.peak}` : sum.peak} ${tr('on')} ${short(cov.window[0])}-${short(cov.window[1])}`;
  }
  const shade = (n: number) => (cov.flagged
    ? (n === 0 ? tint('error', 0.55) : n === 1 ? tint('warning', 0.5) : tint('success', 0.3))
    : (n === 0 ? 'transparent' : tint('success', Math.min(0.15 + 0.07 * n, 0.4))));
  const detail = `${text} · ${cov.segments.map((s) => `${short(s.from)}-${short(s.to)}: ${s.count}`).join(' · ')}`;
  return (
    <Box data-testid={`coverage-${section.key}-${day}`} aria-label={text} title={detail}>
      {strip(cov.segments.map((s) => (
        <Box key={s.from} sx={{ position: 'absolute', top: 0, bottom: 0, left: pos(s.from), right: `calc(100% - ${pos(s.to)})`, bgcolor: shade(s.count) }} />
      )))}
      {/* Words only when the day is short (a normal day is the strip alone; the hover says the count). */}
      {flag ? words(flag, color) : null}
    </Box>
  );
}

const hrs = (n: number) => String(Math.round(n * 10) / 10);

/**
 * Hours (Bill, 2026-11-05): Worked so far | Due (scheduled up to now) | Week (scheduled in all); Worked is green on
 * track and amber when off by more than half an hour. The hover says it in full.
 */
function HoursText({ g, person, narrow = false }: { g: Grid; person: Person; narrow?: boolean }) {
  const { tr } = useCopy();
  const p = g.pace.get(person.id) ?? hoursPace([], person.actual_hours, g.today, g.nowMinutes);
  const off = p.delta != null && Math.abs(p.delta) > ON_TRACK;
  const tip = p.delta == null
    ? (p.planned ? `${hrs(p.planned)} h ${tr('planned')}` : '')
    : `${hrs(p.planned)} h ${tr('planned')}. ${tr('worked')} ${hrs(p.worked ?? 0)} ${tr('of')} ${hrs(p.toDate)} h ${tr('soFar')}: ${off ? `${hrs(Math.abs(p.delta))} h ${tr(p.delta > 0 ? 'ahead' : 'behind')}` : tr('onTrack')}. ${tr('paceFor')} ${hrs(p.pace ?? 0)} h.`;
  // Nobody scheduled and nothing worked: the cell stays empty.
  if (!p.planned && p.delta == null) return null;
  // Worked (green on track, amber off), Due by now and the Week's plan, as three labelled columns on desk and phone.
  return (
    <Tooltip title={tip} placement="top" disableInteractive>
      <Box data-testid={`hours-${person.id}`} aria-label={tip}
        sx={{ display: 'grid', gridTemplateColumns: HCOLS, columnGap: '4px', alignItems: 'baseline', textAlign: 'right', fontSize: narrow ? 11.5 : 13, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        <Box component="span" data-testid={`so-far-${person.id}`} sx={{ fontWeight: 700, color: p.delta == null ? 'text.disabled' : off ? 'warning.main' : 'success.main' }}>
          {p.delta == null ? '-' : hrs(p.worked ?? 0)}
        </Box>
        <Box component="span" sx={{ color: 'text.secondary' }}>{p.delta == null ? '-' : hrs(p.toDate)}</Box>
        <Box component="span" sx={{ color: 'text.primary' }}>{hrs(p.planned)}</Box>
      </Box>
    </Tooltip>
  );
}

/** Managers: call-ins in the last 30 days, a small red count beside the name; the 30 / 90-day counts on hover. */
function CallInsBadge({ person }: { person: Person }) {
  const counts = person.call_ins;
  if (!counts?.d30) return null;
  const text = `${counts.d30} call-in${counts.d30 === 1 ? '' : 's'} in 30 days (${counts.d90} in 90, ${counts.no_show_90} no-show${counts.no_show_90 === 1 ? '' : 's'})`;
  return (
    <Tooltip title={text}>
      <Box component="span" data-testid={`callins-${person.id}`} aria-label={text}
        sx={{
          flexShrink: 0, minWidth: 16, height: 16, px: '4px', borderRadius: 99, fontSize: 10, fontWeight: 700, lineHeight: '16px',
          textAlign: 'center', color: counts.d30 >= 2 ? 'error.main' : 'text.secondary',
          bgcolor: counts.d30 >= 2 ? tint('error', 0.12) : 'action.selected',
        }}>
        {counts.d30}
      </Box>
    </Tooltip>
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
      <Typography fontWeight={800} noWrap sx={{ fontSize: 14 }}>{section.name || tr('noDept')}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap>{section.people.length}</Typography>
    </Stack>
  );
}

/** The name cell: status dot, name and (managers) the call-in count. */
function NameCell({ g, person, compact = false }: { g: Grid; person: Person; compact?: boolean }) {
  // The phone: first name and last initial ("Carrie R."), so two people with one last name stay apart.
  const parts = person.name.trim().split(/\s+/);
  const name = compact && parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : person.name;
  return (
    <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
      <NowDot state={g.week.now?.[String(person.id)]} />
      <Typography variant="body2" fontWeight={600} noWrap title={person.name} sx={{ fontSize: 13, minWidth: 0 }}><StaffLink userId={person.id}>{name}</StaffLink></Typography>
      <CallInsBadge person={person} />
    </Stack>
  );
}

/** The Worked / plan column: a muted band with its own edges, like a data table column (Bill, 2026-11-05). */
const hoursCol = {
  bgcolor: 'background.paper',
  backgroundImage: (t: Theme) => `linear-gradient(${t.palette.action.hover}, ${t.palette.action.hover})`,
  borderLeft: 1, borderRight: 1, borderLeftColor: 'divider', borderRightColor: 'divider',
} as const;

/** A tint laid over the paper, so a sticky cell stays opaque while the days slide under it. */
const solidTint = (key: 'primary' | 'success', a: number) => ({
  bgcolor: 'background.paper',
  backgroundImage: (t: Theme) => `linear-gradient(${alpha(t.palette[key].main, a)}, ${alpha(t.palette[key].main, a)})`,
});

function WeekCols({ g, dayW }: { g: Grid; dayW: number }) {
  return (
    <colgroup>
      <col style={{ width: NAME_W }} />
      <col style={{ width: HOURS_W }} />
      {g.week.days.map((d) => <col key={d} style={{ width: dayW }} />)}
    </colgroup>
  );
}

/**
 * The day names, once, at the top (Bill, 2026-11-05): they stay in view as the page scrolls down and slide with the
 * days. The arrows here step one day; the week arrows up top land on a Monday.
 */
function DayHeader({ g, dayW, onDay }: { g: Grid; dayW: number; onDay: (step: number) => void }) {
  const { tr, day: dayName } = useCopy();
  return (
    <Box component="table" sx={{ width: NAME_W + HOURS_W + dayW * g.week.days.length, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
      <WeekCols g={g} dayW={dayW} />
      <thead>
        <Box component="tr" sx={{ '& th': { height: 32, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' } }}>
          <Box component="th" sx={{ position: 'sticky', left: 0, zIndex: 2, textAlign: 'left', pl: 0.5 }}>
            <IconButton size="small" aria-label={tr('prevDay')} onClick={() => onDay(-1)} sx={{ p: 0.5 }}><ChevronLeftRounded /></IconButton>
            <IconButton size="small" aria-label={tr('nextDay')} onClick={() => onDay(1)} sx={{ p: 0.5 }}><ChevronRightRounded /></IconButton>
          </Box>
          <Box component="th" sx={{ position: 'sticky', left: NAME_W, zIndex: 2, textAlign: 'right', pr: 1, fontSize: 11, fontWeight: 400, color: 'text.secondary', ...hoursCol }}>
            <Tooltip title={tr('hoursTip')}>
              <Box sx={{ display: 'grid', gridTemplateColumns: HCOLS, textAlign: 'right', fontSize: 11, fontWeight: 600 }}>
                <span>{tr('colWorked')}</span><span>{tr('colDue')}</span><span>{tr('colWeek')}</span>
              </Box>
            </Tooltip>
          </Box>
          {g.week.days.map((d, i) => (
            <Box component="th" key={d} sx={{
              textAlign: 'left', px: 0.75, fontSize: 12, whiteSpace: 'nowrap', borderLeft: 1, borderLeftColor: 'divider',
              fontWeight: 500, color: 'text.secondary',
              ...(isWeekend(d) ? { bgcolor: 'action.hover' } : {}),
              ...todayEdge(g, i),
            }}>
              {i === g.todayIdx ? (
                // Today: the day itself in a green pill.
                <Box component="span" sx={{ px: 0.75, py: '2px', borderRadius: 99, bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 800 }}>
                  {dayName(d, 'EEE d')}
                </Box>
              ) : dayName(d, 'EEE d')}
            </Box>
          ))}
        </Box>
      </thead>
    </Box>
  );
}

/**
 * The desk week (Bill, 2026-11-05: lean): one table for every department, each a shaded title band across the
 * whole width, its people and one coverage line; thin lines between the days.
 */
function WeekTable({ g, sections, collapsed, onToggle, dayW }: {
  g: Grid; sections: Section[]; collapsed: Record<string, boolean>; onToggle: (key: string) => void; dayW: number;
}) {
  const sticky = (left: number, z = 1) => ({ position: 'sticky', left, zIndex: z, bgcolor: 'background.paper' } as const);
  return (
    <Box component="table" sx={{
      width: NAME_W + HOURS_W + dayW * g.week.days.length, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0,
      '& td': { borderBottom: 1, borderColor: 'divider', verticalAlign: 'middle' },
    }}>
      <WeekCols g={g} dayW={dayW} />
      {sections.map((section) => {
        const shut = Boolean(collapsed[section.key]);
        return (
          <tbody key={section.key}>
            <tr data-testid={`section-${section.key}`}>
              <Box component="td" colSpan={2} sx={{ height: 32, px: 1, position: 'sticky', left: 0, zIndex: 6, ...solidTint('primary', 0.08) }}>
                <SectionTitle section={section} collapsed={shut} onToggle={() => onToggle(section.key)} />
              </Box>
              {/* Coverage lives in the band (critic 11-05): the strip, and words only when a day is short. */}
              {g.week.days.map((day, i) => (
                <Box component="td" key={day} sx={{ ...solidTint('primary', 0.08), borderLeft: 1, borderLeftColor: 'divider', ...todayEdge(g, i), px: 0.5, verticalAlign: 'middle' }}>
                  <CoverageCell g={g} section={section} day={day} i={i} />
                </Box>
              ))}
            </tr>
            {shut ? null : section.people.map((person) => (
              <tr key={person.id} data-testid={`schedule-row-${person.id}`}>
                <Box component="td" sx={{ height: ROW, px: 1, overflow: 'hidden', ...sticky(0, 6) }}>
                  <NameCell g={g} person={person} />
                </Box>
                <Box component="td" sx={{ height: ROW, textAlign: 'right', pr: 1, ...sticky(NAME_W, 6), ...hoursCol }}>
                  <HoursText g={g} person={person} />
                </Box>
                {g.week.days.map((d, i) => <DayCell key={d} g={g} person={person} i={i} />)}
              </tr>
            ))}
          </tbody>
        );
      })}
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
            sx={{
              minWidth: 0, px: 0, flexDirection: 'column', lineHeight: 1.2, borderColor: n === g.todayIdx && d !== day ? 'primary.main' : undefined,
              ...(isWeekend(d) && d !== day ? { bgcolor: 'action.hover' } : {}),
            }}>
            <span>{dayName(d, 'EEE')}</span>
            <span>{format(parseISO(d), 'd')}</span>
          </Button>
        ))}
      </Box>
      {/* The hour marks and the hours label once, above every department. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '100px 1fr 94px', columnGap: 1, px: 1, mb: 0.5 }}>
        <span />
        <HourTicks span={g.span} every={2} />
        <Box sx={{ display: 'grid', gridTemplateColumns: HCOLS, columnGap: '4px', textAlign: 'right', fontSize: 10, lineHeight: '16px', color: 'text.secondary' }}>
          <span>{tr('colWorked')}</span><span>{tr('colDue')}</span><span>{tr('colWeek')}</span>
        </Box>
      </Box>
      {sections.map((section) => {
        const shut = Boolean(collapsed[section.key]);
        return (
          <Box key={section.key} data-testid={`section-${section.key}`}
            sx={{ mb: 1.5, border: 1, borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper', overflow: 'hidden' }}>
            {/* The department's band, as on a desk: its name, then its coverage that day. */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, height: 36, px: 1, ...solidTint('primary', 0.08) }}>
              <Box sx={{ flexShrink: 0 }}><SectionTitle section={section} collapsed={shut} onToggle={() => onToggle(section.key)} /></Box>
              <Box sx={{ flex: 1, minWidth: 0 }}><CoverageCell g={g} section={section} day={day} i={i} wide /></Box>
            </Box>
            {shut ? null : (
              <>
                {section.people.map((person) => {
                  const shifts = g.byCell.get(`${person.id}:${day}`) ?? [];
                  const calls = g.callIns.get(`${person.id}:${day}`) ?? [];
                  const asked = g.requests.get(`${person.id}:${day}`);
                  const tap = tapFor(g, person, day, shifts);
                  return (
                    <Box key={person.id} data-testid={`schedule-card-${person.id}`} onClick={tap}
                      sx={{ display: 'grid', gridTemplateColumns: '100px 1fr 94px', alignItems: 'center', columnGap: 1, height: ROW, px: 1, borderTop: 1, borderColor: 'divider', cursor: tap ? 'pointer' : 'default', position: 'relative' }}>
                      {asked ? <RequestMark requests={asked} /> : null}
                      <Box sx={{ minWidth: 0, pr: 0.5 }}><NameCell g={g} person={person} compact /></Box>
                      <Box sx={{ minWidth: 0 }}>
                        {shifts.length || g.actual.get(`${person.id}:${day}`)?.length
                          ? <DayTrack g={g} person={person} day={day} shifts={shifts} />
                          : calls.length ? <CallInChip calls={calls} shift={undefined} /> : null}
                      </Box>
                      <Box sx={{ textAlign: 'right' }}><HoursText g={g} person={person} narrow /></Box>
                    </Box>
                  );
                })}
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/** The word a manager types before a week is cleared. */
const CLEAR_WORD = 'clear';

/** Clear week (Dash Updates #74): says what goes and what stays, and clears only once the word is typed. */
function ClearWeekDialog({ start, count, onClose, onCleared }: { start: string; count: number; onClose: () => void; onCleared: () => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = typed.trim().toLowerCase() === CLEAR_WORD;
  const clear = async () => {
    setBusy(true);
    try {
      const { data } = await clearScheduleWeek(start);
      enqueueSnackbar(`${data.cleared} shift${data.cleared === 1 ? '' : 's'} cleared from ${weekLabel(start)}`, { variant: 'success' });
      onCleared();
      onClose();
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not clear the week'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Clear {weekLabel(start)}?</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          This removes all {count} shift{count === 1 ? '' : 's'} on the week. Call-ins, requests and clock times stay.
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Type <Box component="b" sx={{ fontWeight: 800 }}>{CLEAR_WORD}</Box> to confirm.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder={CLEAR_WORD}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ready && !busy) clear(); }}
          inputProps={{ 'data-testid': 'clear-week-confirm', autoComplete: 'off' }}
        />
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={!ready || busy} onClick={clear}>Clear week</Button>
      </DialogActions>
    </Dialog>
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

/** Two weeks side by side, so the days scroll on into next week (Bill, 2026-11-05). A next week that is not the
 * week after (or not loaded yet) is left off. */
function mergeWeeks(a: ScheduleWeek, b: ScheduleWeek | undefined): ScheduleWeek {
  if (!b || b.start !== fmt(addDays(parseISO(a.start), 7))) return a;
  const known = new Set(a.people.map((p) => p.id));
  const ids = new Set((a.requests ?? []).map((r) => r.id));
  return {
    ...a,
    end: b.end,
    days: [...a.days, ...b.days],
    store_hours: [...(a.store_hours ?? []), ...(b.store_hours ?? [])],
    people: [...a.people, ...b.people.filter((p) => !known.has(p.id))],
    shifts: [...a.shifts, ...b.shifts],
    call_ins: [...a.call_ins, ...b.call_ins],
    actual: [...(a.actual ?? []), ...(b.actual ?? [])],
    requests: [...(a.requests ?? []), ...(b.requests ?? []).filter((r) => !ids.has(r.id))],
    now: { ...(b.now ?? {}), ...(a.now ?? {}) },
  };
}

type Pending = Map<number, { start_time: string; end_time: string }>;

/** Everything the rows need, for the days shown; hours come from `paceWeek` (the week the header names). */
function buildGrid(week: ScheduleWeek, paceWeek: ScheduleWeek, o: {
  canEdit: boolean; today: string; nowMinutes: number; meId?: number; pending: Pending;
  onPick: (target: Target) => void; onTimes: Grid['onTimes']; onAsk: (a: AskStart) => void;
}): Grid {
  const group = <T,>(rows: T[], key: (r: T) => string) => {
    const map = new Map<string, T[]>();
    for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
    return map;
  };
  // A waiting request sits on each of its days shown.
  const asked = new Map<string, ScheduleRequest[]>();
  for (const r of week.requests ?? []) {
    if (r.status !== 'pending') continue;
    for (const d of week.days) {
      if (d >= r.date && d <= r.end_date) asked.set(`${r.employee}:${d}`, [...(asked.get(`${r.employee}:${d}`) ?? []), r]);
    }
  }
  return {
    week,
    weekDays: paceWeek.days,
    byCell: group(week.shifts, (s) => `${s.employee}:${s.date}`),
    requests: asked,
    callIns: group(week.call_ins, (c) => `${c.employee}:${c.shift_date}`),
    actual: group(week.actual ?? [], (t) => `${t.employee}:${t.date}`),
    onPick: o.canEdit ? o.onPick : null,
    onTimes: o.canEdit ? o.onTimes : null,
    onAsk: o.canEdit ? null : (person, d, shift) => {
      if (person.id === o.meId) o.onAsk({ date: d, start_time: shift?.start_time, end_time: shift?.end_time });
    },
    todayIdx: week.days.indexOf(o.today),
    today: o.today,
    nowMinutes: o.nowMinutes,
    pending: o.pending,
    // Hours count unsaved times too, so a manager sees what Save will do.
    pace: new Map(paceWeek.people.map((p) => [p.id, hoursPace(
      paceWeek.shifts.filter((s) => s.employee === p.id).map((s) => {
        const edit = o.pending.get(s.id);
        return edit ? { ...s, ...edit, hours: (endMinutes(edit) - minutes(edit.start_time)) / 60 } : s;
      }),
      p.actual_hours, o.today, o.nowMinutes,
    )])),
    // Store hours widened to the shifts only, so the bars get the room; a clock line outside them is cut at the edge.
    span: timelineWindow(week.store_hours ?? [], week.shifts),
  };
}

/** Unsaved drags: a bar at the bottom says how many, and nothing is saved until Save (Bill, 2026-11-05). */
function SaveBar({ count, busy, onSave, onCancel }: { count: number; busy: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <Box data-testid="save-bar" sx={{
      position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 1200,
      display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1, borderRadius: '12px',
      bgcolor: 'background.paper', border: 2, borderColor: 'warning.main', boxShadow: 6,
    }}>
      <Typography variant="body2" fontWeight={700} sx={{ color: 'warning.dark', whiteSpace: 'nowrap' }}>
        {count} change{count === 1 ? '' : 's'} not saved
      </Typography>
      <Button size="small" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button size="small" variant="contained" color="warning" disabled={busy} onClick={onSave}>Save</Button>
    </Box>
  );
}

export default function SchedulePage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const wide = useMediaQuery(useTheme().breakpoints.up('md'));
  const thisMonday = fmt(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [start, setStart] = useState(thisMonday);
  const next = fmt(addDays(parseISO(start), 7));
  const [target, setTarget] = useState<Target | null>(null);
  const [phoneDay, setPhoneDay] = useState<string | null>(null);
  const [ask, setAsk] = useState<AskStart | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [tools, setTools] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(readCollapsed);
  const [pending, setPending] = useState<Pending>(() => new Map());
  const [saving, setSaving] = useState(false);
  // 1 once the days are scrolled past next Monday: the header, hours and week buttons follow that week.
  const [shownIdx, setShownIdx] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  // Every minute, so "right now" stays right (react-query pauses it while the tab is hidden).
  const query = useQuery({
    queryKey: ['scheduleWeek', start],
    queryFn: async () => (await getScheduleWeek(start)).data,
    refetchInterval: 60_000,
  });
  const nextQuery = useQuery({
    queryKey: ['scheduleWeek', next],
    queryFn: async () => (await getScheduleWeek(next)).data,
    refetchInterval: 60_000,
    enabled: wide,
  });
  const weekA = query.data;
  const weekB = nextQuery.data;
  const merged = useMemo(() => (weekA ? (wide ? mergeWeeks(weekA, weekB) : weekA) : undefined), [weekA, weekB, wide]);
  const twoWeeks = Boolean(merged && weekA && merged.days.length > weekA.days.length);
  const shown = shownIdx && twoWeeks ? weekB : weekA;
  const shownStart = shownIdx && twoWeeks ? next : start;
  const canEdit = Boolean(weekA?.can_edit);
  const { tr } = useCopy();
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

  const hasGrid = Boolean(merged);
  // Days get room to breathe (Bill 11-05: "busy, smooshed"): about five in view, 150-220 px; the rest slide in.
  const [dayW, setDayW] = useState(DAY_W);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const fit = () => {
      const room = el.clientWidth - NAME_W - HOURS_W;
      // A narrow window keeps at least three days in view (critic 11-05), down to 120 px each.
      const min = room < 600 ? 120 : DAY_MIN;
      setDayW(room > 0 ? Math.max(min, Math.min(DAY_W, Math.floor(room / (room < 600 ? 3.5 : 5)))) : DAY_W);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide, hasGrid]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    // The day we are heading to, counted from day edges (never from wherever a smooth scroll has got to), so a tick
    // can neither skip a day nor be lost while the strip is still moving.
    let target: number | null = null;
    let sum = 0;
    let lastTick = 0;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const maxDay = () => Math.round((el.scrollWidth - el.clientWidth) / dayW);
    // The normal mouse wheel moves the days (Bill, 2026-11-05: up and down over the days slides them; a sideways
    // swipe does too). Over the names and hours, or past the first or last day, the page scrolls as usual.
    const onWheel = (e: WheelEvent) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!dx) return;
      if (e.clientX < el.getBoundingClientRect().left + NAME_W + HOURS_W) return; // over the names: the page scrolls
      const from = target ?? Math.round(el.scrollLeft / dayW);
      const to = Math.max(0, Math.min(maxDay(), from + Math.sign(dx)));
      if (to === from && target == null) return; // at the first or last day: let the page scroll
      e.preventDefault();
      const nowMs = Date.now();
      if (nowMs - lastTick > 300) sum = 0; // a new gesture
      sum += dx;
      // A mouse notch (about 100 px) is one day at once; a trackpad's small steps add up to one day, then wait.
      if (Math.abs(sum) < 40 || nowMs - lastTick < 120) return;
      target = to;
      sum = 0;
      lastTick = nowMs;
      el.scrollTo({ left: target * dayW, behavior: 'smooth' });
      clearTimeout(settle);
      settle = setTimeout(() => { target = null; }, 500);
    };
    const head = header.current;
    el.addEventListener('wheel', onWheel, { passive: false });
    head?.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); head?.removeEventListener('wheel', onWheel); clearTimeout(settle); };
  }, [wide, hasGrid, dayW]);
  // Unsaved changes: the browser asks before the page is left.
  useEffect(() => {
    if (!pending.size) return undefined;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending.size]);

  // Drag a bar's end: the new times wait, orange, until Save; dragging back to the saved times drops the change.
  const onTimes = async (shift: ScheduledShift, s: number, e: number) => {
    const times = { start_time: toHHMM(s), end_time: toHHMM(e) };
    setPending((prev) => {
      const out = new Map(prev);
      if (times.start_time === shift.start_time && times.end_time === shift.end_time) out.delete(shift.id);
      else out.set(shift.id, times);
      return out;
    });
  };
  const saveAll = async () => {
    setSaving(true);
    const rows = [...pending.entries()];
    const results = await Promise.allSettled(rows.map(([id, t]) => updateScheduledShift(id, t)));
    const failed = rows.filter((_r, n) => results[n].status === 'rejected');
    setPending(new Map(failed));
    await refresh();
    setSaving(false);
    if (failed.length) {
      const first = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      enqueueSnackbar(errorText(first.reason, `Could not save ${failed.length} change${failed.length === 1 ? '' : 's'}`), { variant: 'error' });
    } else {
      enqueueSnackbar(`${rows.length} change${rows.length === 1 ? '' : 's'} saved`, { variant: 'success' });
    }
  };
  // A tap opens the shift with its unsaved times; saving there settles that change.
  const pick = (t: Target) => {
    const edit = t.shift ? pending.get(t.shift.id) : undefined;
    setTarget(edit && t.shift ? { ...t, shift: { ...t.shift, ...edit } } : t);
  };
  const dialogSaved = () => {
    const id = target?.shift?.id;
    if (id != null) setPending((prev) => { const out = new Map(prev); out.delete(id); return out; });
    return refresh();
  };

  const grid = useMemo<Grid | null>(
    () => (merged && shown ? buildGrid(merged, shown, { canEdit, today, nowMinutes, meId, pending, onPick: pick, onTimes, onAsk: setAsk }) : null),
    // pick and onTimes are rebuilt each render; the data, the edits and the clock drive it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [merged, shown, canEdit, today, meId, pending, Math.floor(nowMinutes / 5)],
  );
  const sections = useMemo(() => groupSections(merged?.people ?? [], canEdit ? undefined : meId), [merged, canEdit, meId]);
  const day = phoneDay && weekA?.days.includes(phoneDay) ? phoneDay : weekA?.days.includes(today) ? today : weekA?.days[0] ?? '';

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (header.current) header.current.scrollLeft = el.scrollLeft;
    const idx = twoWeeks && el.scrollLeft >= 7 * dayW - dayW / 2 ? 1 : 0;
    if (idx !== shownIdx) setShownIdx(idx);
  };
  // The day arrows: one day earlier or later, on a day edge.
  const stepDay = (step: number) => {
    const el = scroller.current;
    if (!el) return;
    const last = Math.round((el.scrollWidth - el.clientWidth) / dayW);
    const to = Math.max(0, Math.min(last, Math.round(el.scrollLeft / dayW) + step));
    el.scrollTo({ left: to * dayW, behavior: 'smooth' });
  };
  const toggle = (key: string) => setCollapsed((prev) => {
    const nextState = { ...prev, [key]: !prev[key] };
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(nextState));
    } catch {
      // A private window: it just won't be remembered.
    }
    return nextState;
  });
  // The week buttons always land on a Monday, at the left edge.
  const go = (monday: string) => {
    setStart(monday);
    if (scroller.current) scroller.current.scrollLeft = 0;
    if (header.current) header.current.scrollLeft = 0;
    setShownIdx(0);
  };
  const move = (days: number) => go(fmt(addDays(parseISO(shownStart), days)));
  const [todayPending, setTodayPending] = useState(false);
  const showToday = () => {
    if (start !== thisMonday) go(thisMonday);
    setTodayPending(true);
  };
  // Once this week is showing, slide today to the left edge.
  useEffect(() => {
    if (!todayPending || start !== thisMonday || !weekA) return;
    const el = scroller.current;
    const idx = weekA.days.indexOf(today);
    if (el && idx >= 0) el.scrollTo({ left: idx * dayW, behavior: 'smooth' });
    setTodayPending(false);
  }, [todayPending, start, thisMonday, weekA, today, dayW]);
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
    <Box sx={{ pb: pending.size ? 10 : 4, minWidth: 0 }} data-testid="schedule-page">
      <Stack direction="row" alignItems="center" sx={{ mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight={800} sx={{ fontSize: { xs: 20, md: 24 } }}>{tr('schedule')}</Typography>
        <Tooltip title={tr('info')} enterTouchDelay={0} leaveTouchDelay={8000}>
          <IconButton size="small" aria-label={tr('info')} sx={{ color: 'text.secondary' }}><InfoOutlined fontSize="small" /></IconButton>
        </Tooltip>
        <Stack direction="row" alignItems="center" sx={{ border: 1, borderColor: 'divider', borderRadius: '10px', bgcolor: 'background.paper', ml: { md: 1 } }}>
          <IconButton aria-label={tr('prevWeek')} onClick={() => move(-7)}><ChevronLeftRounded /></IconButton>
          <Typography fontWeight={800} sx={{ minWidth: 112, textAlign: 'center', fontSize: 16 }} data-testid="schedule-week-label">{weekLabel(shownStart)}</Typography>
          <IconButton aria-label={tr('nextWeek')} onClick={() => move(7)}><ChevronRightRounded /></IconButton>
        </Stack>
        <Button variant="contained" size="small" disabled={shownStart === thisMonday} onClick={() => go(thisMonday)}>
          {tr('thisWeek')}
        </Button>
        {wide ? (
          // Today at the far left, so who works today reads first.
          <Button variant="outlined" size="small" onClick={showToday}>{tr('today')}</Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        {weekA ? (
          <Button size="small" variant={canEdit && waiting.data?.length ? 'contained' : 'outlined'} color={canEdit && waiting.data?.length ? 'info' : 'primary'}
            data-testid="requests-button" onClick={() => setShowRequests(true)}>
            {canEdit ? `${rt('requests')}${waiting.data?.length ? ` (${waiting.data.length})` : ''}` : rt('myRequests')}
          </Button>
        ) : null}
        {canEdit && !wide ? (
          // The phone folds the week tools into one button, so the people start near the top of the screen.
          <>
            <Button size="small" variant="outlined" color="inherit" sx={{ color: 'text.secondary', borderColor: 'divider' }}
              aria-haspopup="menu" onClick={(e) => setTools(e.currentTarget)}>
              {tr('weekTools')}
            </Button>
            <Menu anchorEl={tools} open={Boolean(tools)} onClose={() => setTools(null)}>
              <MenuItem onClick={() => { setTools(null); quick(() => copyScheduleWeek(fmt(addDays(parseISO(shownStart), -7)), shownStart), 'last week'); }}>Copy last week</MenuItem>
              <MenuItem onClick={() => { setTools(null); quick(() => fillScheduleFromUsual(shownStart), 'usual shifts'); }}>Fill from usual shifts</MenuItem>
              <MenuItem disabled={!shown?.shifts.length} onClick={() => { setTools(null); setClearing(true); }} sx={{ color: 'error.main' }}>Clear week</MenuItem>
            </Menu>
          </>
        ) : null}
        {canEdit && wide ? (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, '& .MuiButton-root': { whiteSpace: 'nowrap' } }}>
            <Button size="small" color="inherit" sx={{ color: 'text.secondary' }} onClick={() => quick(() => copyScheduleWeek(fmt(addDays(parseISO(shownStart), -7)), shownStart), 'last week')}>
              Copy last week
            </Button>
            <Button size="small" color="inherit" sx={{ color: 'text.secondary' }} onClick={() => quick(() => fillScheduleFromUsual(shownStart), 'usual shifts')}>
              Fill from usual shifts
            </Button>
            <Button size="small" color="error" disabled={!shown?.shifts.length} onClick={() => setClearing(true)} sx={{ ml: { md: 1.5 } }}>
              Clear week
            </Button>
          </Stack>
        ) : null}
      </Stack>
      {query.isError ? <Alert severity="error">{tr('couldNotLoad')}</Alert> : null}

      {grid && !wide ? (
        <PhoneDay g={grid} sections={sections} day={day} onDay={setPhoneDay} collapsed={collapsed} onToggle={toggle} />
      ) : null}
      {grid && wide ? (
        // No scrollbars and no box of its own (Bill, 2026-11-05): the page scrolls up and down as usual; the days slide
        // sideways with a swipe, shift + wheel or the day arrows, the names and hours holding still. The day names stay
        // at the top of the page and slide with them.
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '12px', bgcolor: 'background.paper' }}>
          {/* Flush with the top of the page's scroll area (it has 24 px of padding), so no row slides past above it. */}
          <Box sx={{ position: 'sticky', top: -24, zIndex: 10 }}>
          <Box ref={header} sx={{ overflow: 'hidden', bgcolor: 'background.paper', borderRadius: '12px 12px 0 0' }}>
            <DayHeader g={grid} dayW={dayW} onDay={stepDay} />
          </Box>
          </Box>
          <Box ref={scroller} onScroll={onScroll} data-testid="schedule-scroll"
            sx={{
              overflowX: 'auto', overflowY: 'hidden', scrollSnapType: 'x mandatory', scrollPaddingLeft: `${NAME_W + HOURS_W}px`,
              scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, borderRadius: '0 0 12px 12px',
            }}>
            <WeekTable g={grid} sections={sections} collapsed={collapsed} onToggle={toggle} dayW={dayW} />
          </Box>
        </Box>
      ) : null}

      {pending.size ? <SaveBar count={pending.size} busy={saving} onSave={saveAll} onCancel={() => setPending(new Map())} /> : null}
      {target && grid ? (
        <ShiftDialog
          key={`${target.person.id}-${target.day}-${target.shift?.id ?? 'new'}`}
          target={target}
          span={grid.span}
          store={grid.week.store_hours?.[grid.week.days.indexOf(target.day)]}
          actuals={grid.actual.get(`${target.person.id}:${target.day}`) ?? []}
          requests={grid.requests.get(`${target.person.id}:${target.day}`) ?? []}
          onClose={() => setTarget(null)}
          onSaved={dialogSaved}
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
      {clearing && shown ? (
        <ClearWeekDialog start={shown.start} count={shown.shifts.length} onClose={() => setClearing(false)} onCleared={refresh} />
      ) : null}
      {ask ? <AskDialog initial={ask} today={today} onClose={() => setAsk(null)} onSent={refresh} /> : null}
    </Box>
  );
}
