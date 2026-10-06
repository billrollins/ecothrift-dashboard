import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { clearPractice, createPractice, getCareers, type ApplicationDetail, type Job } from '../../api/hiring.api';
import { practiceUrl } from './careersFile';
import { errorText } from './peopleUi';

/** The tag on a practice applicant or interview. */
export function PracticeChip({ sx }: { sx?: SxProps<Theme> }) {
  return (
    <Chip
      size="small"
      label="Practice"
      sx={[{ height: 20, fontSize: 11, fontWeight: 700, bgcolor: '#fff1d6', color: '#7a4b00' }, ...(Array.isArray(sx) ? sx : [sx])]}
    />
  );
}

/** Try the whole hiring flow with a stand-in applicant: blanks get placeholders, emails say [Practice]. */
export function PracticeDialog({
  open,
  jobs,
  practiceCount,
  onClose,
  onCreated,
}: {
  open: boolean;
  jobs: Job[];
  practiceCount: number;
  onClose: () => void;
  onCreated: (created: ApplicationDetail) => void;
}) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const careers = useQuery({ queryKey: ['hiring', 'careers'], queryFn: async () => (await getCareers()).data, enabled: open });
  const staff = (careers.data?.indexes.staff ?? []).filter((p) => p.email);
  const [jobId, setJobId] = useState<number | ''>('');
  const [fields, setFields] = useState({ first_name: '', last_name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setJobId(jobs[0]?.id ?? '');
    setFields({ first_name: '', last_name: '', email: '', phone: '' });
    setError('');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (name: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [name]: e.target.value }));
  const slug = jobs.find((j) => j.id === jobId)?.slug ?? '';

  async function create() {
    setBusy(true);
    setError('');
    try {
      const { data } = await createPractice({ job: jobId || null, ...fields });
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      onCreated(data);
    } catch (err) {
      const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
      setError(data ? Object.values(data).flat().join(' ') : errorText(err, 'Could not make the practice applicant.'));
    } finally {
      setBusy(false);
    }
  }

  async function copyFormLink() {
    const key = careers.data?.preview_key;
    if (!key) return;
    await navigator.clipboard.writeText(practiceUrl(key, slug)).catch(() => undefined);
    enqueueSnackbar('Practice form link copied. Text it to whoever plays the applicant.', { variant: 'success' });
  }

  async function clearAll() {
    if (!window.confirm(`Delete all ${practiceCount} practice applicant(s), with their interviews and offers?`)) return;
    setBusy(true);
    try {
      const { data } = await clearPractice();
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar(`Deleted ${data.deleted} practice applicant(s).`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not delete the practice runs.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Practice run
        <Typography variant="body2" color="text.secondary">
          Try the whole flow (apply, interview, offer, signing) without a real applicant. Anything you leave blank
          gets a placeholder.
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info" variant="outlined">
            Every email it sends starts with <b>[Practice]</b>. Its interviews never take a real applicant&rsquo;s time,
            its offer PDF is stamped PRACTICE, and it can&rsquo;t become an employee. It shows in Applicants with a
            Practice tag until you delete it.
          </Alert>
          <TextField select label="Role" value={jobId} onChange={(e) => setJobId(Number(e.target.value))} fullWidth>
            {jobs.map((j) => (
              <MenuItem key={j.id} value={j.id}>
                {j.title}
              </MenuItem>
            ))}
          </TextField>
          <Box>
            <TextField
              label="Emails go to (blank = no emails; use the copy-link buttons)"
              value={fields.email}
              onChange={set('email')}
              fullWidth
              placeholder="the person playing the applicant"
            />
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
              {staff.map((p) => (
                <Chip
                  key={p.id}
                  size="small"
                  label={p.name}
                  variant={fields.email === p.email ? 'filled' : 'outlined'}
                  color={fields.email === p.email ? 'primary' : 'default'}
                  onClick={() =>
                    setFields((f) => ({
                      ...f,
                      email: p.email,
                      first_name: f.first_name || p.name.split(' ')[0],
                    }))
                  }
                />
              ))}
            </Box>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="First name" value={fields.first_name} onChange={set('first_name')} placeholder="Practice" fullWidth />
            <TextField label="Last name" value={fields.last_name} onChange={set('last_name')} placeholder="Applicant" fullWidth />
          </Stack>
          <TextField label="Phone" value={fields.phone} onChange={set('phone')} placeholder="402-555-0100" fullWidth />
          <Typography variant="body2" color="text.secondary">
            Or have them fill in the real application on their phone: <b>Copy practice form link</b>. On that link they
            can leave anything blank and press Send.
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        {practiceCount > 0 && (
          <Button color="error" disabled={busy} onClick={clearAll} sx={{ mr: 'auto' }}>
            Delete all practice runs ({practiceCount})
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="outlined" onClick={copyFormLink} disabled={busy || !careers.data?.preview_key}>
          Copy practice form link
        </Button>
        <Button variant="contained" onClick={create} disabled={busy || !jobId}>
          Make practice applicant
        </Button>
      </DialogActions>
    </Dialog>
  );
}
