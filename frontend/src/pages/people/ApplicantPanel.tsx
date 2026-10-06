import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Rating,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import EmailOutlined from '@mui/icons-material/EmailOutlined';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useMemo, useRef, useState } from 'react';
import {
  addNote,
  getApplication,
  getResumeBlob,
  setRating,
  setStage,
  uploadResume,
  bookInterviewForApplicant,
  inviteToInterview,
  type AnswerEntry,
  type ApplicationDetail,
  type Job,
  type Option,
  type Stage,
} from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { CreateEmployeeDialog, NotNowDialog } from './ApplicantDialogs';
import { InterviewCard, PickTimeDialog } from './interviewUi';
import { OfferCard, OfferDialog } from './offerUi';
import { PracticeChip } from './PracticeDialog';
import { FlagDots } from './FlagDots';
import { answerText, errorText, nextStage, phoneHref, shortDate, STAGE_LABEL, STAGES } from './peopleUi';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mt: 2.5 }}>
      <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700, letterSpacing: '.08em' }}>
        {title}
      </Typography>
      <Box sx={{ mt: 0.5 }}>{children}</Box>
    </Box>
  );
}

function AnswerRow({ entry }: { entry: AnswerEntry }) {
  const flagged = entry.must_be !== undefined;
  const color = !flagged ? ccTokens.ink : entry.ok === false ? ccTokens.badText : entry.ok ? ccTokens.goodText : ccTokens.ink2;
  return (
    <Box sx={{ py: 0.9, borderBottom: `1px solid ${ccTokens.line}` }}>
      <Typography variant="caption" sx={{ color: ccTokens.ink2, display: 'block', lineHeight: 1.35 }}>
        {entry.label}
      </Typography>
      <Typography variant="body2" sx={{ color, fontWeight: flagged ? 700 : 400, whiteSpace: 'pre-wrap' }}>
        {answerText(entry.answer)}
      </Typography>
    </Box>
  );
}

