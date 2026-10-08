import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Checkbox,
  FormControlLabel,
  IconButton,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getInterviewDays, getJobs, setInterviewDays, type InterviewDay } from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { errorText } from './peopleUi';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string) => new Date(`${s}T12:00`);
const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'a' : 'p'}`;
};

/** Every block start from 8 AM to 8 PM, one interview long. */
export function dayBlocks(lengthMinutes: number, from = 8, to = 20): string[] {
  const out: string[] = [];
  for (let m = from * 60; m + lengthMinutes <= to * 60; m += lengthMinutes) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

const QUICK: { label: string; from: number; to: number }[] = [
  { label: '9 to 5', from: 9, to: 17 },
  { label: 'Mornings', from: 9, to: 12 },
  { label: 'Afternoons', from: 13, to: 17 },
  { label: 'Evenings', from: 17, to: 20 },
];

/** A month of days to pick: open days carry a count, booked days a dot; past days can't be picked. */
function MonthPicker({
  month,
  days,
  picked,
  onToggle,
}: {
  month: Date;
  days: Record<string, InterviewDay>;
  picked: string[];
  onToggle: (day: string) => void;
}) {
  const today = iso(new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = 1; d <= count; d++) cells.push(iso(new Date(month.getFullYear(), month.getMonth(), d)));
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
        <Typography key={d} variant="caption" sx={{ textAlign: 'center', color: ccTokens.ink3, fontWeight: 700 }}>
          {d}
        </Typography>
      ))}
      {cells.map((day, i) => {
        if (!day) return <Box key={`x${i}`} />;
        const info = days[day];
        const open = info?.blocks.length ?? 0;
        const booked = info?.booked.length ?? 0;
        const past = day < today;
        const on = picked.includes(day);
        return (
          <ButtonBase
            key={day}
            disabled={past}
            onClick={() => onToggle(day)}
            aria-pressed={on}
            sx={{
              flexDirection: 'column', minHeight: 52, borderRadius: ccTokens.rSm, py: 0.5,
              border: `1px solid ${on ? ccTokens.brand : open ? '#c4dcbd' : ccTokens.line}`,
              bgcolor: on ? ccTokens.brand : open ? ccTokens.goodTint : '#fff',
              color: on ? '#fff' : past ? ccTokens.ink3 : ccTokens.ink, opacity: past ? 0.45 : 1,
              outline: day === today ? `2px solid ${ccTokens.kraft}` : 'none', outlineOffset: -2,
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{fromIso(day).getDate()}</Typography>
            <Typography sx={{ fontSize: 10.5, lineHeight: 1.2, opacity: open || booked ? 1 : 0 }}>
              {open ? `${open} open` : ''}
              {booked ? `${open ? ' · ' : ''}${booked} booked` : ''}
              {!open && !booked ? '.' : ''}
            </Typography>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

/**
 * Interview availability, in two steps: pick days on the calendar, then the blocks to open on them (8 AM to 8 PM,
 * one interview long) and the positions they are for. Applicants can book only what is opened here.
 */
export function InterviewAvailability({ lengthMinutes }: { lengthMinutes: number }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const rangeFrom = iso(month);
  const rangeTo = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const data = useQuery({
    queryKey: ['hiring', 'interview-days', rangeFrom],
    queryFn: async () => (await getInterviewDays(rangeFrom, rangeTo)).data,
  });
  const jobs = useQuery({ queryKey: ['hiring', 'jobs'], queryFn: async () => (await getJobs()).data });
  const openJobs = (jobs.data ?? []).filter((j) => j.status !== 'closed');
  const days = data.data?.days ?? {};
  const [picked, setPicked] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<string[]>([]);
  const [allJobs, setAllJobs] = useState(true);
  const [jobIds, setJobIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const grid = useMemo(() => dayBlocks(lengthMinutes), [lengthMinutes]);
  const painting = useRef<null | boolean>(null);

  // Picking days loads what they have; days that differ start empty (saving replaces them all).
  const loadedKey = picked.join(',');
  useEffect(() => {
    if (!picked.length) return;
    const sets = picked.map((d) => days[d]);
    const firstSet = sets[0];
    const same = sets.every((s) => (s?.blocks ?? []).join() === (firstSet?.blocks ?? []).join() &&
      (s?.jobs ?? []).join() === (firstSet?.jobs ?? []).join());
    setBlocks(same ? firstSet?.blocks ?? [] : []);
    const ids = same ? firstSet?.jobs ?? [] : [];
    setAllJobs(ids.length === 0);
    setJobIds(ids);
  }, [loadedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const differ = picked.length > 1 &&
    !picked.every((d) => (days[d]?.blocks ?? []).join() === (days[picked[0]]?.blocks ?? []).join());
  const booked = picked.length === 1 ? days[picked[0]]?.booked ?? [] : [];

  function toggleDay(day: string) {
    setPicked((p) => (p.includes(day) ? p.filter((d) => d !== day) : [...p, day].sort()));
  }

  function paint(block: string, on: boolean) {
    setBlocks((b) => (on ? (b.includes(block) ? b : [...b, block].sort()) : b.filter((x) => x !== block)));
  }

  async function save(close = false) {
    setBusy(true);
    try {
      await setInterviewDays({ dates: picked, blocks: close ? [] : blocks, jobs: allJobs ? [] : jobIds });
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar(
        close
          ? `Closed ${picked.length === 1 ? 'that day' : `${picked.length} days`}.`
          : `Opened ${blocks.length} times on ${picked.length === 1 ? 'that day' : `${picked.length} days`}.`,
        { variant: 'success' },
      );
      setPicked([]);
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const step = (n: number, text: string) => (
    <Typography sx={{ fontWeight: 700, fontSize: 14, mb: 1 }}>
      <Box component="span" sx={{ display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%',
        bgcolor: ccTokens.brand, color: '#fff', fontSize: 12, mr: 1 }}>{n}</Box>
      {text}
    </Typography>
  );

  return (
    <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Typography fontWeight={700}>Interview days</Typography>
      <Typography variant="body2" sx={{ color: ccTokens.ink2, mb: 2 }}>
        Applicants can book only the times you open here. Pick days, then the times to open on them.
      </Typography>

      {step(1, 'Pick the days')}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <IconButton size="small" aria-label="Previous month"
          disabled={month <= new Date(new Date().getFullYear(), new Date().getMonth(), 1)}
          onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
          <ChevronLeft />
        </IconButton>
        <Typography sx={{ flex: 1, textAlign: 'center', fontWeight: 700 }}>
          {month.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </Typography>
        <IconButton size="small" aria-label="Next month" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
          <ChevronRight />
        </IconButton>
      </Box>
      <MonthPicker month={month} days={days} picked={picked} onToggle={toggleDay} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, minHeight: 30, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: ccTokens.ink2, flex: 1 }}>
          {picked.length
            ? `${picked.length} ${picked.length === 1 ? 'day' : 'days'}: ${picked
                .map((d) => fromIso(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))
                .join(', ')}`
            : 'Tap the days that will have the same interview times.'}
        </Typography>
        {picked.length > 0 && (
          <Button size="small" color="inherit" onClick={() => setPicked([])}>
            Clear
          </Button>
        )}
      </Box>

      {picked.length > 0 && (
        <Box sx={{ mt: 2.5 }}>
          {step(2, `Open the times (${lengthMinutes}-minute interviews)`)}
          {differ && (
            <Alert severity="info" variant="outlined" sx={{ mb: 1.5 }}>
              These days have different times now. What you save replaces them all.
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.25 }}>
            {QUICK.map((q) => (
              <Button key={q.label} size="small" variant="outlined"
                onClick={() => setBlocks(grid.filter((b) => {
                  const h = Number(b.slice(0, 2)) + Number(b.slice(3)) / 60;
                  return h >= q.from && h < q.to;
                }))}>
                {q.label}
              </Button>
            ))}
            <Button size="small" color="inherit" onClick={() => setBlocks([])}>
              None
            </Button>
          </Box>
          <Box
            onPointerUp={() => (painting.current = null)}
            onPointerLeave={() => (painting.current = null)}
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 0.5, userSelect: 'none', touchAction: 'pan-y' }}
          >
            {grid.map((b) => {
              const on = blocks.includes(b);
              const taken = booked.find((x) => x.time === b);
              return (
                <ButtonBase
                  key={b}
                  title={taken ? `Booked: ${taken.name}` : undefined}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    // touch holds the pointer on this block; let go so dragging reaches the next ones
                    (e.target as Element).releasePointerCapture?.(e.pointerId);
                    painting.current = !on;
                    paint(b, !on);
                  }}
                  onPointerEnter={() => painting.current !== null && paint(b, painting.current)}
                  sx={{
                    height: 40, borderRadius: '6px', fontSize: 13, fontWeight: 600,
                    border: `1px solid ${on ? ccTokens.brand : ccTokens.line2}`,
                    bgcolor: on ? ccTokens.brand : '#fff', color: on ? '#fff' : ccTokens.ink2,
                    boxShadow: taken ? `inset 0 -3px 0 ${ccTokens.kraft}` : 'none',
                  }}
                >
                  {timeLabel(b)}
                </ButtonBase>
              );
            })}
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: ccTokens.ink3 }}>
            Tap a time, or press and drag across several. {blocks.length} open
            {booked.length ? ` · gold line = booked (${booked.map((x) => `${timeLabel(x.time)} ${x.name}`).join(', ')}); a booking stays even if you close its time` : ''}.
          </Typography>

          <Typography sx={{ fontWeight: 700, fontSize: 14, mt: 2, mb: 0.5 }}>For which positions</Typography>
          <FormControlLabel
            control={<Checkbox checked={allJobs} onChange={(e) => setAllJobs(e.target.checked)} />}
            label="All positions"
          />
          {!allJobs && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1, pl: 3 }}>
              {openJobs.map((j) => (
                <FormControlLabel
                  key={j.id}
                  control={
                    <Checkbox
                      checked={jobIds.includes(j.id)}
                      onChange={(e) => setJobIds((ids) => (e.target.checked ? [...ids, j.id] : ids.filter((x) => x !== j.id)))}
                    />
                  }
                  label={j.title}
                />
              ))}
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
            <Button variant="contained" disabled={busy || !blocks.length || (!allJobs && !jobIds.length)} onClick={() => save(false)}>
              Open {blocks.length} {blocks.length === 1 ? 'time' : 'times'} on {picked.length} {picked.length === 1 ? 'day' : 'days'}
            </Button>
            <Button color="inherit" disabled={busy} onClick={() => save(true)}>
              Close {picked.length === 1 ? 'this day' : 'these days'}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
