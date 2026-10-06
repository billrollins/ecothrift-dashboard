import {
  Alert,
  Autocomplete,
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
  getCareersBundle,
  getJobs,
  setCareersPublic,
  updateJob,
  type CareersIndexes,
  type Job,
  type Question,
} from '../../api/hiring.api';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { PageHeader } from '../../components/common/PageHeader';
import { ccTokens } from '../../theme';
import { aiCopyText, downloadJson, previewUrl } from './careersFile';
import { AiHelpBar } from './AiHelpBar';
import { CareersFileDialog } from './CareersFileDialog';
import { errorText } from './peopleUi';

const STATUS_COLOR: Record<Job['status'], 'success' | 'default' | 'warning'> = {
  open: 'success',
  draft: 'default',
  paused: 'warning',
  closed: 'default',
};

/** The bullet sections of a role page, edited one line per bullet. */
const LIST_FIELDS = [
  { key: 'duties', label: 'What you’ll do' },
  { key: 'success', label: 'What great looks like' },
  { key: 'looking_for', label: 'What we’re looking for' },
  { key: 'nice_to_have', label: 'Nice to have' },
  { key: 'physical', label: 'The physical side' },
] as const;
type ListKey = (typeof LIST_FIELDS)[number]['key'];

/** Every field AI help may change, with the name shown in "AI changed: …". */
const AI_FIELD_LABEL: Record<string, string> = {
  tagline: 'One line',
  summary: 'About the role',
  duties: 'What you’ll do',
  success: 'What great looks like',
  looking_for: 'What we’re looking for',
  nice_to_have: 'Nice to have',
  physical: 'The physical side',
  questions: 'Application question',
  interview_questions: 'Interview questions',
};

const toLines = (text: string) => text.split('\n').map((d) => d.replace(/^[-•]\s*/, '').trim()).filter(Boolean);

function keyFor(label: string, taken: Set<string>): string {
  let key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'question';
  while (taken.has(key)) key = `${key.slice(0, 36)}_${taken.size}`;
  taken.add(key);
  return key;
}

/** Lines back to questions; a question whose wording didn't change keeps its key (answers stay linked). */
function toQuestions(text: string, existing: Question[], type: Question['type'], required: boolean): Question[] {
  const byLabel = new Map(existing.map((q) => [q.label, q]));
  const taken = new Set<string>();
  return toLines(text).map((label) => {
    const old = byLabel.get(label);
    if (old && !taken.has(old.key)) {
      taken.add(old.key);
      return old;
    }
    return { key: keyFor(label, taken), label, type, required };
  });
}

type Draft = Record<ListKey, string> & {
  title: string;
  slug: string;
  tagline: string;
  summary: string;
  questions: string;
  interview_questions: string;
  works_with: string;
  schedule: string;
  hours: string;
  employment_type: Job['employment_type'];
  pay_min: string;
  pay_max: string;
  pay_text: string;
  status: Job['status'];
  sort_order: string;
  /** Ids as strings for the selects; '' = none. */
  department: string;
  hiring_manager: string;
  interviewers: number[];
};

function toDraft(job: Job | null): Draft {
  return {
    title: job?.title ?? '',
    slug: job?.slug ?? '',
    tagline: job?.tagline ?? '',
    summary: job?.summary ?? '',
    duties: (job?.duties ?? []).join('\n'),
    success: (job?.success ?? []).join('\n'),
    looking_for: (job?.looking_for ?? []).join('\n'),
    nice_to_have: (job?.nice_to_have ?? []).join('\n'),
    physical: (job?.physical ?? []).join('\n'),
    questions: (job?.questions ?? []).map((q) => q.label).join('\n'),
    interview_questions: (job?.interview_questions ?? []).map((q) => q.label).join('\n'),
    works_with: job?.works_with ?? 'Bill, the owner, and a small team',
    schedule: job?.schedule ?? '',
    hours: job?.hours ?? 'Up to 40 hours a week',
    employment_type: job?.employment_type ?? 'full_or_part',
    pay_min: job?.pay_min ?? '15.00',
    pay_max: job?.pay_max ?? '',
    pay_text: job?.pay_text ?? 'From $15/hr, set by skill',
    status: job?.status ?? 'draft',
    sort_order: String(job?.sort_order ?? 50),
    department: job?.department ? String(job.department) : '',
    hiring_manager: job?.hiring_manager ? String(job.hiring_manager) : '',
    interviewers: job?.interviewers ?? [],
  };
}

type RoleAiResult = { fields: Record<string, string | string[]>; changed: string[] };

