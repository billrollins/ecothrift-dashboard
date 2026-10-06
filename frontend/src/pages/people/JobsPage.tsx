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
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  createJob,
  getCareers,
  getJobs,
  setCareersPublic,
  updateJob,
  type Job,
} from '../../api/hiring.api';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { PageHeader } from '../../components/common/PageHeader';
import { ccTokens } from '../../theme';
import { aiBundle, previewUrl, toYaml } from './careersFile';
import { CareersFileDialog } from './CareersFileDialog';
import { errorText } from './peopleUi';

const STATUS_COLOR: Record<Job['status'], 'success' | 'default' | 'warning'> = {
  open: 'success',
  draft: 'default',
  paused: 'warning',
  closed: 'default',
};

type Draft = {
  title: string;
  slug: string;
  tagline: string;
  summary: string;
  duties: string;
  schedule: string;
  hours: string;
  employment_type: Job['employment_type'];
  pay_min: string;
  pay_max: string;
  pay_text: string;
  status: Job['status'];
  sort_order: string;
};

function toDraft(job: Job | null): Draft {
  return {
    title: job?.title ?? '',
    slug: job?.slug ?? '',
    tagline: job?.tagline ?? '',
    summary: job?.summary ?? '',
    duties: (job?.duties ?? []).join('\n'),
    schedule: job?.schedule ?? '',
    hours: job?.hours ?? 'Up to 40 hours a week',
    employment_type: job?.employment_type ?? 'full_or_part',
    pay_min: job?.pay_min ?? '15.00',
    pay_max: job?.pay_max ?? '',
    pay_text: job?.pay_text ?? 'From $15/hr, set by skill',
    status: job?.status ?? 'draft',
    sort_order: String(job?.sort_order ?? 50),
  };
}

