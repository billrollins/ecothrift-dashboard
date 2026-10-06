import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  addInterviewTime,
  deleteInterviewTime,
  getCareers,
  getInterviews,
  getInterviewTimes,
  saveCareers,
  type InterviewSettings,
} from '../../api/hiring.api';
import { PageHeader } from '../../components/common/PageHeader';
import { ccTokens } from '../../theme';
import { InterviewCard } from './interviewUi';
import { PracticeChip } from './PracticeDialog';
import { errorText } from './peopleUi';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function HoursCard({ settings }: { settings: InterviewSettings }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const changed = JSON.stringify(draft) !== JSON.stringify(settings);

  async function save() {
    setBusy(true);
    try {
      await saveCareers({ format: 'ecothrift.careers/1', interviews: draft });
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar('Interview hours saved', { variant: 'success' });
    } catch (err) {
      const data = (err as { response?: { data?: { errors?: string[] } } }).response?.data;
      enqueueSnackbar(data?.errors?.join(' ') || errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Typography fontWeight={700}>Weekly interview hours</Typography>
      <Typography variant="body2" sx={{ color: ccTokens.ink2, mb: 1.5 }}>
        Applicants pick from these times with their link. Also in the careers JSON (<code>interviews</code>).
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
        {WEEKDAYS.map((day) => {
          const on = draft.weekdays.includes(day);
          return (
            <Chip
              key={day}
              label={day.slice(0, 3)}
              color={on ? 'primary' : 'default'}
              variant={on ? 'filled' : 'outlined'}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  weekdays: WEEKDAYS.filter((w) => (w === day ? !on : d.weekdays.includes(w))),
                }))
              }
            />
          );
        })}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <TextField size="small" type="time" label="From" value={draft.start} InputLabelProps={{ shrink: true }}
          onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} />
        <TextField size="small" type="time" label="To" value={draft.end} InputLabelProps={{ shrink: true }}
          onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} />
        <TextField select size="small" label="Each interview" value={draft.length_minutes} sx={{ minWidth: 140 }}
          onChange={(e) => setDraft((d) => ({ ...d, length_minutes: Number(e.target.value) }))}>
          {[15, 20, 30, 45, 60].map((m) => (
            <MenuItem key={m} value={m}>
              {m} minutes
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <TextField size="small" type="number" label="Show days ahead" value={draft.days_ahead}
          onChange={(e) => setDraft((d) => ({ ...d, days_ahead: Number(e.target.value) }))} />
        <TextField size="small" type="number" label="Notice (hours)" value={draft.min_notice_hours}
          onChange={(e) => setDraft((d) => ({ ...d, min_notice_hours: Number(e.target.value) }))} />
        <TextField size="small" type="number" label="Link works (days)" value={draft.link_days}
          onChange={(e) => setDraft((d) => ({ ...d, link_days: Number(e.target.value) }))} />
      </Stack>
      <TextField size="small" label="Where" value={draft.place} fullWidth sx={{ mb: 1.5 }}
        onChange={(e) => setDraft((d) => ({ ...d, place: e.target.value }))} />
      <Button variant="contained" disabled={!changed || busy} onClick={save}>
        Save hours
      </Button>
    </Box>
  );
}

function ExtraTimesCard() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const times = useQuery({ queryKey: ['hiring', 'interview-times'], queryFn: async () => (await getInterviewTimes()).data });
  const [form, setForm] = useState({ kind: 'open' as 'open' | 'block', date: '', start: '09:00', end: '12:00', note: '' });
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await addInterviewTime({
        kind: form.kind,
        start: `${form.date}T${form.start}`,
        end: `${form.date}T${form.end}`,
        note: form.note.trim(),
      });
      setForm((f) => ({ ...f, note: '' }));
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not add it.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Typography fontWeight={700}>Extra openings and blocked times</Typography>
      <Typography variant="body2" sx={{ color: ccTokens.ink2, mb: 1.5 }}>
        Open a Saturday morning, or block a day you are out. Booked interviews always block their own time.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1 }}>
        <TextField select size="small" label="Kind" value={form.kind} sx={{ minWidth: 150 }}
          onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as 'open' | 'block' }))}>
          <MenuItem value="open">Open extra time</MenuItem>
          <MenuItem value="block">Block time</MenuItem>
        </TextField>
        <TextField size="small" type="date" label="Day" value={form.date} InputLabelProps={{ shrink: true }}
          onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
        <TextField size="small" type="time" label="From" value={form.start} InputLabelProps={{ shrink: true }}
          onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} />
        <TextField size="small" type="time" label="To" value={form.end} InputLabelProps={{ shrink: true }}
          onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} />
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <TextField size="small" label="Note (optional)" value={form.note} fullWidth
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        <Button variant="outlined" disabled={busy || !form.date} onClick={add}>
          Add
        </Button>
      </Stack>
      {(times.data ?? []).length === 0 && (
        <Typography variant="body2" color="text.secondary">
          None. The weekly hours apply.
        </Typography>
      )}
      {(times.data ?? []).map((t) => (
        <Box key={t.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
          <Chip size="small" label={t.kind === 'open' ? 'Open' : 'Blocked'} color={t.kind === 'open' ? 'success' : 'warning'} />
          <Typography variant="body2" sx={{ flex: 1 }}>
            {fmt(t.start)} to {new Date(t.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            {t.note ? ` · ${t.note}` : ''}
          </Typography>
          <IconButton
            size="small"
            aria-label="Remove"
            onClick={async () => {
              await deleteInterviewTime(t.id);
              await queryClient.invalidateQueries({ queryKey: ['hiring'] });
            }}
          >
            <DeleteOutline fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}

export default function InterviewsPage() {
  const queryClient = useQueryClient();
  const [when, setWhen] = useState<'today' | 'upcoming' | 'past'>('upcoming');
  const interviews = useQuery({
    queryKey: ['hiring', 'interviews', when],
    queryFn: async () => (await getInterviews({ when })).data,
  });
  const careers = useQuery({ queryKey: ['hiring', 'careers'], queryFn: async () => (await getCareers()).data });
  const settings = careers.data?.doc.interviews;

  return (
    <Box>
      <PageHeader
        title="Interviews"
        subtitle="Applicants book from the link you send them; you set the hours. Score each interview on your phone."
        action={
          <Button component={RouterLink} to="/people/applicants">
            Applicants
          </Button>
        }
      />
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.4fr) minmax(320px, 1fr)' } }}>
        <Box>
          <Tabs value={when} onChange={(_, v) => setWhen(v)} sx={{ borderBottom: `1px solid ${ccTokens.line}`, mb: 2 }}>
            <Tab value="today" label="Today" />
            <Tab value="upcoming" label="Upcoming" />
            <Tab value="past" label="Past" />
          </Tabs>
          {interviews.isLoading && <Typography color="text.secondary">Loading…</Typography>}
          {!interviews.isLoading && (interviews.data ?? []).length === 0 && (
            <Alert severity="info">
              {when === 'past'
                ? 'No past interviews yet.'
                : 'Nothing booked. On an applicant, press Email interview link (or Copy link to text it).'}
            </Alert>
          )}
          <Stack spacing={1.5}>
            {(interviews.data ?? []).map((interview) => (
              <Box key={interview.id}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.5 }}>
                  <Button
                    component={RouterLink}
                    to={`/people/applicants?stage=&id=${interview.application}`}
                    sx={{ p: 0, minWidth: 0, fontWeight: 700, fontSize: 16, textTransform: 'none' }}
                  >
                    {interview.applicant_name}
                  </Button>
                  {interview.practice && <PracticeChip />}
                  <Typography variant="body2" color="text.secondary">
                    {interview.applicant_phone}
                  </Typography>
                </Box>
                <InterviewCard
                  interview={interview}
                  onChanged={() => queryClient.invalidateQueries({ queryKey: ['hiring'] })}
                />
              </Box>
            ))}
          </Stack>
        </Box>
        <Stack spacing={2}>
          {settings && <HoursCard settings={settings} />}
          <ExtraTimesCard />
        </Stack>
      </Box>
    </Box>
  );
}
