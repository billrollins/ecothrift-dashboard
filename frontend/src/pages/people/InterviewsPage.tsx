import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  getCareers,
  getInterviews,
  saveCareers,
  type InterviewSettings,
} from '../../api/hiring.api';
import { PageHeader } from '../../components/common/PageHeader';
import { ccTokens } from '../../theme';
import { InterviewAvailability } from './InterviewAvailability';
import { InterviewCard } from './interviewUi';
import { PracticeChip } from './PracticeDialog';
import { errorText } from './peopleUi';

function SettingsCard({ settings }: { settings: InterviewSettings }) {
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
      enqueueSnackbar('Interview settings saved', { variant: 'success' });
    } catch (err) {
      const data = (err as { response?: { data?: { errors?: string[] } } }).response?.data;
      enqueueSnackbar(data?.errors?.join(' ') || errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
      <Typography fontWeight={700}>Interview settings</Typography>
      <Typography variant="body2" sx={{ color: ccTokens.ink2, mb: 1.5 }}>
        Also in the careers JSON (<code>interviews</code>).
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
        <TextField select size="small" label="Each interview" value={draft.length_minutes} sx={{ minWidth: 140 }}
          onChange={(e) => setDraft((d) => ({ ...d, length_minutes: Number(e.target.value) }))}>
          {[15, 20, 30, 45, 60].map((m) => (
            <MenuItem key={m} value={m}>
              {m} minutes
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" type="number" label="Notice (hours)" value={draft.min_notice_hours}
          onChange={(e) => setDraft((d) => ({ ...d, min_notice_hours: Number(e.target.value) }))} />
        <TextField size="small" type="number" label="Link works (days)" value={draft.link_days}
          onChange={(e) => setDraft((d) => ({ ...d, link_days: Number(e.target.value) }))} />
      </Stack>
      <TextField size="small" label="Where" value={draft.place} fullWidth sx={{ mb: 1.5 }}
        onChange={(e) => setDraft((d) => ({ ...d, place: e.target.value }))} />
      <Button variant="contained" disabled={!changed || busy} onClick={save}>
        Save settings
      </Button>
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
        subtitle="Applicants book from the link you send them; you open the days and times. Score each interview on your phone."
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
          <InterviewAvailability lengthMinutes={settings?.length_minutes ?? 30} />
          {settings && <SettingsCard settings={settings} />}
        </Stack>
      </Box>
    </Box>
  );
}
