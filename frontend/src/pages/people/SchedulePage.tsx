/**
 * Schedule (owner 2026-10-21): managers build each week, one row per person, one column per day. Retail keeps fixed
 * shifts; every other department flexes (leave early on a slow day, come in or stay late on a busy one), so its times
 * are the plan. A shift opens to change it, remove it, or record a call-in; an empty day opens to add a shift or record
 * a call-in. Call-ins are counted per person over the last 30 and 90 days.
 * Everyone sees the week (Dash Updates #6, 2026-11-02), read-only, with each person's state right now from the time
 * clock (on shift, on break, late, off); call-ins, their counts and shift notes stay the managers'. English and Spanish.
 * At a glance (Bill, Dash Updates #55, 2026-11-03): a section per department, Retail first. Retail draws each shift as
 * a bar on the store-hours timeline with a floor coverage row under it; flexible departments say each person's usual
 * week once and only draw the days that differ. Today's column is tinted, a call-in replaces its shift, every row is
 * one fixed height, and each section scrolls sideways on its own on a phone.
 */
import { useMemo, useState, type ReactNode } from 'react';
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
  getScheduleWeek,
  recordCallIn,
  updateScheduledShift,
  type CallIn,
  type NowState,
  type ScheduleWeek,
  type ScheduledShift,
} from '../../api/schedule.api';
import {
  coverage,
  dayKind,
  groupSections,
  minutes,
  range,
  short,
  summarize,
  timelineWindow,
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
  coverage: { en: 'Floor coverage', es: 'Personal en piso' },
  closed: { en: 'Closed', es: 'Cerrado' },
  gap: { en: 'Gap', es: 'Sin nadie' },
  single: { en: '1 only', es: 'Solo 1' },
  covered: { en: 'covered', es: 'cubierto' },
  noDept: { en: 'No department', es: 'Sin departamento' },
  people: { en: 'people', es: 'personas' },
  show: { en: 'Show', es: 'Mostrar' },
  hide: { en: 'Hide', es: 'Ocultar' },
  info: {
    en: 'Retail shifts are fixed times, drawn as bars from open to close; the row under Retail counts people on the floor (red = nobody, amber = one person). Other departments flex: the times are the plan, their usual week is under each name, and only days that differ show.',
    es: 'Los turnos de Retail son horas fijas, dibujadas como barras de apertura a cierre; la fila bajo Retail cuenta a las personas en piso (rojo = nadie, ámbar = una persona). Los demás departamentos son flexibles: las horas son el plan, su semana habitual está bajo cada nombre y solo se muestran los días distintos.',
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
const NAME_W = { xs: 150, md: 210 };
const HOURS_W = 48;
const CALLS_W = 132;
const NARROW_DAY = 44;

const tint = (key: 'success' | 'warning' | 'error' | 'primary', a: number) => (t: Theme) => alpha(t.palette[key].main, a);

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

export function weekLabel(start: string): string {
  const a = parseISO(start);
  const b = addDays(a, 6);
  return a.getMonth() === b.getMonth() ? `${format(a, 'MMM d')}-${format(b, 'd')}` : `${format(a, 'MMM d')}-${format(b, 'MMM d')}`;
}

function errorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : fallback;
}

type Target = { person: ScheduleWeek['people'][number]; day: string; shift: ScheduledShift | null };

function ShiftDialog({ target, onClose, onSaved }: { target: Target | null; onClose: () => void; onSaved: () => void }) {
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
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {target.person.name} · {format(parseISO(target.day), 'EEE MMM d')}
      </DialogTitle>
      <DialogContent>
        {!callIn ? (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Department</InputLabel>
              <Select label="Department" value={dept} onChange={(e) => setDept(String(e.target.value) === '' ? '' : Number(e.target.value))}>
                <MenuItem value="">None</MenuItem>
                {(departments.data ?? []).map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
              </Select>
            </FormControl>
            <Stack direction="row" spacing={1.5}>
              <TextField label="Start" type="time" size="small" value={start} onChange={(e) => setStart(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
              <TextField label="End" type="time" size="small" value={end} onChange={(e) => setEnd(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
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
  /** Null when the reader cannot change the week. */
  onPick: ((target: Target) => void) | null;
  todayIdx: number;
  /** Closed days nobody works: a narrow column. */
  narrow: boolean[];
  /** The Retail timeline, minutes after midnight, the same for every day. */
  span: [number, number];
  weekBuilt: boolean;
  dayNames: string[];
}

const cellSx = (g: Grid, i: number) => ({
  height: ROW,
  px: g.narrow[i] ? 0.25 : 0.5,
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

/** Retail: each shift a bar on the day's timeline; the store's open hours are the shaded track. */
function Track({ g, i, shifts, onBar }: { g: Grid; i: number; shifts: ScheduledShift[]; onBar: (s: ScheduledShift) => void }) {
  const [a, b] = g.span;
  const pos = (m: number) => `${((Math.min(Math.max(m, a), b) - a) / (b - a)) * 100}%`;
  const hours = g.week.store_hours?.[i];
  return (
    <Box sx={{ position: 'relative', height: 22 }}>
      {hours?.open ? (
        <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: pos(minutes(hours.start)), right: `calc(100% - ${pos(minutes(hours.end))})`, bgcolor: 'action.hover', borderRadius: '4px' }} />
      ) : null}
      {shifts.map((s) => {
        const from = minutes(s.start_time);
        let to = minutes(s.end_time);
        if (to <= from) to = b;
        return (
          <Box
            key={s.id}
            data-testid={`bar-${s.id}`}
            title={`${s.text}${s.department_name ? ` ${s.department_name}` : ''}${s.note ? ` · ${s.note}` : ''}`}
            onClick={g.onPick ? (e) => { e.stopPropagation(); onBar(s); } : undefined}
            sx={{
              position: 'absolute', top: 0, bottom: 0, left: pos(from), right: `calc(100% - ${pos(to)})`,
              bgcolor: s.flexible ? tint('primary', 0.1) : tint('success', 0.22),
              borderLeft: 3, borderColor: s.flexible ? 'primary.main' : 'success.main', borderRadius: '4px',
              fontSize: 11, lineHeight: '22px', px: 0.5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'clip',
            }}
          >
            {range(s.start_time, s.end_time)}
          </Box>
        );
      })}
    </Box>
  );
}

function DayCell({ g, person, i, fixed }: { g: Grid; person: Person; i: number; fixed: boolean }) {
  const { tr } = useCopy();
  const day = g.week.days[i];
  const shifts = g.byCell.get(`${person.id}:${day}`) ?? [];
  const calls = g.callIns.get(`${person.id}:${day}`) ?? [];
  const pick = (shift: ScheduledShift | null) => g.onPick?.({ person, day, shift });
  let body: ReactNode = null;
  if (calls.length) {
    body = <CallInChip calls={calls} shift={shifts[0]} />;
  } else if (fixed) {
    body = shifts.length ? <Track g={g} i={i} shifts={shifts} onBar={pick} /> : null;
  } else {
    const kind = dayKind(person.usual ?? [], i, shifts, calls, g.weekBuilt);
    if (kind === 'off') {
      body = (
        <Box component="span" title={tr('dayOff')} sx={{ ...chipSx, borderStyle: 'dashed', borderColor: 'divider', color: 'text.secondary', display: 'inline-block' }}>
          {tr('off')}
        </Box>
      );
    } else if (kind === 'extra' || kind === 'changed') {
      const s = shifts[0];
      body = (
        <Box
          component="span"
          title={`${tr(kind)}: ${shifts.map((x) => `${x.text}${x.department_name ? ` ${x.department_name}` : ''}`).join(', ')}`}
          sx={{ ...chipSx, display: 'inline-block', borderColor: kind === 'extra' ? 'primary.main' : 'divider', color: 'text.primary' }}
        >
          {kind === 'extra' ? '+ ' : ''}{range(s.start_time, s.end_time)}{shifts.length > 1 ? ` +${shifts.length - 1}` : ''}
        </Box>
      );
    }
  }
  const note = shifts.find((s) => s.note)?.note;
  return (
    <Box component="td" data-testid={`cell-${person.id}-${day}`} onClick={g.onPick ? () => pick(shifts[0] ?? null) : undefined}
      sx={{ ...cellSx(g, i), position: 'relative' }}>
      {body}
      {note && !calls.length ? <NoteMark note={note} /> : null}
    </Box>
  );
}

/** The row under Retail: people on the floor through the open hours; red where nobody is, amber where one is. */
function CoverageRow({ g, canEdit }: { g: Grid; canEdit: boolean }) {
  const { tr } = useCopy();
  const [a, b] = g.span;
  const pos = (m: number) => `${((Math.min(Math.max(m, a), b) - a) / (b - a)) * 100}%`;
  return (
    <tr data-testid="coverage-row">
      <Box component="td" sx={{ height: ROW, position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', px: 1 }}>
        <Typography variant="body2" color="text.secondary" noWrap>{tr('coverage')}</Typography>
      </Box>
      <td />
      {g.week.days.map((day, i) => {
        const hours = g.week.store_hours?.[i];
        if (!hours?.open) {
          return (
            <Box component="td" key={day} sx={{ ...cellSx(g, i), cursor: 'default', '&:hover': undefined }}>
              {g.narrow[i] ? null : <Typography variant="caption" color="text.disabled">{tr('closed')}</Typography>}
            </Box>
          );
        }
        // Who is on the floor: fixed shifts that day, minus anyone who called in. Anyone working Retail counts.
        const floor = g.week.shifts.filter((s) => s.date === day && !s.flexible && !(g.callIns.get(`${s.employee}:${day}`)?.length));
        const segs = coverage(floor, hours.start, hours.end);
        const sum = summarize(segs);
        const first = sum.gaps[0] ?? sum.singles[0];
        const more = (sum.gaps.length ? sum.gaps.length : sum.singles.length) - 1;
        const low = segs.reduce((m, s) => Math.min(m, s.count), Infinity);
        const text = sum.gaps.length
          ? `${tr('gap')} ${short(first.from)}-${short(first.to)}`
          : sum.singles.length ? `${tr('single')} ${short(first.from)}-${short(first.to)}` : `${low}+ ${tr('covered')}`;
        const color = sum.gaps.length ? 'error.main' : sum.singles.length ? 'warning.main' : 'success.main';
        return (
          <Box component="td" key={day} data-testid={`coverage-${day}`} sx={{ ...cellSx(g, i), cursor: 'default', '&:hover': undefined }}
            title={segs.map((s) => `${short(s.from)}-${short(s.to)}: ${s.count}`).join(' · ')}>
            <Box sx={{ position: 'relative', height: 8, mt: 0.5 }}>
              {segs.map((s) => (
                <Box key={s.from} sx={{
                  position: 'absolute', top: 0, bottom: 0, left: pos(s.from), right: `calc(100% - ${pos(s.to)})`,
                  bgcolor: s.count === 0 ? tint('error', 0.55) : s.count === 1 ? tint('warning', 0.5) : tint('success', 0.35),
                }} />
              ))}
            </Box>
            {g.narrow[i] ? null : (
              <Typography component="div" noWrap sx={{ fontSize: 11, lineHeight: '18px', mt: 0.25, color }}>
                {text}{more > 0 ? ` +${more}` : ''}
              </Typography>
            )}
          </Box>
        );
      })}
      {canEdit ? <td /> : null}
    </tr>
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

function SectionTable({ g, section, canEdit, collapsed, onToggle }: {
  g: Grid; section: Section; canEdit: boolean; collapsed: boolean; onToggle: () => void;
}) {
  const { tr, day: dayName } = useCopy();
  const { fixed } = section;
  // A phone opens each section at today, not Monday; once per week shown, so a refetch never moves it.
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
        width: '100%', minWidth: { xs: canEdit ? 900 : 760, md: canEdit ? 900 : 780 }, tableLayout: 'fixed', borderCollapse: 'collapse',
        '& td, & th': { borderTop: 1, borderColor: 'divider', verticalAlign: 'middle' },
        '& thead th': { borderTop: 0 },
      }}>
        <colgroup>
          <Box component="col" sx={{ width: NAME_W }} />
          <col style={{ width: HOURS_W }} />
          {g.week.days.map((d, i) => <col key={d} style={g.narrow[i] ? { width: NARROW_DAY } : undefined} />)}
          {canEdit ? <col style={{ width: CALLS_W }} /> : null}
        </colgroup>
        <thead>
          <tr>
            <Box component="th" sx={{ height: 40, textAlign: 'left', px: 1, position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper' }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                {fixed ? null : (
                  <IconButton size="small" aria-label={`${collapsed ? tr('show') : tr('hide')} ${section.name}`} aria-expanded={!collapsed} onClick={onToggle} sx={{ ml: -0.5, p: 0.25 }}>
                    <ExpandMoreRounded fontSize="small" sx={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} />
                  </IconButton>
                )}
                <Typography fontWeight={800} noWrap>{section.name || tr('noDept')}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>{section.people.length}</Typography>
              </Stack>
            </Box>
            <Box component="th" sx={{ textAlign: 'right', pr: 1, fontSize: 12, fontWeight: 400, color: 'text.secondary' }}>{tr('hours')}</Box>
            {g.week.days.map((d, i) => (
              <Box component="th" key={d} sx={{
                textAlign: 'left', px: g.narrow[i] ? 0.25 : 0.75, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden',
                fontWeight: i === g.todayIdx ? 800 : 400, color: i === g.todayIdx ? 'primary.main' : 'text.secondary',
                bgcolor: i === g.todayIdx ? tint('primary', 0.07) : undefined,
              }}>
                {g.narrow[i] ? dayName(d, 'EEEEEE') : dayName(d, 'EEE d')}
              </Box>
            ))}
            {canEdit ? (
              <Box component="th" sx={{ textAlign: 'right', pr: 1, fontSize: 12, fontWeight: 400, color: 'text.secondary' }}>Call-ins</Box>
            ) : null}
          </tr>
        </thead>
        {collapsed ? null : (
          <tbody>
            {section.people.map((person) => {
              const usual = fixed ? '' : usualText(person.usual ?? [], g.dayNames);
              return (
                <tr key={person.id} data-testid={`schedule-row-${person.id}`}>
                  <Box component="td" sx={{ height: ROW, px: 1, position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', overflow: 'hidden' }}>
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
                  </Box>
                  <Box component="td" sx={{ height: ROW, textAlign: 'right', pr: 1, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                    {person.hours || '-'}
                  </Box>
                  {g.week.days.map((d, i) => <DayCell key={d} g={g} person={person} i={i} fixed={fixed} />)}
                  {canEdit ? <CallInsCell g={g} person={person} /> : null}
                </tr>
              );
            })}
            {fixed ? <CoverageRow g={g} canEdit={canEdit} /> : null}
          </tbody>
        )}
      </Box>
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
  const thisMonday = fmt(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [start, setStart] = useState(thisMonday);
  const [target, setTarget] = useState<Target | null>(null);
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
  const meId = useMeId();
  const today = fmt(new Date());
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['scheduleWeek'] });

  const grid = useMemo<Grid | null>(() => {
    if (!week) return null;
    const byCell = new Map<string, ScheduledShift[]>();
    for (const s of week.shifts) {
      const key = `${s.employee}:${s.date}`;
      byCell.set(key, [...(byCell.get(key) ?? []), s]);
    }
    const callIns = new Map<string, CallIn[]>();
    for (const c of week.call_ins) {
      const key = `${c.employee}:${c.shift_date}`;
      callIns.set(key, [...(callIns.get(key) ?? []), c]);
    }
    const weekBuilt = week.shifts.length > 0;
    // A closed day nobody works (Sunday) is a narrow column; an open day keeps its width so its gap shows.
    const narrow = week.days.map((d, i) => week.store_hours?.[i]?.open === false
      && !week.shifts.some((s) => s.date === d) && !week.call_ins.some((c) => c.shift_date === d));
    return {
      week, byCell, callIns, weekBuilt, narrow, dayNames,
      onPick: canEdit ? setTarget : null,
      todayIdx: week.days.indexOf(today),
      span: timelineWindow(week.store_hours ?? [], week.shifts.filter((s) => !s.flexible)),
    };
    // dayNames is rebuilt each render; the language only changes with a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, canEdit, today]);
  const sections = useMemo(() => groupSections(week?.people ?? [], canEdit ? undefined : meId), [week, canEdit, meId]);

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
        <Tooltip title={tr('info')} enterTouchDelay={0} leaveTouchDelay={6000}>
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

      {grid ? sections.map((section) => (
        <SectionTable
          key={section.key}
          g={grid}
          section={section}
          canEdit={canEdit}
          collapsed={!section.fixed && Boolean(collapsed[section.key])}
          onToggle={() => toggle(section.key)}
        />
      )) : null}

      {target ? (
        <ShiftDialog key={`${target.person.id}-${target.day}-${target.shift?.id ?? 'new'}`} target={target} onClose={() => setTarget(null)} onSaved={refresh} />
      ) : null}
    </Box>
  );
}
