import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Rating,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  cancelInterviewStaff,
  getCareers,
  getOpenTimes,
  markNoShow,
  rescheduleInterview,
  saveScorecard,
  setInterviewInterviewer,
  type Interview,
  type OpenTime,
  type Scorecard,
  type ScorecardAnswer,
} from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { errorText } from './peopleUi';

// ── Pick a time ─────────────────────────────────────────────────────────────

export function TimePicker({
  times,
  value,
  onChange,
}: {
  times: OpenTime[];
  value: string;
  onChange: (start: string) => void;
}) {
  const days = useMemo(() => {
    const map = new Map<string, { date: string; day: string; times: OpenTime[] }>();
    times.forEach((t) => {
      if (!map.has(t.date)) map.set(t.date, { date: t.date, day: t.day, times: [] });
      map.get(t.date)!.times.push(t);
    });
    return [...map.values()];
  }, [times]);
  const [day, setDay] = useState('');
  useEffect(() => {
    if (days.length && !days.some((d) => d.date === day)) setDay(days[0].date);
  }, [days, day]);
  if (!days.length) {
    return <Alert severity="warning">No open times in the window. Open extra time on People → Interviews.</Alert>;
  }
  const current = days.find((d) => d.date === day);
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {days.map((d) => (
          <Chip
            key={d.date}
            label={d.day.replace(/^(\w{3})\w*,/, '$1,')}
            color={d.date === day ? 'primary' : 'default'}
            variant={d.date === day ? 'filled' : 'outlined'}
            onClick={() => setDay(d.date)}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.5 }}>
        {(current?.times ?? []).map((t) => (
          <Chip
            key={t.start}
            label={t.label}
            color={value === t.start ? 'primary' : 'default'}
            variant={value === t.start ? 'filled' : 'outlined'}
            onClick={() => onChange(t.start)}
          />
        ))}
      </Box>
    </Box>
  );
}

export function PickTimeDialog({
  open,
  title,
  exclude,
  confirmLabel,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  exclude?: number;
  confirmLabel: string;
  onClose: () => void;
  onPick: (start: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const times = useQuery({
    queryKey: ['hiring', 'open-times', exclude ?? 0],
    queryFn: async () => (await getOpenTimes(exclude)).data,
    enabled: open,
  });
  useEffect(() => {
    if (open) {
      setValue('');
      setError('');
    }
  }, [open]);
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {times.isLoading ? <CircularProgress size={22} /> : <TimePicker times={times.data?.times ?? []} value={value} onChange={setValue} />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
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
              onClick={() => {
                if (window.confirm('Cancel this interview? The applicant gets an email with their link to pick again.'))
                  void run(() => cancelInterviewStaff(interview.id), 'Could not cancel.');
              }}
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
          await rescheduleInterview(interview.id, start);
          setMoving(false);
          onChanged();
        }}
      />
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