export function ApplicantPanel({
  id,
  jobs,
  reasons,
  onClose,
}: {
  id: number;
  jobs: Job[];
  reasons: Option[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notNowOpen, setNotNowOpen] = useState(false);
  const [notNowReason, setNotNowReason] = useState('');
  const [employeeOpen, setEmployeeOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [offering, setOffering] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const detail = useQuery({
    queryKey: ['hiring', 'application', id],
    queryFn: async () => (await getApplication(id)).data,
  });
  const app = detail.data;

  const groups = useMemo(() => {
    if (!app) return [];
    const shared = app.answers.filter((a) => !a.job);
    const byJob = new Map<string, AnswerEntry[]>();
    app.answers.filter((a) => a.job).forEach((a) => byJob.set(a.job!, [...(byJob.get(a.job!) ?? []), a]));
    const title = (slug: string) => jobs.find((j) => j.slug === slug)?.title ?? slug;
    return [
      { title: 'Answers', rows: shared.filter((a) => a.must_be === undefined) },
      ...[...byJob.entries()].map(([slug, rows]) => ({ title: `For ${title(slug)}`, rows })),
    ].filter((g) => g.rows.length > 0);
  }, [app, jobs]);

  async function refreshWith(updated: ApplicationDetail) {
    queryClient.setQueryData(['hiring', 'application', id], updated);
    await queryClient.invalidateQueries({ queryKey: ['hiring', 'applications'] });
    await queryClient.invalidateQueries({ queryKey: ['hiring', 'counts'] });
  }

  /** After an interview change: reload this applicant and every interview list. */
  async function reloadAll() {
    await queryClient.invalidateQueries({ queryKey: ['hiring'] });
  }

  async function emailLink() {
    if (!app) return;
    setBusy(true);
    try {
      const { data } = await inviteToInterview(app.id, true);
      await refreshWith(data.application);
      enqueueSnackbar(
        data.sent ? `Interview link emailed to ${app.email}.` : 'The email did not send. Use Copy link and text it.',
        { variant: data.sent ? 'success' : 'warning' },
      );
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not send the link.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!app) return;
    setBusy(true);
    try {
      let link = app.booking_link;
      if (!link) {
        const { data } = await inviteToInterview(app.id, false);
        link = data.link;
        await refreshWith(data.application);
      }
      await navigator.clipboard.writeText(link);
      enqueueSnackbar('Interview link copied. Paste it in a text from your phone.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not copy the link.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function run(action: () => Promise<{ data: ApplicationDetail }>, fallback: string) {
    setBusy(true);
    try {
      const { data } = await action();
      await refreshWith(data);
      return true;
    } catch (err) {
      enqueueSnackbar(errorText(err, fallback), { variant: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openResume() {
    if (!app) return;
    const popup = window.open('', '_blank');
    try {
      const { data } = await getResumeBlob(app.id);
      const url = URL.createObjectURL(data);
      const viewable = /pdf|image\/(jpeg|png|webp)/.test(app.resume_file?.content_type ?? '');
      if (viewable && popup) {
        popup.location.href = url;
      } else {
        popup?.close();
        const a = document.createElement('a');
        a.href = url;
        a.download = app.resume_file?.filename || 'resume';
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      popup?.close();
      enqueueSnackbar(errorText(err, 'Could not open the resume.'), { variant: 'error' });
    }
  }

  if (detail.isLoading || !app) {
    return (
      <Box sx={{ p: 4, display: 'grid', placeItems: 'center' }}>
        {detail.isError ? <Alert severity="error">Could not load this applicant.</Alert> : <CircularProgress />}
      </Box>
    );
  }

  const next = nextStage(app.stage);
  const tel = phoneHref(app.phone);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, pb: 6 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
            {app.full_name}
            {app.is_practice && <PracticeChip sx={{ ml: 1, verticalAlign: 'middle' }} />}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {app.jobs.map((j) => j.title).join(' · ')} · applied {shortDate(app.created_at)} · {app.source_label}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </Box>

      <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', rowGap: 1 }}>
        {tel && (
          <Button size="small" variant="outlined" startIcon={<PhoneOutlined />} href={`tel:${tel}`}>
            Call
          </Button>
        )}
        {tel && (
          <Button size="small" variant="outlined" startIcon={<SmsOutlined />} href={`sms:${tel}`}>
            Text
          </Button>
        )}
        {app.email && (
          <Button size="small" variant="outlined" startIcon={<EmailOutlined />} href={`mailto:${app.email}`}>
            Email
          </Button>
        )}
        {app.resume_file ? (
          <Button size="small" variant="outlined" startIcon={<DescriptionOutlined />} onClick={openResume}>
            Resume
          </Button>
        ) : (
          <Button size="small" startIcon={<DescriptionOutlined />} onClick={() => fileInput.current?.click()}>
            Add resume
          </Button>
        )}
        <input
          ref={fileInput}
          type="file"
          hidden
          accept=".pdf,.doc,.docx,image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run(() => uploadResume(app.id, file), 'Could not add the resume.');
          }}
        />
      </Stack>
      <Typography variant="body2" sx={{ mt: 1, color: ccTokens.ink2 }}>
        {app.phone || 'No phone'} · {app.email || 'No email'}
        {app.sms_consent ? ' · OK to text' : ''}
      </Typography>

      <Box
        sx={{
          mt: 2.5,
          p: 2,
          borderRadius: ccTokens.r,
          bgcolor: app.stage === 'not_now' ? ccTokens.neuTint : ccTokens.goodTint,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <TextField
            select
            size="small"
            label="Stage"
            value={app.stage}
            disabled={busy}
            onChange={(e) => {
              const stage = e.target.value as Stage;
              if (stage === 'not_now') setNotNowOpen(true);
              else void run(() => setStage(app.id, stage), 'Could not move the stage.');
            }}
            sx={{ minWidth: 200, bgcolor: '#fff' }}
          >
            {STAGES.map((s) => (
              <MenuItem key={s.key} value={s.key}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
          {next && app.stage !== 'not_now' && (
            <Button variant="contained" disabled={busy} onClick={() => void run(() => setStage(app.id, next), 'Could not move the stage.')}>
              → {STAGE_LABEL[next]}
            </Button>
          )}
          {app.stage !== 'not_now' && app.stage !== 'hired' && (
            <Button color="inherit" disabled={busy} onClick={() => setNotNowOpen(true)}>
              Not now
            </Button>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ color: ccTokens.ink2 }}>
            Rating
          </Typography>
          <Rating
            value={app.rating}
            disabled={busy}
            onChange={(_, value) => void run(() => setRating(app.id, value), 'Could not save the rating.')}
          />
        </Box>
        {app.stage === 'not_now' && (
          <Typography variant="body2">
            <b>Not now:</b> {app.not_now_reason_label} (at {STAGE_LABEL[app.not_now_stage] || 'New'})
            {app.not_now_note ? `. ${app.not_now_note}` : ''}. Email:{' '}
            {app.not_now_email_status === 'sent'
              ? 'sent'
              : app.not_now_email_status === 'failed'
                ? 'could not send'
                : "not sent (Don't send)"}
            .
          </Typography>
        )}
        {app.is_practice && (
          <Typography variant="body2" sx={{ color: ccTokens.ink2 }}>
            Practice run: its emails say [Practice], its interview never takes a real applicant&rsquo;s time, and
            Create employee is off. Delete it from Practice run on the Applicants page.
          </Typography>
        )}
        {(app.stage === 'offer' || app.stage === 'hired') && !app.employee && !app.is_practice && (
          <Button variant="outlined" sx={{ alignSelf: 'flex-start', bgcolor: '#fff' }} onClick={() => setEmployeeOpen(true)}>
            Create employee in Dash
          </Button>
        )}
        {app.employee && (
          <Alert severity="success" variant="outlined" sx={{ bgcolor: '#fff' }}>
            Employee {app.employee.employee_number} · {app.employee.position} · ${app.employee.pay_rate}/hr · starts{' '}
            {app.employee.hire_date}. Next: add them in QuickBooks Payroll (name, phone, email).
          </Alert>
        )}
      </Box>

      <Section title="Interview">
        {app.stage !== 'hired' && app.stage !== 'not_now' && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.25 }}>
            <Button size="small" variant="outlined" disabled={busy || !app.email} onClick={emailLink}>
              {app.invited_at ? 'Email the link again' : 'Email interview link'}
            </Button>
            <Button size="small" variant="outlined" disabled={busy} onClick={copyLink}>
              Copy link (to text)
            </Button>
            {!app.interviews.some((i) => i.status === 'scheduled') && (
              <Button size="small" disabled={busy} onClick={() => setBooking(true)}>
                Book for them
              </Button>
            )}
          </Box>
        )}
        {app.invited_at && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Link sent {shortDate(app.invited_at)}. They pick a time themselves; it lands here and in People → Interviews.
          </Typography>
        )}
        <Stack spacing={1}>
          {app.interviews.map((interview) => (
            <InterviewCard
              key={interview.id}
              interview={interview}
              onChanged={reloadAll}
              onNoShow={() => {
                setNotNowReason('no_show');
                setNotNowOpen(true);
              }}
            />
          ))}
          {app.interviews.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No interview yet.
            </Typography>
          )}
        </Stack>
      </Section>

      {(['interview_scheduled', 'interviewed', 'offer', 'hired'].includes(app.stage) || app.offers.length > 0) && (
        <Section title="Offer">
          {app.stage !== 'not_now' && !app.offers.some((o) => o.status === 'signed') && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.25 }}>
              <Button size="small" variant="contained" disabled={busy} onClick={() => setOffering(true)}>
                {app.offers.some((o) => o.status === 'sent' || o.status === 'viewed') ? 'Make a new offer' : 'Make offer'}
              </Button>
            </Box>
          )}
          <Stack spacing={1}>
            {app.offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                onChanged={reloadAll}
                onDeclinedNotNow={() => {
                  setNotNowReason('offer_declined');
                  setNotNowOpen(true);
                }}
              />
            ))}
            {app.offers.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No offer yet. They sign it on their phone; the signed PDF lands here.
              </Typography>
            )}
          </Stack>
        </Section>
      )}

      {app.flags.length > 0 && (
        <Section title="Must-haves">
          <FlagDots flags={app.flags} showLabels />
        </Section>
      )}

      {groups.map((group) => (
        <Section key={group.title} title={group.title}>
          {group.rows.map((entry) => (
            <AnswerRow key={entry.key} entry={entry} />
          ))}
        </Section>
      ))}

      <Section title="Notes and history">
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            size="small"
            placeholder="Add a note (called, left a message, interview went well…)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            maxRows={6}
            fullWidth
          />
          <Button
            variant="contained"
            disabled={busy || !note.trim()}
            onClick={async () => {
              if (await run(() => addNote(app.id, note), 'Could not save the note.')) setNote('');
            }}
          >
            Add
          </Button>
        </Box>
        <Box sx={{ mt: 1.5 }}>
          {app.events.map((event) => (
            <Box key={event.id} sx={{ py: 1, borderBottom: `1px solid ${ccTokens.line}` }}>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {event.kind === 'stage' && !event.text
                  ? `${STAGE_LABEL[event.from_stage] ?? event.from_stage} → ${STAGE_LABEL[event.to_stage] ?? event.to_stage}`
                  : event.text || event.kind_label}
              </Typography>
              {event.kind === 'email' && typeof event.data?.body === 'string' && event.data.body && (
                <Tooltip title={<span style={{ whiteSpace: 'pre-wrap' }}>{String(event.data.body)}</span>}>
                  <Typography variant="caption" sx={{ textDecoration: 'underline dotted', cursor: 'help' }}>
                    see the email
                  </Typography>
                </Tooltip>
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {event.by_name || 'Applicant'} · {new Date(event.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </Typography>
            </Box>
          ))}
        </Box>
      </Section>

      <Divider sx={{ my: 3 }} />
      <Typography variant="caption" color="text.secondary">
        {app.received_email_sent ? 'Auto-reply sent. ' : ''}
        {app.sms_consent && app.sms_consent_at
          ? `Agreed to texts ${new Date(app.sms_consent_at).toLocaleDateString()}. `
          : 'Did not tick the text box. '}
      </Typography>

      <NotNowDialog
        open={notNowOpen}
        application={app}
        reasons={reasons}
        initialReason={notNowReason}
        onClose={() => {
          setNotNowOpen(false);
          setNotNowReason('');
        }}
        onDone={async (updated) => {
          setNotNowOpen(false);
          setNotNowReason('');
          await refreshWith(updated);
          enqueueSnackbar(`${updated.full_name}: Not now`, { variant: 'success' });
        }}
      />
      <PickTimeDialog
        open={booking}
        title={`Book an interview for ${app.full_name}`}
        confirmLabel="Book it"
        onClose={() => setBooking(false)}
        onPick={async (start) => {
          await bookInterviewForApplicant(app.id, start);
          setBooking(false);
          await reloadAll();
          enqueueSnackbar('Interview booked. They got an email with the time and their change / cancel link.', {
            variant: 'success',
          });
        }}
      />
      <OfferDialog
        open={offering}
        application={app}
        onClose={() => setOffering(false)}
        onDone={async (updated, message) => {
          setOffering(false);
          await refreshWith(updated);
          enqueueSnackbar(message, { variant: 'success', autoHideDuration: 9000 });
        }}
      />
      <CreateEmployeeDialog
        open={employeeOpen}
        application={app}
        onClose={() => setEmployeeOpen(false)}
        onDone={async (updated, message) => {
          setEmployeeOpen(false);
          await refreshWith(updated);
          enqueueSnackbar(message, { variant: 'success', autoHideDuration: 9000 });
        }}
      />
    </Box>
  );
}
