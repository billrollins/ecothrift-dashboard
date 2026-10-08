import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Rating,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelInterviewStaff,
  getCareers,
  getOpenTimes,
  markNoShow,
  previewCancelInterview,
  previewReschedule,
  rescheduleInterview,
  saveScorecard,
  setInterviewInterviewer,
  type Interview,
  type OpenTime,
  type Scorecard,
  type ScorecardAnswer,
} from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { useEmailReview } from './EmailReview';
import { errorText } from './peopleUi';

// ── Pick a time ─────────────────────────────────────────────────────────────

const dayAt = (iso: string) => new Date(`${iso}T12:00`);
const longDay = (iso: string) => dayAt(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

/** "10:00 AM" → Morning; noon to 4:59 PM → Afternoon; 5 PM on → Evening. */
function partOfDay(label: string) {
  const [hm, ap] = label.split(' ');
  const hour = (Number(hm.split(':')[0]) % 12) + (ap === 'PM' ? 12 : 0);
  return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
}

function StepHead({ label, prev, next, names }: {
  label: string;
  prev: (() => void) | null;
  next: (() => void) | null;
  names: [string, string];
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
      <IconButton aria-label={names[0]} disabled={!prev} onClick={() => prev?.()}>
        <ChevronLeft />
      </IconButton>
      <Typography sx={{ flex: 1, textAlign: 'center', fontWeight: 700 }}>{label}</Typography>
      <IconButton aria-label={names[1]} disabled={!next} onClick={() => next?.()}>
        <ChevronRight />
      </IconButton>
    </Box>
  );
}

/**
 * Two steps, like the applicant's page: a day on a calendar (only days with open times), then a time that day.
 * On a phone one step shows at a time, with arrows between open days and a way back; wider, side by side.
 */
export function TimePicker({
  times,
  value,
  onChange,
}: {
  times: OpenTime[];
  value: string;
  onChange: (start: string) => void;
}) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const days = useMemo(() => {
    const map = new Map<string, { date: string; times: OpenTime[] }>();
    times.forEach((t) => {
      if (!map.has(t.date)) map.set(t.date, { date: t.date, times: [] });
      map.get(t.date)!.times.push(t);
    });
    return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
  }, [times]);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const months = useMemo(() => [...new Set(days.map((d) => d.date.slice(0, 7)))], [days]);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [step, setStep] = useState<'day' | 'time'>('day');
  useEffect(() => {
    if (day && !byDate.has(day)) {
      setDay('');
      setStep('day');
    }
    if (!months.includes(month) && months.length) setMonth(months[0]);
  }, [byDate, day, month, months]);

  if (!days.length) {
    return <Alert severity="warning">No open interview times. Open days on People → Interviews.</Alert>;
  }

  function openDay(date: string) {
    setDay(date);
    setMonth(date.slice(0, 7));
    setStep('time');
  }

  const index = days.findIndex((d) => d.date === day);
  const current = byDate.get(day);
  const [y, m] = (month || months[0]).split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= new Date(y, m, 0).getDate(); d++) {
    cells.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  const monthIndex = months.indexOf(month);
  const groups = new Map<string, OpenTime[]>();
  (current?.times ?? []).forEach((t) => {
    const part = partOfDay(t.label);
    if (!groups.has(part)) groups.set(part, []);
    groups.get(part)!.push(t);
  });

  const calendar = (
    <Box>
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>1. Pick a day</Typography>
      <StepHead
        label={first.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        prev={monthIndex > 0 ? () => setMonth(months[monthIndex - 1]) : null}
        next={monthIndex >= 0 && monthIndex < months.length - 1 ? () => setMonth(months[monthIndex + 1]) : null}
        names={['Earlier month', 'Later month']}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Typography key={i} variant="caption" sx={{ textAlign: 'center', fontWeight: 700, color: ccTokens.ink3 }}>
            {d}
          </Typography>
        ))}
        {cells.map((date, i) => {
          if (!date) return <Box key={`x${i}`} />;
          const open = byDate.get(date);
          const on = date === day;
          return (
            <ButtonBase
              key={date}
              disabled={!open}
              onClick={() => openDay(date)}
              aria-label={open ? `${longDay(date)}, ${open.times.length} times` : longDay(date)}
              sx={{
                flexDirection: 'column', minHeight: 44, borderRadius: ccTokens.rSm, lineHeight: 1.1,
                border: `1px solid ${on ? ccTokens.brand : open ? '#c4dcbd' : 'transparent'}`,
                bgcolor: on ? ccTokens.brand : open ? ccTokens.goodTint : 'transparent',
                color: on ? '#fff' : open ? ccTokens.brand : ccTokens.line2, fontWeight: open ? 700 : 400,
              }}
            >
              <span>{Number(date.slice(8))}</span>
              {open && <Box component="small" sx={{ fontSize: 10.5, opacity: 0.85 }}>{open.times.length}</Box>}
            </ButtonBase>
          );
        })}
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 1, color: ccTokens.ink3 }}>
        Bold days have open times. The number is how many.
      </Typography>
    </Box>
  );

  const slots = (
    <Box>
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>2. Pick a time</Typography>
      {!current ? (
        <Typography variant="body2" sx={{ color: ccTokens.ink3, mt: 1.5 }}>
          Pick a day first.
        </Typography>
      ) : (
        <>
          <StepHead
            label={longDay(current.date)}
            prev={index > 0 ? () => openDay(days[index - 1].date) : null}
            next={index < days.length - 1 ? () => openDay(days[index + 1].date) : null}
            names={['Earlier day', 'Later day']}
          />
          {!wide && (
            <Button size="small" onClick={() => setStep('day')} sx={{ mb: 0.5, px: 0 }}>
              ← All days
            </Button>
          )}
          {[...groups.entries()].map(([part, list]) => (
            <Box key={part} sx={{ mb: 1.25 }}>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.6,
                textTransform: 'uppercase', color: ccTokens.ink3, mb: 0.5 }}>
                {part}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 0.75 }}>
                {list.map((t) => {
                  const on = value === t.start;
                  return (
                    <ButtonBase
                      key={t.start}
                      aria-pressed={on}
                      onClick={() => onChange(t.start)}
                      sx={{
                        minHeight: 44, borderRadius: ccTokens.rSm, fontWeight: 600, fontSize: 15,
                        border: `1px solid ${on ? ccTokens.brand : ccTokens.line2}`,
                        bgcolor: on ? ccTokens.brand : '#fff', color: on ? '#fff' : ccTokens.ink,
                      }}
                    >
                      {t.label}
                    </ButtonBase>
                  );
                })}
              </Box>
            </Box>
          ))}
        </>
      )}
    </Box>
  );

  if (wide) {
    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 3, alignItems: 'start' }}>
        {calendar}
        {slots}
      </Box>
    );
  }
  return step === 'day' ? calendar : slots;
}

