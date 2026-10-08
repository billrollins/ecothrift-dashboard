import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  EMAIL_TEMPLATES,
  TEXT_TEMPLATES,
  getCareers,
  getJobs,
  saveCareers,
  updateJob,
  type Job,
  type OfferSettings,
} from '../../api/hiring.api';
import { PageHeader } from '../../components/common/PageHeader';
import { ccTokens } from '../../theme';
import { AiHelpBar } from './AiHelpBar';
import { TextTemplatePanel } from './TextsPanel';
import { errorText } from './peopleUi';

type Block = { subject: string; body: string };

// The emails, then the applicant texts (Phase 6) as their own group; a text's key is "text.<careers texts key>".
const TEXT_TO = 'Applicant (only if they ticked the text box)';
const ITEMS: { key: string; label: string; group: string; to: string; when: string }[] = [
  ...EMAIL_TEMPLATES,
  { key: 'text.opt_in', group: 'Texts', label: 'Texts confirmation (fixed)', to: TEXT_TO, when: 'The first text, before any other.' },
  ...TEXT_TEMPLATES.map((t) => ({ key: `text.${t.key}`, group: 'Texts', label: t.label, to: TEXT_TO, when: t.when })),
];

const COMMON = ['first_name', 'last_name', 'roles', 'phone', 'email', 'review_day', 'reply_days'];
const INTERVIEW = ['when', 'place', 'interviewer', 'link', 'link_days', 'length'];
const OFFER = [
  'first_name', 'full_name', 'role', 'pay_rate', 'employment_type', 'start_date', 'start_time', 'schedule',
  'supervisor', 'respond_by', 'note', 'offer_date', 'signer_name', 'signer_title',
];

function placeholdersFor(key: string): string[] {
  if (key === 'first_day') return ['first_name', 'role', 'start_date', 'start_time', 'supervisor', 'place'];
  if (key === 'offer_letter') return OFFER;
  if (key === 'offer_notice') return [...OFFER, 'applicant', 'action', 'reason', 'link', 'dash_link'];
  if (key.startsWith('offer_')) return [...OFFER, 'link'];
  if (key === 'alert') return [...COMMON, 'flags', 'dash_link'];
  if (key === 'interview_notice') return [...COMMON, ...INTERVIEW, 'applicant', 'action', 'dash_link'];
  if (key.startsWith('interview_')) return [...COMMON, ...INTERVIEW];
  return COMMON;
}

const SAMPLE: Record<string, string> = {
  first_name: 'Dana',
  last_name: 'Miles',
  phone: '402-555-0101',
  email: 'dana@example.com',
  when: 'Thursday, October 8 at 2:00 PM',
  place: 'our Canfield store, 8425 West Center Road, Omaha',
  interviewer: 'Carrie',
  link: 'https://ecothrift.us/careers/interview?t=…',
  link_days: '14',
  length: '30',
  applicant: 'Dana Miles',
  action: 'booked',
  flags: 'all green',
  dash_link: 'https://dash.ecothrift.us/people/applicants?id=…',
  full_name: 'Dana Miles',
  pay_rate: '15.00',
  employment_type: 'Part time',
  start_date: 'Monday, October 19, 2026',
  start_time: '9:00 AM',
  schedule: 'Saturdays and two weekdays, about 24 hours a week',
  supervisor: 'Bill Rollins',
  respond_by: 'Friday, October 9, 2026',
  note: '',
  offer_date: 'Tuesday, October 6, 2026',
  reason: 'Took another job closer to home.',
};

function fillSample(text: string, values: Record<string, string>): string {
  // Blank lines left by an empty placeholder fold up, as they do in the real email.
  return text.replace(/\{([a-z_]+)\}/g, (all, name: string) => values[name] ?? all).replace(/\n{3,}/g, '\n\n');
}

function universalOf(email: Record<string, unknown> | undefined, key: string): Block {
  if (!email) return { subject: '', body: '' };
  if (key.startsWith('not_now.')) {
    const blocks = (email.not_now ?? {}) as Record<string, Block>;
    return blocks[key.slice('not_now.'.length)] ?? blocks.default ?? { subject: '', body: '' };
  }
  return (email[key] as Block) ?? { subject: '', body: '' };
}

