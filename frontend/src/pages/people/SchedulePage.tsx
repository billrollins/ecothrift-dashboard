/**
 * Schedule (owner 2026-10-21): managers build each week, one row per person, one column per day. Retail keeps fixed
 * shifts; every other department flexes (leave early on a slow day, come in or stay late on a busy one), so its times
 * are the plan. A shift opens to change it, remove it, or record a call-in; an empty day opens to add a shift or record
 * a call-in. Call-ins are counted per person over the last 30 and 90 days.
 */
import { useMemo, useState } from 'react';
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { addDays, format, parseISO, startOfWeek } from 'date-fns';
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
  type ScheduleWeek,
  type ScheduledShift,
} from '../../api/schedule.api';
import { ccTokens } from '../../theme';

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

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

/** The phone view: pick a day, then one card per person with that day's shifts and call-ins. */
function PhoneDay({ week, day, onDay, byCell, callIns, onPick }: {
  week: ScheduleWeek;
  day: string;
  onDay: (day: string) => void;
  byCell: Map<string, ScheduledShift[]>;
  callIns: Map<string, CallIn[]>;
  onPick: (target: Target) => void;
}) {
  return (
    <Box data-testid="schedule-phone">
      <Box sx={{ display: 'flex', gap: 0.5, overflowX: 'auto', pb: 1 }}>
        {week.days.map((d) => (
          <Button key={d} size="small" variant={d === day ? 'contained' : 'outlined'} onClick={() => onDay(d)} sx={{ minWidth: 56, flexShrink: 0, flexDirection: 'column', lineHeight: 1.2 }}>
            <span>{format(parseISO(d), 'EEE')}</span>
            <span>{format(parseISO(d), 'd')}</span>
          </Button>
        ))}
      </Box>
      {week.people.map((person) => {
        const shifts = byCell.get(`${person.id}:${day}`) ?? [];
        const calls = callIns.get(`${person.id}:${day}`) ?? [];
        return (
          <Box
            key={person.id}
            data-testid={`schedule-card-${person.id}`}
            onClick={() => onPick({ person, day, shift: shifts[0] ?? null })}
            sx={{ p: 1.25, mb: 1, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card, cursor: 'pointer' }}
          >
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
              <Typography fontWeight={700} sx={{ flex: 1 }}>{person.name}</Typography>
              <Typography variant="caption" color={person.call_ins.d30 >= 2 ? 'error.main' : 'text.secondary'}>
                Call-ins {person.call_ins.d30} / {person.call_ins.d90}
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary">
              {shifts.length ? shifts.map((s) => `${s.flexible ? 'About ' : ''}${s.text}${s.department_name ? ` ${s.department_name}` : ''}`).join(', ') : 'Off'}
            </Typography>
            {calls.map((c) => (
              <Typography key={c.id} variant="caption" sx={{ color: '#8a1c12', fontWeight: 700, display: 'block' }}>
                {c.kind_label}{c.reason ? `: ${c.reason}` : ''}
              </Typography>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

export default function SchedulePage() {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [start, setStart] = useState(() => fmt(startOfWeek(new Date(), { weekStartsOn: 1 })));
  const [target, setTarget] = useState<Target | null>(null);
  const wide = useMediaQuery(useTheme().breakpoints.up('md'));
  const [day, setDay] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['scheduleWeek', start], queryFn: async () => (await getScheduleWeek(start)).data });
  const week = query.data;
  // Phone: one day at a time; today when it is in this week, else Monday.
  const today = fmt(new Date());
  const phoneDay = day && week?.days.includes(day) ? day : week?.days.includes(today) ? today : week?.days[0] ?? '';
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['scheduleWeek'] });

  const byCell = useMemo(() => {
    const map = new Map<string, ScheduledShift[]>();
    for (const s of week?.shifts ?? []) {
      const key = `${s.employee}:${s.date}`;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [week]);
  const callIns = useMemo(() => {
    const map = new Map<string, CallIn[]>();
    for (const c of week?.call_ins ?? []) {
      const key = `${c.employee}:${c.shift_date}`;
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return map;
  }, [week]);

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
    <Box sx={{ pb: 4 }} data-testid="schedule-page">
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ mb: 1.5 }} useFlexGap flexWrap="wrap">
        <Typography variant="h5" fontWeight={800}>Schedule</Typography>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton aria-label="Previous week" onClick={() => move(-7)}><ChevronLeftRounded /></IconButton>
          <Typography fontWeight={700} sx={{ minWidth: 110, textAlign: 'center' }} data-testid="schedule-week-label">{weekLabel(start)}</Typography>
          <IconButton aria-label="Next week" onClick={() => move(7)}><ChevronRightRounded /></IconButton>
          <Button size="small" onClick={() => setStart(fmt(startOfWeek(new Date(), { weekStartsOn: 1 })))}>This week</Button>
        </Stack>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" onClick={() => quick(() => copyScheduleWeek(fmt(addDays(parseISO(start), -7)), start), 'last week')}>
          Copy last week
        </Button>
        <Button variant="outlined" onClick={() => quick(() => fillScheduleFromUsual(start), 'usual shifts')}>
          Fill from usual shifts
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Retail shifts are fixed times. Other departments flex: the times are the plan, and people leave early on a slow
        day or come in or stay late on a busy one. Tap a day to add a shift or record a call-in.
      </Typography>
      {query.isError ? <Alert severity="error">Could not load the schedule.</Alert> : null}

      {!wide && week ? (
        <PhoneDay week={week} day={phoneDay} onDay={setDay} byCell={byCell} callIns={callIns} onPick={setTarget} />
      ) : (
      <Box sx={{ overflowX: 'auto', border: `1px solid ${ccTokens.line}`, borderRadius: ccTokens.r, bgcolor: ccTokens.card }}>
        <Box component="table" sx={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', '& td, & th': { borderBottom: `1px solid ${ccTokens.line}`, p: 0.75, verticalAlign: 'top' } }}>
          <thead>
            <tr>
              <Box component="th" sx={{ textAlign: 'left', width: 170 }}>Person</Box>
              {(week?.days ?? []).map((d) => (
                <Box component="th" key={d} sx={{ textAlign: 'left', fontWeight: 700 }}>{format(parseISO(d), 'EEE d')}</Box>
              ))}
              <Box component="th" sx={{ textAlign: 'right', width: 60 }}>Hours</Box>
              <Box component="th" sx={{ textAlign: 'right', width: 90 }}>
                <Tooltip title="Call-ins and no-shows, last 30 / 90 days"><span>Call-ins</span></Tooltip>
              </Box>
            </tr>
          </thead>
          <tbody>
            {(week?.people ?? []).map((person) => (
              <tr key={person.id} data-testid={`schedule-row-${person.id}`}>
                <td>
                  <Typography variant="body2" fontWeight={700}>{person.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{person.department_name}</Typography>
                </td>
                {(week?.days ?? []).map((day) => {
                  const shifts = byCell.get(`${person.id}:${day}`) ?? [];
                  const calls = callIns.get(`${person.id}:${day}`) ?? [];
                  return (
                    <Box
                      component="td"
                      key={day}
                      onClick={() => setTarget({ person, day, shift: null })}
                      sx={{ cursor: 'pointer', '&:hover': { bgcolor: ccTokens.bg }, minWidth: 96 }}
                    >
                      {shifts.map((s) => (
                        <Box
                          key={s.id}
                          onClick={(e) => { e.stopPropagation(); setTarget({ person, day, shift: s }); }}
                          sx={{ px: 0.75, py: 0.25, mb: 0.5, borderRadius: 1, bgcolor: s.flexible ? ccTokens.kraftTint : ccTokens.goodTint, fontSize: 13, fontWeight: 700 }}
                          title={s.flexible ? 'Flexible: the times are the plan' : 'Fixed shift'}
                        >
                          {s.flexible ? '~' : ''}{s.text}
                          {s.note ? <Typography component="div" variant="caption" color="text.secondary">{s.note}</Typography> : null}
                        </Box>
                      ))}
                      {calls.map((c) => (
                        <Box key={c.id} sx={{ px: 0.75, py: 0.25, borderRadius: 1, bgcolor: '#fde2df', color: '#8a1c12', fontSize: 12, fontWeight: 700 }} title={c.reason}>
                          {c.kind_label}
                        </Box>
                      ))}
                    </Box>
                  );
                })}
                <Box component="td" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{person.hours || '-'}</Box>
                <Box component="td" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: person.call_ins.d30 >= 2 ? 'error.main' : undefined }}>
                  {person.call_ins.d30} / {person.call_ins.d90}
                </Box>
              </tr>
            ))}
          </tbody>
        </Box>
      </Box>

      )}

      {target ? (
        <ShiftDialog key={`${target.person.id}-${target.day}-${target.shift?.id ?? 'new'}`} target={target} onClose={() => setTarget(null)} onSaved={refresh} />
      ) : null}
    </Box>
  );
}