function JobDialog({ open, job, onClose, onSaved }: { open: boolean; job: Job | null; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<Draft>(toDraft(job));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(toDraft(job));
      setError('');
    }
  }, [open, job]);

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function save() {
    setBusy(true);
    setError('');
    const payload: Partial<Job> = {
      title: draft.title.trim(),
      slug: draft.slug.trim() || draft.title.trim(),
      tagline: draft.tagline.trim(),
      summary: draft.summary.trim(),
      duties: draft.duties.split('\n').map((d) => d.replace(/^[-•]\s*/, '').trim()).filter(Boolean),
      schedule: draft.schedule.trim(),
      hours: draft.hours.trim(),
      employment_type: draft.employment_type,
      pay_min: draft.pay_min.trim() || null,
      pay_max: draft.pay_max.trim() || null,
      pay_text: draft.pay_text.trim(),
      status: draft.status,
      sort_order: Number(draft.sort_order) || 0,
    };
    try {
      if (job) await updateJob(job.id, payload);
      else await createJob(payload);
      onSaved();
    } catch (err) {
      setError(errorText(err, 'Could not save the role.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{job ? `Edit ${job.title}` : 'New role'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Title" value={draft.title} onChange={set('title')} fullWidth required />
            <TextField select label="Status" value={draft.status} onChange={set('status')} sx={{ minWidth: 140 }}>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="paused">Paused</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
            </TextField>
          </Stack>
          <TextField label="One line (tagline)" value={draft.tagline} onChange={set('tagline')} fullWidth />
          <TextField label="What the job is" value={draft.summary} onChange={set('summary')} multiline minRows={2} fullWidth />
          <TextField label="Duties (one per line)" value={draft.duties} onChange={set('duties')} multiline minRows={3} fullWidth />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Schedule" value={draft.schedule} onChange={set('schedule')} fullWidth placeholder="Typically Monday through Friday" />
            <TextField label="Hours" value={draft.hours} onChange={set('hours')} fullWidth />
          </Stack>
          <TextField select label="Type" value={draft.employment_type} onChange={set('employment_type')} fullWidth>
            <MenuItem value="full_or_part">Full or part time</MenuItem>
            <MenuItem value="full_time">Full time</MenuItem>
            <MenuItem value="part_time">Part time</MenuItem>
          </TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Pay from ($/hr)" value={draft.pay_min} onChange={set('pay_min')} fullWidth />
            <TextField label="Pay up to (never shown)" value={draft.pay_max} onChange={set('pay_max')} fullWidth />
          </Stack>
          <TextField label="What the page says about pay" value={draft.pay_text} onChange={set('pay_text')} fullWidth />
          <TextField label="Order on the page" value={draft.sort_order} onChange={set('sort_order')} sx={{ maxWidth: 160 }} />
          {job && job.questions.length > 0 && (
            <Alert severity="info" variant="outlined">
              Role question{job.questions.length === 1 ? '' : 's'}: {job.questions.map((q) => `“${q.label}”`).join(' ')}. Change
              questions through the careers file (Copy for AI, or Update from YAML).
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || !draft.title.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function JobsPage() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [editing, setEditing] = useState<Job | null | 'new'>(null);
  const [fileMode, setFileMode] = useState<'paste' | 'ai' | null>(null);
  const [confirmPublic, setConfirmPublic] = useState<boolean | null>(null);

  const jobs = useQuery({ queryKey: ['hiring', 'jobs'], queryFn: async () => (await getJobs()).data });
  const careers = useQuery({ queryKey: ['hiring', 'careers'], queryFn: async () => (await getCareers()).data });
  const isPublic = !!careers.data?.doc.public;

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['hiring'] });
  }

  async function copyForAi() {
    if (!careers.data) return;
    try {
      await navigator.clipboard.writeText(aiBundle(careers.data.brief, careers.data.doc));
      enqueueSnackbar('Copied. Paste it into any AI chat, write what you want changed, then paste the answer back here.', {
        variant: 'success',
        autoHideDuration: 8000,
      });
    } catch {
      enqueueSnackbar('Could not copy. Use Export YAML instead.', { variant: 'error' });
    }
  }

  function exportYaml() {
    if (!careers.data) return;
    const blob = new Blob([toYaml(careers.data.doc)], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecothrift-careers-${new Date().toISOString().slice(0, 10)}.yaml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function applyPublic(on: boolean) {
    try {
      await setCareersPublic(on);
      await refresh();
      enqueueSnackbar(on ? 'The careers page is live at ecothrift.us/careers.' : 'The careers page is hidden.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not change it.'), { variant: 'error' });
    } finally {
      setConfirmPublic(null);
    }
  }

  const openCount = (jobs.data ?? []).filter((j) => j.status === 'open').length;

  return (
    <Box>
      <PageHeader
        title="Jobs & careers page"
        subtitle="The roles on ecothrift.us/careers, the page text, the form questions and the emails."
        action={
          <Button component={RouterLink} to="/people/applicants">
            Applicants
          </Button>
        }
      />

      <Box sx={{ p: 2.5, mb: 3, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: isPublic ? ccTokens.goodTint : ccTokens.warnTint }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography fontWeight={700}>Careers page is {isPublic ? 'ON' : 'OFF'}</Typography>
            <Typography variant="body2" sx={{ color: ccTokens.ink2 }}>
              {isPublic
                ? `Anyone can apply at ecothrift.us/careers (${openCount} open role${openCount === 1 ? '' : 's'}).`
                : 'Hidden from the public. Use Preview to see it as applicants will.'}
            </Typography>
          </Box>
          {careers.data && (
            <Button
              variant="outlined"
              endIcon={<OpenInNewIcon />}
              href={previewUrl(careers.data.preview_key)}
              target="_blank"
              rel="noreferrer"
              sx={{ bgcolor: '#fff' }}
            >
              Preview
            </Button>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2">Off</Typography>
            <Switch checked={isPublic} disabled={!careers.data} onChange={(e) => setConfirmPublic(e.target.checked)} />
            <Typography variant="body2">On</Typography>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="h6" fontWeight={700}>
          Roles
        </Typography>
        <Button variant="contained" onClick={() => setEditing('new')}>
          New role
        </Button>
      </Box>
      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, mb: 4 }}>
        {(jobs.data ?? []).map((job) => (
          <Box key={job.id} sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography fontWeight={700} sx={{ flex: 1 }}>
                {job.title}
              </Typography>
              <Chip size="small" label={job.status} color={STATUS_COLOR[job.status]} variant={job.status === 'closed' ? 'outlined' : 'filled'} />
            </Box>
            <Typography variant="body2" sx={{ color: ccTokens.ink2 }}>
              {job.tagline}
            </Typography>
            <Typography variant="caption" sx={{ color: ccTokens.ink2 }}>
              {[job.schedule, job.pay_text].filter(Boolean).join(' · ')}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 'auto', pt: 1 }}>
              <Button size="small" component={RouterLink} to={`/people/applicants?stage=&job=${job.slug}`}>
                {job.application_count} applied
              </Button>
              <Box sx={{ flex: 1 }} />
              <Button size="small" variant="outlined" onClick={() => setEditing(job)}>
                Edit
              </Button>
            </Box>
          </Box>
        ))}
      </Box>

      <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
        The careers file (YAML / JSON)
      </Typography>
      <Typography variant="body2" sx={{ color: ccTokens.ink2, mb: 1.5, maxWidth: 760 }}>
        One file holds the page text, the form questions, every role and the emails (auto-reply, your alert, the Not now
        drafts). Work on it with any AI: <b>Copy for AI</b>, paste into the chat, say what you want, and paste the answer
        back with <b>Update from YAML</b>. Or let Dash ask the AI directly. You see every change before Save.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyForAi} disabled={!careers.data}>
          Copy for AI
        </Button>
        <Button variant="outlined" onClick={() => setFileMode('paste')}>
          Update from YAML / JSON
        </Button>
        <Button variant="outlined" onClick={() => setFileMode('ai')}>
          Draft with AI
        </Button>
        <Button startIcon={<DownloadIcon />} onClick={exportYaml} disabled={!careers.data}>
          Export YAML
        </Button>
      </Box>

      <JobDialog
        open={editing !== null}
        job={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await refresh();
          enqueueSnackbar('Role saved', { variant: 'success' });
        }}
      />
      <CareersFileDialog
        open={fileMode !== null}
        mode={fileMode ?? 'paste'}
        onClose={() => setFileMode(null)}
        onSaved={async () => {
          setFileMode(null);
          await refresh();
          enqueueSnackbar('Careers file saved', { variant: 'success' });
        }}
      />
      <ConfirmDialog
        open={confirmPublic !== null}
        title={confirmPublic ? 'Turn the careers page on?' : 'Hide the careers page?'}
        message={
          confirmPublic
            ? 'Anyone will be able to see ecothrift.us/careers and apply. Applications and emails start right away.'
            : 'The page and the Careers links disappear. Applications already in stay in Dash.'
        }
        confirmLabel={confirmPublic ? 'Turn on' : 'Hide'}
        onConfirm={() => applyPublic(!!confirmPublic)}
        onCancel={() => setConfirmPublic(null)}
      />
    </Box>
  );
}
