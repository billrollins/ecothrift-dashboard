import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Drawer,
  IconButton,
  LinearProgress,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  cancelOnboarding,
  getCareers,
  getHandbook,
  getOnboarding,
  getOnboardingPasswordLink,
  getOnboardings,
  publishHandbook,
  saveCareers,
  previewFirstDayEmail,
  sendFirstDayEmail,
  setOnboardingTask,
  type OnboardingDetail,
  type OnboardingRow,
  type OnboardingTask,
} from '../../api/hiring.api';
import { PageHeader } from '../../components/common/PageHeader';
import { SetPasswordLinkDialog } from '../../components/users/SetPasswordLinkDialog';
import { useAuth } from '../../hooks/useAuth';
import { ccTokens } from '../../theme';
import { useEmailReview } from './EmailReview';
import { Checklist, CountDialog, HandbookText, I9Dialog, openHandbookPdf, StartOnboardingDialog } from './onboardingUi';
import { dayText, errorText, shortDate } from './peopleUi';
import { IconClose as CloseIcon } from '../../icons/ecoIcons';

function Row({ row, selected, onOpen }: { row: OnboardingRow; selected: boolean; onOpen: () => void }) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      sx={{
        px: 2,
        py: 1.5,
        cursor: 'pointer',
        bgcolor: selected ? ccTokens.goodTint : ccTokens.card,
        borderBottom: `1px solid ${ccTokens.line}`,
        '&:hover': { bgcolor: selected ? ccTokens.goodTint : '#fafaf7' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography fontWeight={700} sx={{ flex: 1 }} noWrap>
          {row.user.name}
        </Typography>
        {row.overdue > 0 && <Chip size="small" color="error" label={`${row.overdue} overdue`} sx={{ height: 20, fontSize: 11 }} />}
        {row.status !== 'active' && <Chip size="small" label={row.status_label} sx={{ height: 20, fontSize: 11 }} />}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {row.position || 'New hire'} · first day {dayText(row.start_date)}
        {row.next_due && row.status === 'active' ? ` · next due ${dayText(row.next_due)}` : ''}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
        <LinearProgress variant="determinate" value={row.total ? (100 * row.done) / row.total : 0} sx={{ flex: 1, height: 6, borderRadius: 3 }} />
        <Typography variant="caption" sx={{ color: ccTokens.ink2 }}>
          {row.done}/{row.total}
        </Typography>
      </Box>
    </Box>
  );
}

function Panel({ id, onClose }: { id: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const detail = useQuery({ queryKey: ['hiring', 'onboarding', id], queryFn: async () => (await getOnboarding(id)).data });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [countTask, setCountTask] = useState<OnboardingTask | null>(null);
  const [i9Open, setI9Open] = useState(false);
  const [passwordFor, setPasswordFor] = useState<number | null>(null);
  const { review, dialog: reviewDialog } = useEmailReview();
  const o = detail.data;

  async function commit(next: OnboardingDetail) {
    queryClient.setQueryData(['hiring', 'onboarding', id], next);
    await queryClient.invalidateQueries({ queryKey: ['hiring', 'onboardings'] });
  }

  async function setStatus(task: OnboardingTask, status: 'open' | 'done' | 'skipped') {
    setBusyId(task.id);
    try {
      const { data } = await setOnboardingTask(id, task.id, { status });
      await commit(data);
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  if (detail.isLoading || !o) {
    return (
      <Box sx={{ p: 4, display: 'grid', placeItems: 'center' }}>
        {detail.isError ? <Alert severity="error">Could not load this onboarding.</Alert> : <CircularProgress />}
      </Box>
    );
  }
  const active = o.status === 'active';

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, pb: 6 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            {o.user.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {o.position || 'New hire'} · first day {dayText(o.start_date)}
            {o.start_time ? ` at ${o.start_time.slice(0, 5)}` : ''} · manager {o.manager?.name ?? '—'}
          </Typography>
          <Typography variant="body2" sx={{ color: ccTokens.ink2 }}>
            Dash sign-in: {o.user.username || '—'}
            {o.user.last_login ? ' · has signed in' : o.user.has_password ? ' · password set' : ' · no password yet'}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
        <Button size="small" variant="contained" onClick={() => setPasswordFor(o.user.id)}>
          Set password code
        </Button>
        {active && (
          <Button
            size="small"
            variant="outlined"
            onClick={async () => {
              try {
                const data = await review({
                  title: 'Email the first-day note',
                  preview: () => previewFirstDayEmail(o.id),
                  commit: async (email) => (await sendFirstDayEmail(o.id, email)).data,
                });
                if (!data) return; // Cancel: nothing sent
                await commit(data.onboarding);
                enqueueSnackbar(data.sent ? `First-day email sent to ${o.user.email}.` : 'The email did not send.', {
                  variant: data.sent ? 'success' : 'warning',
                });
              } catch (err) {
                enqueueSnackbar(errorText(err, 'Could not send.'), { variant: 'error' });
              }
            }}
          >
            {o.first_day_email_sent_at ? 'Email the first-day note again' : 'Email the first-day note'}
          </Button>
        )}
        {o.application && (
          <Button size="small" component={RouterLink} to={`/people/applicants?stage=&id=${o.application}`}>
            Their application
          </Button>
        )}
        {active && (
          <Button
            size="small"
            color="inherit"
            onClick={async () => {
              if (!window.confirm('Cancel this onboarding? The checklist stays on record.')) return;
              try {
                await commit((await cancelOnboarding(o.id)).data);
              } catch (err) {
                enqueueSnackbar(errorText(err, 'Could not cancel.'), { variant: 'error' });
              }
            }}
          >
            Cancel onboarding
          </Button>
        )}
      </Box>
      {o.first_day_email_sent_at && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          First-day email sent {shortDate(o.first_day_email_sent_at)}.
        </Typography>
      )}

      <Box sx={{ mt: 2.5 }}>
        <Checklist
          tasks={o.tasks}
          busyId={busyId}
          canTick={(t) => active && (t.kind === 'tick' || t.kind === 'count')}
          onTick={(task, done) => {
            if (done && task.kind === 'count') setCountTask(task);
            else void setStatus(task, done ? 'done' : 'open');
          }}
          onSkip={active ? (task, skip) => void setStatus(task, skip ? 'skipped' : 'open') : undefined}
          extra={(task) => {
            if (task.kind === 'i9')
              return o.i9.can_open ? (
                <Button size="small" sx={{ mt: 0.5 }} onClick={() => setI9Open(true)}>
                  {o.i9.done ? 'Open the I-9' : 'Upload the I-9 and finish Section 2'}
                </Button>
              ) : (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Only an Admin opens the I-9.
                </Typography>
              );
            if (task.kind === 'handbook' && o.handbook)
              return (
                <Button size="small" sx={{ mt: 0.5 }} onClick={() => openHandbookPdf(o.handbook!.signature, (m) => enqueueSnackbar(m, { variant: 'error' }))}>
                  Signed handbook v{o.handbook.version} (PDF)
                </Button>
              );
            if (task.kind === 'handbook')
              return (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  They read and sign it in Dash: My onboarding.
                </Typography>
              );
            if (task.auto === 'dash_login' && task.status === 'open')
              return (
                <Button size="small" sx={{ mt: 0.5 }} onClick={() => setPasswordFor(o.user.id)}>
                  Show the set password code
                </Button>
              );
            if (task.auto === 'kiosk_badge' && task.status === 'open')
              return (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  An Admin issues it: Admin → Users → {o.user.name} → Badge.
                </Typography>
              );
            if (task.auto === 'schedule' && task.status === 'open')
              return (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  Give them a shift: Admin → Shifts.
                </Typography>
              );
            return null;
          }}
        />
      </Box>

      <CountDialog task={countTask} onboardingId={o.id} onClose={() => setCountTask(null)} onDone={async (next) => { setCountTask(null); await commit(next); }} />
      {i9Open && <I9Dialog onboarding={o} onClose={() => setI9Open(false)} onChanged={() => void detail.refetch()} />}
      <SetPasswordLinkDialog
        userId={passwordFor}
        name={o.user.name}
        onClose={() => {
          setPasswordFor(null);
          void detail.refetch();
        }}
        fetchLink={() => getOnboardingPasswordLink(o.id)}
      />
      {reviewDialog}
    </Box>
  );
}

function HandbookTab() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const isAdmin = Boolean(user?.is_superuser || user?.role === 'Admin');
  const state = useQuery({ queryKey: ['hiring', 'handbook'], queryFn: async () => (await getHandbook()).data });
  const careers = useQuery({ queryKey: ['hiring', 'careers'], queryFn: async () => (await getCareers()).data });
  const [draft, setDraft] = useState({ title: '', text: '', acknowledgment: '' });
  const [busy, setBusy] = useState(false);
  const saved = state.data?.draft;
  useEffect(() => {
    if (saved) setDraft({ ...saved });
  }, [saved]);
  const changed = !!saved && JSON.stringify(draft) !== JSON.stringify(saved);
  const marks = (draft.title + draft.text + draft.acknowledgment).split('[confirm').length - 1;

  async function save() {
    setBusy(true);
    try {
      await saveCareers({ format: 'ecothrift.careers/1', handbook: draft });
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar('Handbook draft saved', { variant: 'success' });
    } catch (err) {
      const data = (err as { response?: { data?: { errors?: string[] } } }).response?.data;
      enqueueSnackbar(data?.errors?.join(' ') || errorText(err, 'Could not save.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!window.confirm('Publish this as the next version? New hires sign it in Dash.')) return;
    setBusy(true);
    try {
      const { data } = await publishHandbook();
      await queryClient.invalidateQueries({ queryKey: ['hiring'] });
      enqueueSnackbar(`Handbook version ${data.version} published`, { variant: 'success' });
    } catch (err) {
      const data = (err as { response?: { data?: { detail?: string } } }).response?.data;
      enqueueSnackbar(data?.detail || errorText(err, 'Could not publish.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (!state.data || !careers.data) return <CircularProgress />;
  return (
    <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
      <Box>
        {marks > 0 ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {marks} fact{marks === 1 ? '' : 's'} still marked [confirm: …]. Settle each one, take the mark out, save, then
            publish. Have the attorney read it before the first signature.
          </Alert>
        ) : (
          <Alert severity="info" sx={{ mb: 2 }}>
            No [confirm] marks left. {isAdmin ? 'Publish it when the attorney has read it.' : 'An Admin publishes it.'}
          </Alert>
        )}
        <TextField label="Title" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} fullWidth sx={{ mb: 1.5 }} />
        <TextField
          label="The handbook (## for a heading, - for a bullet, a blank line between paragraphs)"
          value={draft.text}
          onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
          multiline
          minRows={18}
          fullWidth
          sx={{ mb: 1.5 }}
        />
        <TextField
          label="What they tick to sign"
          value={draft.acknowledgment}
          onChange={(e) => setDraft((d) => ({ ...d, acknowledgment: e.target.value }))}
          multiline
          minRows={2}
          fullWidth
        />
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Button variant="contained" disabled={busy || !changed} onClick={save}>
            Save draft
          </Button>
          {changed && (
            <Button disabled={busy} onClick={() => setDraft({ ...saved! })}>
              Discard
            </Button>
          )}
          {isAdmin && (
            <Button variant="outlined" disabled={busy || changed || marks > 0 || !state.data.draft_changed} onClick={publish}>
              Publish as version {(state.data.versions[0]?.version ?? 0) + 1}
            </Button>
          )}
        </Stack>
        <Typography variant="overline" sx={{ display: 'block', mt: 3, color: ccTokens.ink2, fontWeight: 700 }}>
          Published versions
        </Typography>
        {state.data.versions.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            None yet. Until one is published, the handbook item waits.
          </Typography>
        )}
        {state.data.versions.map((v) => (
          <Typography key={v.version} variant="body2">
            Version {v.version} · {shortDate(v.published_at)} · {v.signatures} signed
          </Typography>
        ))}
      </Box>
      <Box sx={{ p: 2.5, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: '#fafaf7' }}>
        <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700 }}>
          Preview
        </Typography>
        <HandbookText title={draft.title} text={draft.text} />
        <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
          ☐ {draft.acknowledgment}
        </Typography>
      </Box>
    </Box>
  );
}

export default function OnboardingPage() {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const { enqueueSnackbar } = useSnackbar();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'active' | 'done' | 'handbook'>((params.get('tab') as 'active' | 'done' | 'handbook') || 'active');
  const [startOpen, setStartOpen] = useState(false);
  const openId = Number(params.get('id')) || null;
  const list = useQuery({
    queryKey: ['hiring', 'onboardings', tab],
    queryFn: async () => (await getOnboardings(tab === 'done' ? 'done' : 'active')).data,
    enabled: tab !== 'handbook',
  });

  function open(id: number | null) {
    const next = new URLSearchParams(params);
    if (id) next.set('id', String(id));
    else next.delete('id');
    setParams(next, { replace: true });
  }

  const rows = list.data ?? [];
  const panel = openId ? <Panel key={openId} id={openId} onClose={() => open(null)} /> : null;

  return (
    <Box>
      <PageHeader
        title="Onboarding"
        subtitle="Each new hire's first weeks: the first-day email, then a checklist that runs to done. Overdue items show in red."
        action={
          <Button variant="contained" onClick={() => setStartOpen(true)}>
            Start onboarding
          </Button>
        }
      />
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: `1px solid ${ccTokens.line}`, mb: 2 }}>
        <Tab value="active" label="In progress" />
        <Tab value="done" label="Done" />
        <Tab value="handbook" label="Handbook" />
      </Tabs>
      {tab === 'handbook' ? (
        <HandbookTab />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: wide && openId ? 'minmax(0, 1fr) 520px' : '1fr', gap: 2 }}>
          <Box sx={{ border: `1px solid ${ccTokens.line}`, borderRadius: ccTokens.r, overflow: 'hidden', bgcolor: ccTokens.card, alignSelf: 'start' }}>
            {list.isLoading && <Typography sx={{ p: 3 }} color="text.secondary">Loading…</Typography>}
            {!list.isLoading && rows.length === 0 && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography fontWeight={600}>Nobody here</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {tab === 'active'
                    ? 'Onboarding starts from an applicant (Create employee) or with Start onboarding.'
                    : 'Finished onboardings land here.'}
                </Typography>
              </Box>
            )}
            {rows.map((row) => (
              <Row key={row.id} row={row} selected={row.id === openId} onOpen={() => open(row.id)} />
            ))}
          </Box>
          {wide && openId && (
            <Box sx={{ border: `1px solid ${ccTokens.line}`, borderRadius: ccTokens.r, bgcolor: ccTokens.card, alignSelf: 'start', position: 'sticky', top: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
              {panel}
            </Box>
          )}
        </Box>
      )}
      {!wide && (
        <Drawer anchor="bottom" open={!!openId && tab !== 'handbook'} onClose={() => open(null)} PaperProps={{ sx: { height: '92vh', borderRadius: '16px 16px 0 0' } }}>
          {panel}
        </Drawer>
      )}
      <StartOnboardingDialog
        open={startOpen}
        onClose={() => setStartOpen(false)}
        onDone={(detail, sent) => {
          setStartOpen(false);
          setTab('active');
          enqueueSnackbar(sent ? `Onboarding started; the first-day email went to ${detail.user.email}.` : 'Onboarding started.', { variant: 'success' });
          open(detail.id);
        }}
      />
    </Box>
  );
}