const aiChangedSx = {
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#6d4fc2', borderWidth: 2 },
};

function JobDialog({
  open,
  job,
  indexes,
  onClose,
  onSaved,
}: {
  open: boolean;
  job: Job | null;
  indexes: CareersIndexes | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const staff = indexes?.staff ?? [];
  const [draft, setDraft] = useState<Draft>(toDraft(job));
  const [beforeAi, setBeforeAi] = useState<Draft | null>(null);
  const [aiChanged, setAiChanged] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(toDraft(job));
      setBeforeAi(null);
      setAiChanged([]);
      setError('');
    }
  }, [open, job]);

  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const changedSx = (key: string) => (aiChanged.includes(key) ? aiChangedSx : undefined);

  function aiPayload() {
    return {
      kind: 'job',
      fields: {
        title: draft.title,
        schedule: draft.schedule,
        hours: draft.hours,
        pay_text: draft.pay_text,
        works_with: draft.works_with,
        tagline: draft.tagline,
        summary: draft.summary,
        duties: toLines(draft.duties),
        success: toLines(draft.success),
        looking_for: toLines(draft.looking_for),
        nice_to_have: toLines(draft.nice_to_have),
        physical: toLines(draft.physical),
        questions: toLines(draft.questions),
        interview_questions: toLines(draft.interview_questions),
      },
    };
  }

  function applyAi(result: RoleAiResult) {
    setBeforeAi((prev) => prev ?? draft);
    setDraft((d) => {
      const next = { ...d };
      for (const [key, value] of Object.entries(result.fields)) {
        if (key in next) (next as Record<string, unknown>)[key] = Array.isArray(value) ? value.join('\n') : value;
      }
      return next;
    });
    setAiChanged(result.changed);
  }

  async function save() {
    setBusy(true);
    setError('');
    const payload: Partial<Job> = {
      title: draft.title.trim(),
      slug: draft.slug.trim() || draft.title.trim(),
      tagline: draft.tagline.trim(),
      summary: draft.summary.trim(),
      duties: toLines(draft.duties),
      success: toLines(draft.success),
      looking_for: toLines(draft.looking_for),
      nice_to_have: toLines(draft.nice_to_have),
      physical: toLines(draft.physical),
      questions: toQuestions(draft.questions, job?.questions ?? [], 'long_text', true),
      interview_questions: toQuestions(draft.interview_questions, job?.interview_questions ?? [], 'text', false),
      works_with: draft.works_with.trim(),
      schedule: draft.schedule.trim(),
      hours: draft.hours.trim(),
      employment_type: draft.employment_type,
      pay_min: draft.pay_min.trim() || null,
      pay_max: draft.pay_max.trim() || null,
      pay_text: draft.pay_text.trim(),
      status: draft.status,
      sort_order: Number(draft.sort_order) || 0,
      department: draft.department ? Number(draft.department) : null,
      hiring_manager: draft.hiring_manager ? Number(draft.hiring_manager) : null,
      interviewers: draft.interviewers,
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
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{job ? `Edit ${job.title}` : 'New role'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <AiHelpBar<RoleAiResult>
            what="this role"
            payload={aiPayload}
            disabled={!draft.title.trim()}
            onResult={(result) => applyAi(result.result)}
          />
          {aiChanged.length > 0 && (
            <Alert
              severity="info"
              action={
                beforeAi && (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      setDraft(beforeAi);
                      setBeforeAi(null);
                      setAiChanged([]);
                    }}
                  >
                    Undo AI changes
                  </Button>
                )
              }
            >
              AI changed: {aiChanged.map((k) => AI_FIELD_LABEL[k] ?? k).join(', ')} (outlined in purple). Read them,
              edit if you like, then Save. Nothing is saved yet.
            </Alert>
          )}
          {aiChanged.length === 0 && beforeAi && (
            <Alert severity="info">The AI suggested no changes.</Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Title" value={draft.title} onChange={set('title')} fullWidth required />
            <TextField select label="Status" value={draft.status} onChange={set('status')} sx={{ minWidth: 140 }}>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="paused">Paused</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
            </TextField>
          </Stack>
          <TextField label="One line (tagline)" value={draft.tagline} onChange={set('tagline')} fullWidth sx={changedSx('tagline')} />
          <TextField label="About the role (2–3 sentences)" value={draft.summary} onChange={set('summary')} multiline minRows={2}
            fullWidth sx={changedSx('summary')} />
          {LIST_FIELDS.map((field) => (
            <TextField
              key={field.key}
              label={`${field.label} (one per line)`}
              value={draft[field.key]}
              onChange={set(field.key)}
              multiline
              minRows={field.key === 'duties' ? 4 : 2}
              fullWidth
              sx={changedSx(field.key)}
            />
          ))}
          <TextField
            label="Application question for this role (one per line)"
            helperText="Shown on the apply form when someone ticks this role. Required to answer."
            value={draft.questions}
            onChange={set('questions')}
            multiline
            minRows={1}
            fullWidth
            sx={changedSx('questions')}
          />
          <TextField
            label="Interview questions (one per line)"
            helperText="The scorecard asks these, each with 1–5 stars and a note."
            value={draft.interview_questions}
            onChange={set('interview_questions')}
            multiline
            minRows={3}
            fullWidth
            sx={changedSx('interview_questions')}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Hiring manager"
              value={draft.hiring_manager}
              onChange={set('hiring_manager')}
              helperText="Gets an email for each new application"
              fullWidth
            >
              <MenuItem value="">None (only the careers file's notify address)</MenuItem>
              {staff.map((p) => (
                <MenuItem key={p.id} value={String(p.id)}>
                  {p.name} ({p.role})
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Department" value={draft.department} onChange={set('department')} fullWidth>
              <MenuItem value="">None</MenuItem>
              {(indexes?.departments ?? []).map((d) => (
                <MenuItem key={d.id} value={String(d.id)}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Autocomplete
            multiple
            options={staff}
            value={staff.filter((p) => draft.interviewers.includes(p.id))}
            getOptionLabel={(p) => `${p.name} (${p.role})`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, people) => setDraft((d) => ({ ...d, interviewers: people.map((p) => p.id) }))}
            renderInput={(params) => (
              <TextField {...params} label="Interviewers" helperText="Who sits in this role's interviews (changeable per interview)" />
            )}
          />
          <TextField label="Works with" value={draft.works_with} onChange={set('works_with')} fullWidth />
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

  /** The bundle is fetched fresh each time, so its staff and departments lists are current. */
  async function downloadForAi() {
    try {
      const { data } = await getCareersBundle();
      downloadJson(data, `ecothrift-careers-for-ai-${new Date().toISOString().slice(0, 10)}.json`);
      enqueueSnackbar('Downloaded. Give the file to any AI with what you want changed, then upload its answer here.', {
        variant: 'success',
        autoHideDuration: 8000,
      });
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not build the file.'), { variant: 'error' });
    }
  }

  async function copyForAi() {
    try {
      const { data } = await getCareersBundle();
      await navigator.clipboard.writeText(aiCopyText(data));
      enqueueSnackbar('Copied. Paste it into any AI chat, write what you want changed, then paste the answer back here.', {
        variant: 'success',
        autoHideDuration: 8000,
      });
    } catch {
      enqueueSnackbar('Could not copy. Use Download for AI instead.', { variant: 'error' });
    }
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
            <Typography variant="caption" sx={{ color: job.hiring_manager_person ? ccTokens.ink : ccTokens.warnText }}>
              <b>Hiring manager:</b> {job.hiring_manager_person?.name ?? 'not set'}
            </Typography>
            <Typography variant="caption" sx={{ color: ccTokens.ink2 }}>
              <b>Interviewers:</b>{' '}
              {job.interviewer_people.length ? job.interviewer_people.map((p) => p.name).join(', ') : 'not set'}
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
        Everything in one JSON (for AI)
      </Typography>
      <Typography variant="body2" sx={{ color: ccTokens.ink2, mb: 1.5, maxWidth: 780 }}>
        One file holds all of hiring: the careers page, the screener questions on the application, every role (with its
        hiring manager and interviewers), and the emails. <b>Download for AI</b> gives you that file with the
        instructions and the keys an AI needs (staff emails, departments, question types). Give it to any AI, then{' '}
        <b>Upload JSON</b> with its answer. Or <b>Ask AI in Dash</b>. Either way you see every change before Save.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<DownloadIcon />} onClick={downloadForAi}>
          Download for AI (.json)
        </Button>
        <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyForAi}>
          Copy for AI
        </Button>
        <Button variant="outlined" onClick={() => setFileMode('paste')}>
          Upload or paste JSON
        </Button>
        <Button variant="outlined" onClick={() => setFileMode('ai')}>
          Ask AI in Dash
        </Button>
      </Box>

      <JobDialog
        open={editing !== null}
        indexes={careers.data?.indexes}
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
        ai={careers.data?.ai}
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