export function PickTimeDialog({
  open,
  title,
  exclude,
  application,
  confirmLabel,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  exclude?: number;
  /** The applicant: only times open to one of their roles. */
  application?: number;
  confirmLabel: string;
  onClose: () => void;
  onPick: (start: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const times = useQuery({
    queryKey: ['hiring', 'open-times', exclude ?? 0, application ?? 0],
    queryFn: async () => (await getOpenTimes(exclude, application)).data,
    enabled: open,
  });
  useEffect(() => {
    if (open) {
      setValue('');
      setError('');
    }
  }, [open]);
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const picked = (times.data?.times ?? []).find((t) => t.start === value);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth fullScreen={phone}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {times.isLoading ? <CircularProgress size={22} /> : <TimePicker times={times.data?.times ?? []} value={value} onChange={setValue} />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {picked && (
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0, color: ccTokens.ink2, pl: 1 }}>
            {longDay(picked.date)} at {picked.label}
          </Typography>
        )}
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!value || busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await onPick(value);
            } catch (err) {
              setError(errorText(err, 'That time did not work. Pick another.'));
              await times.refetch();
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Scorecard ───────────────────────────────────────────────────────────────

export function ScorecardDialog({
  open,
  interview,
  onClose,
  onSaved,
}: {
  open: boolean;
  interview: Interview;
  onClose: () => void;
  onSaved: (updated: Interview) => void;
}) {
  const [card, setCard] = useState<Required<Scorecard>>({ answers: [], overall: '', lead_potential: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const saved = interview.scorecard || {};
    const byKey = new Map((saved.answers ?? []).map((a) => [a.key, a]));
    const answers = interview.interview_questions.map((q) => ({
      key: q.key,
      label: q.label,
      rating: byKey.get(q.key)?.rating ?? null,
      note: byKey.get(q.key)?.note ?? '',
    }));
    setCard({
      answers,
      overall: saved.overall ?? '',
      lead_potential: saved.lead_potential ?? '',
      notes: saved.notes ?? '',
    });
    setError('');
  }, [open, interview]);

  const setAnswer = (i: number, patch: Partial<ScorecardAnswer>) =>
    setCard((c) => ({ ...c, answers: c.answers.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  async function save(done: boolean) {
    setBusy(true);
    setError('');
    try {
      const { data } = await saveScorecard(interview.id, { ...card, done });
      onSaved(data);
    } catch (err) {
      setError(errorText(err, 'Could not save the scorecard.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth fullScreen={window.innerWidth < 600}>
      <DialogTitle>
        Interview: {interview.applicant_name}
        <Typography variant="body2" color="text.secondary">
          {interview.roles.join(', ')} · {interview.when}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.25} sx={{ pt: 1 }}>
          {card.answers.length === 0 && (
            <Alert severity="info">This role has no interview questions yet. Add them in Jobs & careers page.</Alert>
          )}
          {card.answers.map((a, i) => (
            <Box key={a.key} sx={{ pb: 1.5, borderBottom: `1px solid ${ccTokens.line}` }}>
              <Typography fontWeight={600} sx={{ fontSize: 15 }}>
                {i + 1}. {a.label}
              </Typography>
              <Rating value={a.rating} onChange={(_, v) => setAnswer(i, { rating: v })} sx={{ mt: 0.5 }} />
              <TextField
                size="small"
                placeholder="Notes"
                value={a.note}
                onChange={(e) => setAnswer(i, { note: e.target.value })}
                multiline
                fullWidth
                sx={{ mt: 0.5 }}
              />
            </Box>
          ))}
          <Box>
            <Typography fontWeight={600}>Overall</Typography>
            <ToggleButtonGroup
              exclusive
              value={card.overall}
              onChange={(_, v) => v !== null && setCard((c) => ({ ...c, overall: v }))}
              sx={{ mt: 0.75 }}
            >
              <ToggleButton value="hire">Hire</ToggleButton>
              <ToggleButton value="maybe">Maybe</ToggleButton>
              <ToggleButton value="no">No</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box>
            <Typography fontWeight={600}>Could they lead this area someday?</Typography>
            <ToggleButtonGroup
              exclusive
              value={card.lead_potential}
              onChange={(_, v) => v !== null && setCard((c) => ({ ...c, lead_potential: v }))}
              sx={{ mt: 0.75 }}
            >
              <ToggleButton value="yes">Yes</ToggleButton>
              <ToggleButton value="maybe">Maybe</ToggleButton>
              <ToggleButton value="no">No</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <TextField
            label="Notes"
            value={card.notes}
            onChange={(e) => setCard((c) => ({ ...c, notes: e.target.value }))}
            multiline
            minRows={3}
            fullWidth
          />
          <Typography variant="caption" color="text.secondary">
            Promise to the applicant: they hear back within 5 business days either way.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button onClick={() => save(false)} disabled={busy}>
          Save
        </Button>
        {interview.status === 'scheduled' && (
          <Button variant="contained" onClick={() => save(true)} disabled={busy}>
            Save & mark done
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ── One interview, with its actions ─────────────────────────────────────────

const STATUS_COLOR: Record<Interview['status'], 'success' | 'default' | 'warning' | 'error'> = {
  scheduled: 'success',
  done: 'default',
  no_show: 'error',
  cancelled: 'warning',
};

const OVERALL_LABEL: Record<string, string> = { hire: 'Hire', maybe: 'Maybe', no: 'No' };

export function InterviewCard({
  interview,
  onChanged,
  onNoShow,
}: {
  interview: Interview;
  onChanged: () => void;
  /** After No-show: open the Not now draft (reason No-show). */
  onNoShow?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [moving, setMoving] = useState(false);
  const [scoring, setScoring] = useState(false);
  const { review, dialog: reviewDialog } = useEmailReview();
  const careers = useQuery({ queryKey: ['hiring', 'careers'], queryFn: async () => (await getCareers()).data });
  const staff = careers.data?.indexes.staff ?? [];
  const scheduled = interview.status === 'scheduled';
  const card = interview.scorecard || {};

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError('');
    try {
      await action();
      onChanged();
      return true;
    } catch (err) {
      setError(errorText(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ p: 1.5, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography fontWeight={700} sx={{ flex: 1, minWidth: 180 }}>
          {interview.when}
        </Typography>
        <Chip size="small" label={interview.status_label} color={STATUS_COLOR[interview.status]} />
      </Box>
      <Typography variant="body2" sx={{ color: ccTokens.ink2, mt: 0.25 }}>
        {interview.job_title || interview.roles.join(', ')} · booked by {interview.booked_by}
        {card.overall ? ` · Overall: ${OVERALL_LABEL[card.overall]}` : ''}
        {card.lead_potential ? ` · Lead: ${card.lead_potential}` : ''}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 1 }}>
        <TextField
          select
          size="small"
          label="Interviewer"
          value={interview.interviewer ? String(interview.interviewer) : ''}
          disabled={busy || !scheduled}
          onChange={(e) =>
            void run(
              () => setInterviewInterviewer(interview.id, e.target.value ? Number(e.target.value) : null),
              'Could not change the interviewer.',
            )
          }
          sx={{ minWidth: 190 }}
        >
          <MenuItem value="">Nobody yet</MenuItem>
          {staff.map((p) => (
            <MenuItem key={p.id} value={String(p.id)}>
              {p.name}
            </MenuItem>
          ))}
        </TextField>
        {scheduled && (
          <>
            <Button size="small" variant="contained" disabled={busy} onClick={() => setScoring(true)}>
              Scorecard / Done
            </Button>
            <Button size="small" disabled={busy} onClick={() => setMoving(true)}>
              Reschedule
            </Button>
            <Button
              size="small"
              color="warning"
              disabled={busy}
              onClick={async () => {
                if (await run(() => markNoShow(interview.id), 'Could not mark the no-show.')) onNoShow?.();
              }}
            >
              No-show
            </Button>
            <Button
              size="small"
              color="inherit"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    review({
                      title: `Cancel ${interview.applicant_name}'s interview`,
                      preview: () => previewCancelInterview(interview.id),
                      commit: async (email, text) => (await cancelInterviewStaff(interview.id, email, text)).data,
                      sendLabel: 'Cancel it and send',
                      skipLabel: 'Cancel it without emailing',
                    }),
                  'Could not cancel.',
                )
              }
            >
              Cancel
            </Button>
          </>
        )}
        {!scheduled && interview.status === 'done' && (
          <Button size="small" onClick={() => setScoring(true)}>
            Open scorecard
          </Button>
        )}
      </Box>
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
      <PickTimeDialog
        open={moving}
        title={`Move ${interview.applicant_name}'s interview`}
        exclude={interview.id}
        confirmLabel="Move it"
        onClose={() => setMoving(false)}
        onPick={async (start) => {
          const moved = await review({
            title: `Move ${interview.applicant_name}'s interview`,
            preview: () => previewReschedule(interview.id, start),
            commit: async (email, text) => (await rescheduleInterview(interview.id, start, email, text)).data,
            sendLabel: 'Move it and send',
            skipLabel: 'Move it without emailing',
          });
          if (!moved) return; // Cancel: back to the times, nothing moved
          setMoving(false);
          onChanged();
        }}
      />
      {reviewDialog}
      <ScorecardDialog
        open={scoring}
        interview={interview}
        onClose={() => setScoring(false)}
        onSaved={() => {
          setScoring(false);
          onChanged();
        }}
      />
    </Box>
  );
}