const MAILBOXES = ['retail@ecothrift.us', 'bill_rollins@ecothrift.us', 'warehouse@ecothrift.us'];

const addressList = (raw: unknown) =>
  String(raw ?? '')
    .split(/[,;]/)
    .map((a) => a.replace(/^.*</, '').replace(/>.*$/, '').trim().toLowerCase())
    .filter(Boolean);

function SenderCard({ email, mailboxes }: { email: Record<string, unknown>; mailboxes: string[] }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const pick = () => ({
    from: addressList(email.from)[0] ?? mailboxes[0],
    reply_to: addressList(email.reply_to)[0] ?? '',
    notify: addressList(email.notify),
    review_day: String(email.review_day ?? ''),
    reply_days: String(email.reply_days ?? '7'),
  });
  const [draft, setDraft] = useState(pick);
  useEffect(() => setDraft(pick()), [email]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = JSON.stringify(draft) !== JSON.stringify(pick());
  // A saved address that is no longer a store mailbox still shows, so the select never goes blank.
  const options = (...current: string[]) => [...mailboxes, ...current.filter((a) => a && !mailboxes.includes(a))];

  async function save() {
    try {
      await saveCareers({
        format: 'ecothrift.careers/1',
        email: { ...draft, notify: draft.notify.join(', '), reply_days: Number(draft.reply_days) || 5 },
      });
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar('Email settings saved', { variant: 'success' });
    } catch (err) {
      const data = (err as { response?: { data?: { errors?: string[] } } }).response?.data;
      enqueueSnackbar(data?.errors?.join(' ') || errorText(err, 'Could not save.'), { variant: 'error' });
    }
  }

  return (
    <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card, mb: 2.5 }}>
      <Typography fontWeight={700} sx={{ mb: 1.5 }}>
        Who it comes from, and where replies go
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <TextField select size="small" label="Send from" value={draft.from} fullWidth
          helperText="Every hiring email, as Eco-Thrift"
          onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}>
          {options(draft.from).map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Replies go to" value={draft.reply_to} fullWidth
          helperText="When an applicant presses Reply"
          onChange={(e) => setDraft((d) => ({ ...d, reply_to: e.target.value }))}>
          {options(draft.reply_to).map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="New-application alerts to" value={draft.notify} fullWidth
          helperText="Pick one or more. Each role's hiring manager gets them too."
          SelectProps={{
            multiple: true,
            displayEmpty: true,
            renderValue: (v) => (v as string[]).join(', ') || 'Only the hiring managers',
          }}
          InputLabelProps={{ shrink: true }}
          onChange={(e) => {
            const v = e.target.value as unknown as string[] | string;
            setDraft((d) => ({ ...d, notify: typeof v === 'string' ? v.split(',') : v }));
          }}>
          {options(...draft.notify).map((a) => (
            <MenuItem key={a} value={a}>
              <Checkbox size="small" checked={draft.notify.includes(a)} sx={{ p: 0.5, mr: 1 }} />
              {a}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mt: 1.5 }}>
        <TextField size="small" label="{review_day}: we read applications…" value={draft.review_day} fullWidth
          onChange={(e) => setDraft((d) => ({ ...d, review_day: e.target.value }))} />
        <TextField size="small" label="{reply_days}: business days" value={draft.reply_days} sx={{ minWidth: 200 }}
          onChange={(e) => setDraft((d) => ({ ...d, reply_days: e.target.value }))} />
        <Button variant="contained" disabled={!changed} onClick={save} sx={{ whiteSpace: 'nowrap' }}>
          Save settings
        </Button>
      </Stack>
    </Box>
  );
}

/** The letter's own rules: who signs for Eco-Thrift, reply-by days, what they tick, the e-sign consent. */
function OfferSettingsCard({ offer }: { offer: OfferSettings }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const pick = () => ({
    signer_name: offer.signer_name ?? '',
    signer_title: offer.signer_title ?? '',
    respond_days: String(offer.respond_days ?? 3),
    acknowledgments: (offer.acknowledgments ?? []).join('\n'),
    consent: offer.consent ?? '',
  });
  const [draft, setDraft] = useState(pick);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(pick()), [offer]); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = JSON.stringify(draft) !== JSON.stringify(pick());
  const field = (name: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => ({ ...d, [name]: e.target.value }));

  async function save() {
    setBusy(true);
    try {
      await saveCareers({
        format: 'ecothrift.careers/1',
        offer: {
          signer_name: draft.signer_name,
          signer_title: draft.signer_title,
          respond_days: Number(draft.respond_days) || 3,
          acknowledgments: draft.acknowledgments.split('\n').map((l) => l.trim()).filter(Boolean),
          consent: draft.consent,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar('Offer settings saved', { variant: 'success' });
    } catch (err) {
      const data = (err as { response?: { data?: { errors?: string[] } } }).response?.data;
      enqueueSnackbar(data?.errors?.join(' ') || errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: '#fafaf7', mb: 2 }}>
      <Typography fontWeight={700}>Offer settings (all roles)</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        They tick every line below, agree to sign electronically, type their name and sign with a finger. Changes
        apply to new offers; an offer already sent keeps its words.
      </Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <TextField size="small" label="{signer_name}: signs for Eco-Thrift" value={draft.signer_name} onChange={field('signer_name')} fullWidth />
        <TextField size="small" label="{signer_title}" value={draft.signer_title} onChange={field('signer_title')} fullWidth />
        <TextField size="small" label="Days to reply" value={draft.respond_days} onChange={field('respond_days')}
          inputProps={{ inputMode: 'numeric' }} sx={{ minWidth: 140 }} />
      </Stack>
      <TextField size="small" label="They tick each of these (one per line)" value={draft.acknowledgments}
        onChange={field('acknowledgments')} multiline minRows={4} fullWidth sx={{ mt: 1.5 }} />
      <TextField size="small" label="E-sign agreement (they tick this too)" value={draft.consent}
        onChange={field('consent')} multiline minRows={3} fullWidth sx={{ mt: 1.5 }} />
      <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
        <Button variant="contained" size="small" disabled={busy || !changed} onClick={save}>
          Save offer settings
        </Button>
        {changed && (
          <Button size="small" disabled={busy} onClick={() => setDraft(pick())}>
            Discard
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default function EmailsPage() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const careers = useQuery({ queryKey: ['hiring', 'careers'], queryFn: async () => (await getCareers()).data });
  const jobs = useQuery({ queryKey: ['hiring', 'jobs'], queryFn: async () => (await getJobs()).data });
  const email = careers.data?.doc.email;
  const [params] = useSearchParams();
  // ?key= (from a review screen's Edit the template) opens that email and its group.
  const asked = ITEMS.find((t) => t.key === params.get('key'));
  const [key, setKey] = useState(asked?.key ?? 'received');
  const [scope, setScope] = useState<string>(''); // '' = all roles, else a job slug
  const [draft, setDraft] = useState<Block>({ subject: '', body: '' });
  const [aiNote, setAiNote] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const job: Job | undefined = (jobs.data ?? []).find((j) => j.slug === scope);
  const roleVersion = job ? job.emails?.[key] : undefined;
  const universal = universalOf(email, key);
  const editing = !job || !!roleVersion;
  const source: Block = job ? roleVersion ?? universal : universal;
  const meta = ITEMS.find((t) => t.key === key) ?? ITEMS[0];
  const isText = key.startsWith('text.');

  useEffect(() => {
    setDraft({ subject: source.subject, body: source.body });
    setAiNote([]);
  }, [key, scope, email, jobs.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = draft.subject !== source.subject || draft.body !== source.body;
  const sample = useMemo(
    () => ({
      ...SAMPLE,
      roles: job?.title ?? 'Retail Associate',
      role: job?.title ?? 'Retail Associate',
      signer_name: careers.data?.doc.offer?.signer_name ?? 'Bill Rollins',
      signer_title: careers.data?.doc.offer?.signer_title ?? 'Owner, Eco-Thrift',
      action: key === 'offer_notice' ? 'signed' : SAMPLE.action,
      link: key.startsWith('offer_') ? 'https://ecothrift.us/careers/offer?t=…' : SAMPLE.link,
      place: key === 'first_day' ? 'our Canfield store, 8425 West Center Road, Omaha' : SAMPLE.place,
      review_day: String(email?.review_day ?? 'every business day'),
      reply_days: String(email?.reply_days ?? '5'),
    }),
    [job, email, careers.data, key],
  );

  function insert(name: string) {
    const token = `{${name}}`;
    const el = bodyRef.current;
    if (!el) return setDraft((d) => ({ ...d, body: d.body + token }));
    const at = el.selectionStart ?? draft.body.length;
    setDraft((d) => ({ ...d, body: d.body.slice(0, at) + token + d.body.slice(el.selectionEnd ?? at) }));
  }

  async function save() {
    setBusy(true);
    try {
      if (job) {
        await updateJob(job.id, { emails: { ...(job.emails ?? {}), [key]: draft } });
      } else if (key.startsWith('not_now.')) {
        await saveCareers({ format: 'ecothrift.careers/1', email: { not_now: { [key.slice(8)]: draft } } });
      } else {
        await saveCareers({ format: 'ecothrift.careers/1', email: { [key]: draft } });
      }
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar(job ? `Saved ${job.title}'s version` : 'Saved for all roles', { variant: 'success' });
    } catch (err) {
      const data = (err as { response?: { data?: { errors?: string[] } } }).response?.data;
      enqueueSnackbar(data?.errors?.join(' ') || errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function removeRoleVersion() {
    if (!job) return;
    const rest = { ...(job.emails ?? {}) };
    delete rest[key];
    setBusy(true);
    try {
      await updateJob(job.id, { emails: rest });
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar(`${job.title} uses the version for all roles again`, { variant: 'success' });
    } finally {
      setBusy(false);
    }
  }

  const groups = ['Applying', 'Interviews', 'Offers', 'Onboarding', 'Not now', 'Texts'];
  const [open, setOpen] = useState<string[]>(asked ? [asked.group] : []); // every group starts closed
  const toggle = (group: string) => setOpen((o) => (o.includes(group) ? o.filter((g) => g !== group) : [...o, group]));
  const rolesWith = (k: string) => (jobs.data ?? []).filter((j) => j.emails?.[k]).map((j) => j.title);

  return (
    <Box>
      <PageHeader
        title="Emails"
        subtitle="Every message Eco-Thrift sends about hiring. One version for all roles; give a role its own version when it needs one."
        action={
          <Button component={RouterLink} to="/people/jobs">
            Jobs & careers page
          </Button>
        }
      />
      {email && <SenderCard email={email} mailboxes={careers.data?.indexes.mailboxes ?? MAILBOXES} />}
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' } }}>
        <Box>
          {groups.map((group) => {
            const inGroup = ITEMS.filter((t) => t.group === group);
            const isOpen = open.includes(group);
            const holdsCurrent = inGroup.some((t) => t.key === key);
            return (
            <Box key={group} sx={{ mb: 0.5 }}>
              <Box
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={() => toggle(group)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle(group))}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.75, borderRadius: '8px', cursor: 'pointer',
                  '&:hover': { bgcolor: '#f4f4f0' },
                }}
              >
                <ExpandMoreIcon fontSize="small" sx={{ color: ccTokens.ink2, transition: 'transform .15s',
                  transform: isOpen ? 'none' : 'rotate(-90deg)' }} />
                <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700, flex: 1, lineHeight: 1.6 }}>
                  {group}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {holdsCurrent && !isOpen ? `${meta.label} · ` : ''}
                  {inGroup.length}
                </Typography>
              </Box>
              <Collapse in={isOpen} unmountOnExit>
              {inGroup.map((t) => {
                const own = rolesWith(t.key);
                return (
                  <Box
                    key={t.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setKey(t.key)}
                    onKeyDown={(e) => e.key === 'Enter' && setKey(t.key)}
                    sx={{
                      px: 1.5,
                      py: 1,
                      mb: 0.5,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      bgcolor: key === t.key ? ccTokens.goodTint : 'transparent',
                      '&:hover': { bgcolor: key === t.key ? ccTokens.goodTint : '#f4f4f0' },
                    }}
                  >
                    <Typography fontWeight={600} sx={{ fontSize: 14 }}>
                      {t.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      To: {t.to}
                      {own.length ? ` · own version: ${own.map((r) => r.replace(' Associate', '')).join(', ')}` : ''}
                    </Typography>
                  </Box>
                );
              })}
              </Collapse>
            </Box>
            );
          })}
        </Box>

        {isText ? (
          <TextTemplatePanel textKey={key.slice('text.'.length)} texts={careers.data?.doc.texts ?? {}} />
        ) : (
        <Box sx={{ p: 2, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="h6" fontWeight={700}>
              {meta.label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              To {meta.to}. {meta.when}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', my: 1.5 }}>
            <Chip
              label="All roles"
              color={scope === '' ? 'primary' : 'default'}
              variant={scope === '' ? 'filled' : 'outlined'}
              onClick={() => setScope('')}
            />
            {(jobs.data ?? []).map((j) => (
              <Chip
                key={j.slug}
                label={`${j.title}${j.emails?.[key] ? ' (own version)' : ''}`}
                color={scope === j.slug ? 'primary' : 'default'}
                variant={scope === j.slug ? 'filled' : 'outlined'}
                onClick={() => setScope(j.slug)}
              />
            ))}
          </Box>

          {job && !roleVersion ? (
            <Alert
              severity="info"
              sx={{ mb: 2 }}
              action={
                <Button
                  color="inherit"
                  size="small"
                  disabled={busy}
                  onClick={async () => {
                    // Starts as a copy of the version for all roles; edit it, then Save.
                    setBusy(true);
                    try {
                      await updateJob(job.id, { emails: { ...(job.emails ?? {}), [key]: universal } });
                      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
                    } catch (err) {
                      enqueueSnackbar(errorText(err, 'Could not start a role version.'), { variant: 'error' });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Give {job.title.replace(' Associate', '')} its own version
                </Button>
              }
            >
              {job.title} uses the version for all roles (shown below).
            </Alert>
          ) : null}

          {editing && (
            <Box sx={{ mb: 2 }}>
              <AiHelpBar<{ subject: string; body: string; warnings: string[] }>
                what="this email"
                payload={() => ({ kind: 'email', key, subject: draft.subject, body: draft.body, role_title: job?.title ?? '' })}
                onResult={(result) => {
                  setDraft({ subject: result.result.subject, body: result.result.body });
                  setAiNote(result.result.warnings?.length ? result.result.warnings : ['AI rewrote it. Read it, then Save.']);
                }}
              />
            </Box>
          )}
          {key === 'offer_letter' && !job && careers.data?.doc.offer && <OfferSettingsCard offer={careers.data.doc.offer} />}
          {aiNote.length > 0 && (
            <Alert severity={aiNote.length && aiNote[0].startsWith('AI rewrote') ? 'info' : 'warning'} sx={{ mb: 2 }}
              action={<Button color="inherit" size="small" onClick={() => { setDraft({ ...source }); setAiNote([]); }}>Undo</Button>}>
              {aiNote.join(' ')}
            </Alert>
          )}

          <TextField
            label="Subject"
            value={draft.subject}
            onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            fullWidth
            disabled={!editing}
            sx={{ mb: 1.5 }}
          />
          <TextField
            label="Message"
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
            inputRef={bodyRef}
            multiline
            minRows={10}
            fullWidth
            disabled={!editing}
          />
          {editing && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5, alignSelf: 'center' }}>
                Tap to insert:
              </Typography>
              {placeholdersFor(key).map((name) => (
                <Chip key={name} size="small" variant="outlined" label={`{${name}}`} onClick={() => insert(name)} />
              ))}
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            {editing && (
              <Button variant="contained" onClick={save} disabled={busy || !changed || !draft.subject.trim() || !draft.body.trim()}>
                {job ? `Save ${job.title.replace(' Associate', '')}'s version` : 'Save for all roles'}
              </Button>
            )}
            {editing && changed && (
              <Button onClick={() => setDraft({ ...source })} disabled={busy}>
                Discard changes
              </Button>
            )}
            {job && roleVersion && (
              <Button color="inherit" onClick={removeRoleVersion} disabled={busy}>
                Use the version for all roles
              </Button>
            )}
          </Box>

          <Typography variant="overline" sx={{ display: 'block', mt: 3, color: ccTokens.ink2, fontWeight: 700 }}>
            Preview (sample applicant)
          </Typography>
          <Box sx={{ p: 2, borderRadius: '8px', bgcolor: '#fafaf7', border: `1px solid ${ccTokens.line}` }}>
            <Typography fontWeight={700} sx={{ mb: 1 }}>
              {fillSample(draft.subject, sample)}
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {fillSample(draft.body, sample)}
            </Typography>
          </Box>
        </Box>
        )}
      </Box>
    </Box>
  );
}
