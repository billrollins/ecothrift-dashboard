import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  MenuItem,
  Rating,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import EmailOutlined from '@mui/icons-material/EmailOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  addNote,
  bookInterviewForApplicant,
  getApplication,
  getResumeBlob,
  inviteToInterview,
  remindToBook,
  previewBookInterview,
  previewInvite,
  previewRemindToBook,
  setRating,
  setStage,
  stopTexts,
  uploadResume,
  type AnswerEntry,
  type ApplicationDetail,
  type Job,
  type Option,
  type Stage,
} from '../../api/hiring.api';
import { ccTokens } from '../../theme';
import { CreateEmployeeDialog, NotNowDialog } from './ApplicantDialogs';
import { useEmailReview } from './EmailReview';
import { FlagDots } from './FlagDots';
import { InterviewCard, PickTimeDialog } from './interviewUi';
import { OfferCard, OfferDialog } from './offerUi';
import { StartOnboardingDialog } from './onboardingUi';
import { PracticeChip } from './PracticeDialog';
import { answerText, errorText, phoneHref, shortDate, STAGE_LABEL, STAGES } from './peopleUi';
import { IconBack as ArrowBackIcon, IconClose as CloseIcon } from '../../icons/ecoIcons';

const card = { p: { xs: 2, md: 2.5 }, borderRadius: ccTokens.r, border: `1px solid ${ccTokens.line}`, bgcolor: ccTokens.card };

/** A titled block. ``fold``: on a phone it opens and closes (answers are long; the next step is not). */
function Section({
  title,
  count,
  fold = false,
  defaultOpen = true,
  action,
  children,
}: {
  title: string;
  count?: number;
  fold?: boolean;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <>
      <Typography variant="overline" sx={{ color: ccTokens.ink2, fontWeight: 700, letterSpacing: '.08em', lineHeight: 1.8 }}>
        {title}
        {count !== undefined ? ` · ${count}` : ''}
      </Typography>
      {fold && (
        <ExpandMoreIcon fontSize="small" sx={{ color: ccTokens.ink3, transition: 'transform .15s', transform: open ? 'none' : 'rotate(-90deg)' }} />
      )}
    </>
  );
  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
        {fold ? (
          <ButtonBase onClick={() => setOpen((o) => !o)} aria-expanded={open} sx={{ gap: 0.5, borderRadius: ccTokens.rSm, minHeight: 36 }}>
            {head}
          </ButtonBase>
        ) : (
          head
        )}
        <Box sx={{ flex: 1 }} />
        {action}
      </Box>
      {fold ? <Collapse in={open}>{children}</Collapse> : children}
    </Box>
  );
}

function AnswerRow({ entry }: { entry: AnswerEntry }) {
  return (
    <Box sx={{ py: 1, borderBottom: `1px solid ${ccTokens.line}`, '&:last-child': { borderBottom: 0 } }}>
      <Typography variant="caption" sx={{ color: ccTokens.ink2, display: 'block', lineHeight: 1.35 }}>
        {entry.label}
      </Typography>
      <Typography sx={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{answerText(entry.answer)}</Typography>
    </Box>
  );
}

/** An email on the history: tap to read the exact words that went out. */
function SentEmail({
  subject,
  body,
  typedOver,
  what = 'email',
}: {
  subject: string;
  body: string;
  typedOver: string[];
  what?: 'email' | 'text';
}) {
  const [open, setOpen] = useState(false);
  return (
    <Box>
      <ButtonBase onClick={() => setOpen((o) => !o)} sx={{ fontSize: 12, color: ccTokens.brand, fontWeight: 600, borderRadius: 1 }}>
        {open ? `Hide the ${what}` : `See the ${what}`}
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ mt: 0.5, p: 1.25, borderRadius: ccTokens.rSm, bgcolor: '#fafaf7', border: `1px solid ${ccTokens.line}` }}>
          {subject && (
            <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
              {subject}
            </Typography>
          )}
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
            {body}
          </Typography>
          {typedOver.length > 0 && (
            <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: ccTokens.warnText }}>
              Typed over (not from Dash): {typedOver.join(', ').replace(/_/g, ' ')}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

const STEP_TEXT: Partial<Record<Stage, string>> = {
  new: 'Read their answers. If they fit, send the interview link (or mark them Reviewed to come back later).',
  reviewed: 'Send the interview link. They pick a time on their phone and it lands here.',
  contacted: 'Waiting for them to pick a time. Nudge them with the link by text if it has been a few days.',
  interviewed: 'Decide: make them an offer, or Not now.',
};

export function ApplicantView({
  id,
  jobs,
  reasons,
  narrow,
  onBack,
}: {
  id: number;
  jobs: Job[];
  reasons: Option[];
  /** Phone layout: a top bar with Back, one column, Call / Text / Email / Resume fixed at the bottom. */
  narrow: boolean;
  onBack: () => void;
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
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { review, dialog: reviewDialog } = useEmailReview();

  const detail = useQuery({ queryKey: ['hiring', 'application', id], queryFn: async () => (await getApplication(id)).data });
  const app = detail.data;

  const answerGroups = useMemo(() => {
    if (!app) return [];
    const shared = app.answers.filter((a) => !a.job && a.must_be === undefined);
    const byJob = new Map<string, AnswerEntry[]>();
    app.answers.filter((a) => a.job).forEach((a) => byJob.set(a.job!, [...(byJob.get(a.job!) ?? []), a]));
    const title = (slug: string) => jobs.find((j) => j.slug === slug)?.title ?? slug;
    return [
      { title: 'Answers', rows: shared },
      ...[...byJob.entries()].map(([slug, rows]) => ({ title: `For ${title(slug)}`, rows })),
    ].filter((g) => g.rows.length > 0);
  }, [app, jobs]);

  async function refreshWith(updated: ApplicationDetail) {
    queryClient.setQueryData(['hiring', 'application', id], updated);
    await queryClient.invalidateQueries({ queryKey: ['hiring', 'applications'] });
    await queryClient.invalidateQueries({ queryKey: ['hiring', 'counts'] });
  }

  /** After an interview or offer change: reload this applicant and every hiring list. */
  async function reloadAll() {
    await queryClient.invalidateQueries({ queryKey: ['hiring'] });
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

  async function emailLink() {
    if (!app) return;
    setBusy(true);
    try {
      const data = await review({
        title: 'Email the interview link',
        preview: () => previewInvite(app.id),
        commit: async (email) => (await inviteToInterview(app.id, true, email)).data,
      });
      if (!data) return; // Cancel: nothing sent
      await refreshWith(data.application);
      enqueueSnackbar(data.sent ? `Interview link emailed to ${app.email}.` : 'The email did not send. Use Copy link and text it.', {
        variant: data.sent ? 'success' : 'warning',
      });
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not send the link.'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function remindLink() {
    if (!app) return;
    setBusy(true);
    try {
      const data = await review({
        title: "Remind them to book (Don't miss out)",
        preview: () => previewRemindToBook(app.id),
        commit: async (email) => (await remindToBook(app.id, email)).data,
      });
      if (!data) return; // Cancel: nothing sent
      await refreshWith(data.application);
      enqueueSnackbar(data.sent ? `Reminder emailed to ${app.email}.` : 'The email did not send. Use Copy link and text it.', {
        variant: data.sent ? 'success' : 'warning',
      });
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not send the reminder.'), { variant: 'error' });
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
      enqueueSnackbar('Interview link copied. Paste it in a text.', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(errorText(err, 'Could not copy the link.'), { variant: 'error' });
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

  const tel = phoneHref(app.phone);
  const scheduled = app.interviews.find((i) => i.status === 'scheduled');
  const newestOffer = app.offers[0];
  const openOffer = app.offers.find((o) => o.status === 'sent' || o.status === 'viewed');
  const signedOffer = app.offers.find((o) => o.status === 'signed');
  const featuredOffer = app.stage === 'offer' || app.stage === 'hired' ? (openOffer ?? signedOffer ?? newestOffer) : undefined;
  // The interview to act on sits in the next step: the one coming up, or (to decide) the one just done.
  const featuredInterview =
    app.stage === 'interview_scheduled' ? scheduled : app.stage === 'interviewed' ? app.interviews.find((i) => i.status === 'done') : undefined;
  const otherInterviews = app.interviews.filter((i) => i !== featuredInterview);
  const otherOffers = app.offers.filter((o) => o !== featuredOffer);
  const closed = app.stage === 'hired' || app.stage === 'not_now';
  // They have the link but no interview: the optional "Don't miss out" email leads (Bill, 2026-10-09).
  const canRemind = Boolean(app.invited_at && app.email && !scheduled);
  const linkButtons = (primary: 'email' | 'copy', book = true) => (
    <>
      {canRemind && (
        <Button variant="contained" color="warning" disabled={busy} onClick={remindLink}>
          Remind them to book
        </Button>
      )}
      <Button variant={primary === 'email' && !canRemind ? 'contained' : 'outlined'} disabled={busy || !app.email} onClick={emailLink}>
        {app.invited_at ? 'Email the link again' : 'Email interview link'}
      </Button>
      <Button variant={primary === 'copy' && !canRemind ? 'contained' : 'outlined'} disabled={busy} onClick={copyLink}>
        Copy link to text
      </Button>
      {book && !scheduled && (
        <Button disabled={busy} onClick={() => setBooking(true)}>
          Book a time for them
        </Button>
      )}
    </>
  );
  const notNowButton = !closed && (
    <Button color="inherit" disabled={busy} onClick={() => setNotNowOpen(true)}>
      Not now
    </Button>
  );

  // ── The next step: what to do with this person now ────────────────────────
  let step: React.ReactNode;
  if (app.stage === 'new') {
    step = (
      <>
        {linkButtons('email', false)}
        <Button disabled={busy} onClick={() => void run(() => setStage(app.id, 'reviewed'), 'Could not move the stage.')}>
          Mark reviewed
        </Button>
        {notNowButton}
      </>
    );
  } else if (app.stage === 'reviewed') {
    step = (
      <>
        {linkButtons('email')}
        {notNowButton}
      </>
    );
  } else if (app.stage === 'contacted') {
    step = (
      <>
        {linkButtons('copy')}
        {notNowButton}
      </>
    );
  } else if (app.stage === 'interview_scheduled') {
    step = scheduled ? null : (
      <>
        {linkButtons('email')}
        {notNowButton}
      </>
    );
  } else if (app.stage === 'interviewed') {
    step = (
      <>
        <Button variant="contained" disabled={busy} onClick={() => setOffering(true)}>
          Make offer
        </Button>
        {!scheduled && (
          <Button disabled={busy} onClick={() => setBooking(true)}>
            Book another interview
          </Button>
        )}
        {notNowButton}
      </>
    );
  } else if (app.stage === 'offer') {
    step = (
      <>
        {signedOffer && !app.employee && !app.is_practice && (
          <Button variant="contained" onClick={() => setEmployeeOpen(true)}>
            Create employee in Dash
          </Button>
        )}
        {!openOffer && !signedOffer && (
          <Button variant="contained" disabled={busy} onClick={() => setOffering(true)}>
            Make offer
          </Button>
        )}
        {openOffer && (
          <Button disabled={busy} onClick={() => setOffering(true)}>
            Make a new offer
          </Button>
        )}
        {notNowButton}
      </>
    );
  } else if (app.stage === 'hired') {
    step = !app.employee && !app.is_practice ? (
      <Button variant="contained" onClick={() => setEmployeeOpen(true)}>
        Create employee in Dash
      </Button>
    ) : null;
  }

  const stepText =
    app.stage === 'contacted' && app.invited_at
      ? `Link sent ${shortDate(app.invited_at)}. ${STEP_TEXT.contacted}`
      : app.stage === 'offer' && signedOffer && !app.employee
        ? 'They signed. Make them an employee in Dash, then start onboarding.'
        : app.stage === 'offer' && openOffer
          ? 'Waiting for them to read and sign the offer on their phone.'
          : STEP_TEXT[app.stage];

  const stageSelect = (
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
      sx={{ minWidth: 190, bgcolor: '#fff' }}
    >
      {STAGES.map((s) => (
        <MenuItem key={s.key} value={s.key}>
          {s.label}
        </MenuItem>
      ))}
    </TextField>
  );
  const rating = (
    <Rating
      value={app.rating}
      disabled={busy}
      size={narrow ? 'large' : 'medium'}
      onChange={(_, value) => void run(() => setRating(app.id, value), 'Could not save the rating.')}
    />
  );

  const nextStep = (
    <Box sx={{ ...card, mt: 2.5, bgcolor: app.stage === 'not_now' ? ccTokens.neuTint : ccTokens.goodTint, border: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="overline" sx={{ color: app.stage === 'not_now' ? ccTokens.ink2 : ccTokens.goodText, fontWeight: 700, letterSpacing: '.08em', flex: 1 }}>
          {app.stage === 'not_now' ? 'Not now' : app.stage === 'hired' ? 'Hired' : `Next step · ${STAGE_LABEL[app.stage]}`}
        </Typography>
        {!narrow && stageSelect}
      </Box>
      {stepText && <Typography sx={{ mt: 0.5, fontSize: 15 }}>{stepText}</Typography>}

      {featuredInterview && (
        <Box sx={{ mt: 1.25 }}>
          <InterviewCard
            interview={featuredInterview}
            onChanged={reloadAll}
            onNoShow={() => {
              setNotNowReason('no_show');
              setNotNowOpen(true);
            }}
          />
        </Box>
      )}
      {featuredOffer && (
        <Box sx={{ mt: 1.25 }}>
          <OfferCard
            offer={featuredOffer}
            onChanged={reloadAll}
            onDeclinedNotNow={() => {
              setNotNowReason('offer_declined');
              setNotNowOpen(true);
            }}
          />
        </Box>
      )}
      {app.stage === 'not_now' && (
        <Typography sx={{ mt: 0.5, fontSize: 15 }}>
          {app.not_now_reason_label} (at {STAGE_LABEL[app.not_now_stage] || 'New'})
          {app.not_now_note ? `. ${app.not_now_note}` : ''}. Email:{' '}
          {app.not_now_email_status === 'sent' ? 'sent' : app.not_now_email_status === 'failed' ? 'could not send' : 'not sent'}.
        </Typography>
      )}
      {app.employee && (
        <Box sx={{ mt: 1.25, p: 1.5, borderRadius: ccTokens.rSm, bgcolor: '#fff' }}>
          <Typography fontWeight={700}>
            Employee {app.employee.employee_number} · {app.employee.position} · ${app.employee.pay_rate}/hr
          </Typography>
          <Typography variant="body2" sx={{ color: ccTokens.ink2 }}>
            Starts {app.employee.hire_date}
            {app.onboarding
              ? ` · onboarding ${app.onboarding.done} of ${app.onboarding.total} done${app.onboarding.overdue ? `, ${app.onboarding.overdue} overdue` : ''}`
              : ''}
          </Typography>
          <Box sx={{ mt: 1 }}>
            {app.onboarding ? (
              <Button size="small" variant="outlined" component={RouterLink} to={`/people/onboarding?id=${app.onboarding.id}`}>
                Open onboarding
              </Button>
            ) : (
              <Button size="small" variant="contained" onClick={() => setOnboardingOpen(true)}>
                Start onboarding
              </Button>
            )}
          </Box>
        </Box>
      )}
      {app.is_practice && (
        <Typography variant="body2" sx={{ mt: 1, color: ccTokens.ink2 }}>
          Practice run: its emails say [Practice], its interview never takes a real time, and Create employee is off.
        </Typography>
      )}
      {step && (
        <Box
          sx={{
            mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1,
            '& .MuiButton-root': narrow ? { minHeight: 44, flex: '1 1 auto' } : {},
            '& .MuiButton-contained': narrow ? { flexBasis: '100%' } : {},
            '& .MuiButton-text': { bgcolor: narrow ? 'rgba(255,255,255,.6)' : undefined },
          }}
        >
          {step}
        </Box>
      )}
      {narrow && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 2, pt: 1.5, borderTop: `1px solid rgba(0,0,0,.08)`, flexWrap: 'wrap' }}>
          {stageSelect}
          {rating}
        </Box>
      )}
    </Box>
  );

  const mustHaves = app.flags.length > 0 && (
    <Section title="Must-haves">
      <Box sx={card}>
        <FlagDots flags={app.flags} showLabels />
      </Box>
    </Section>
  );

  const answers = answerGroups.map((group) => (
    <Section key={group.title} title={group.title} count={group.rows.length} fold={narrow} defaultOpen={!narrow || group.title === 'Answers'}>
      <Box sx={{ ...card, py: 0.5 }}>
        {group.rows.map((entry) => (
          <AnswerRow key={entry.key} entry={entry} />
        ))}
      </Box>
    </Section>
  ));

  const interviews = otherInterviews.length > 0 && (
    <Section
      title={featuredInterview ? 'Other interviews' : 'Interviews'}
      count={otherInterviews.length}
    >
      <Stack spacing={1}>
        {otherInterviews.map((interview) => (
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
      </Stack>
    </Section>
  );

  const offers = otherOffers.length > 0 && (
    <Section title="Earlier offers" count={otherOffers.length}>
      <Stack spacing={1}>
        {otherOffers.map((offer) => (
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
      </Stack>
    </Section>
  );

  const notes = (
    <Section title="Notes and history" count={app.events.length}>
      <Box sx={card}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <TextField
            size="small"
            placeholder="Add a note: called, left a message, went well…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            maxRows={6}
            fullWidth
          />
          <Button
            variant="contained"
            disabled={busy || !note.trim()}
            sx={{ minHeight: 40 }}
            onClick={async () => {
              if (await run(() => addNote(app.id, note), 'Could not save the note.')) setNote('');
            }}
          >
            Add
          </Button>
        </Box>
        <Box sx={{ mt: 1.5 }}>
          {app.events.map((event, i) => (
            <Box key={event.id} sx={{ position: 'relative', pl: 2.25, pb: 1.25 }}>
              {i < app.events.length - 1 && (
                <Box sx={{ position: 'absolute', left: 4, top: 12, bottom: 0, width: 2, bgcolor: ccTokens.line }} />
              )}
              <Box
                sx={{
                  position: 'absolute', left: 0, top: 6, width: 10, height: 10, borderRadius: '50%',
                  bgcolor: event.kind === 'note' ? ccTokens.kraft : event.kind === 'stage' ? ccTokens.brand : ccTokens.line2,
                }}
              />
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontWeight: event.kind === 'note' ? 600 : 400 }}>
                {event.kind === 'stage' && !event.text
                  ? `${STAGE_LABEL[event.from_stage] ?? event.from_stage} → ${STAGE_LABEL[event.to_stage] ?? event.to_stage}`
                  : event.text || event.kind_label}
              </Typography>
              {(event.kind === 'email' || event.kind === 'text') && typeof event.data?.body === 'string' && event.data.body && (
                <SentEmail
                  subject={String(event.data.subject ?? '')}
                  body={String(event.data.body)}
                  typedOver={Array.isArray(event.data.typed_over) ? (event.data.typed_over as string[]) : []}
                  what={event.kind === 'text' ? 'text' : 'email'}
                />
              )}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {event.by_name || (event.kind === 'email' || event.kind === 'text' ? 'Dash' : 'Applicant')} ·{' '}
                {new Date(event.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Section>
  );

  // Texts (Phase 6): whether Dash may text them, and a way to record that they asked it to stop.
  const texting = app.texting;
  const textingText = {
    agreed: `OK to text: ticked the box${texting?.at ? ` ${new Date(texting.at).toLocaleDateString()}` : ''}`,
    stopped: `Asked not to be texted (${texting?.how || 'recorded'})`,
    never: 'Did not tick the text box: no texts',
    no_number: 'No mobile number: no texts',
  }[texting?.state ?? 'never'];
  const details = (
    <Box sx={{ mt: 2 }}>
      {texting && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <SmsOutlined sx={{ fontSize: 18, color: texting.state === 'agreed' ? ccTokens.goodText : ccTokens.ink3 }} />
          <Typography variant="body2" sx={{ color: ccTokens.ink2 }}>
            {textingText}
            {texting.state === 'agreed' && !texting.first_day
              ? ' (interview texts only: an older tick; a first-day text needs the new tick on the offer page)'
              : ''}
            {texting.state === 'agreed' && texting.waiting_on.length > 0 ? '. Texting is not live yet, so texts are held.' : ''}
          </Typography>
          {texting.state === 'agreed' && (
            <Button
              size="small"
              color="inherit"
              disabled={busy}
              onClick={() => {
                if (window.confirm('Record that they asked not to be texted? Dash will not text them again.'))
                  void run(() => stopTexts(app.id), 'Could not record it.');
              }}
            >
              They asked: stop texts
            </Button>
          )}
        </Box>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {app.received_email_sent ? 'Auto-reply sent. ' : ''}
        {app.resume_file ? `Resume: ${app.resume_file.filename}.` : ''}
      </Typography>
    </Box>
  );

  const contact = [
    tel && { key: 'call', label: 'Call', icon: <PhoneOutlined />, href: `tel:${tel}` },
    tel && { key: 'text', label: 'Text', icon: <SmsOutlined />, href: `sms:${tel}` },
    app.email && { key: 'email', label: 'Email', icon: <EmailOutlined />, href: `mailto:${app.email}` },
    app.resume_file
      ? { key: 'resume', label: 'Resume', icon: <DescriptionOutlined />, onClick: openResume }
      : { key: 'resume', label: 'Add resume', icon: <DescriptionOutlined />, onClick: () => fileInput.current?.click() },
  ].filter(Boolean) as { key: string; label: string; icon: React.ReactNode; href?: string; onClick?: () => void }[];

  const chips = (
    <>
      {app.is_practice && <PracticeChip sx={{ ml: 1, verticalAlign: 'middle' }} />}
      {app.lead_interest === 'Yes' && (
        <Chip size="small" label="Wants to lead" sx={{ ml: 1, verticalAlign: 'middle', fontWeight: 700, bgcolor: ccTokens.kraftTint, color: ccTokens.kraftDeep }} />
      )}
    </>
  );
  const subline = `${app.jobs.map((j) => j.title).join(' · ')} · applied ${shortDate(app.created_at)} · ${app.source_label}`;

  return (
    <Box sx={{ pb: narrow ? 12 : 4 }}>
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

      {narrow ? (
        <>
          <Box
            sx={{
              // The main area's 24px padding: stick flush under the app bar.
              position: 'sticky', top: '-24px', zIndex: 5, mx: -1.5, px: 0.5, py: 0.5, display: 'flex', alignItems: 'center', gap: 0.5,
              bgcolor: 'rgba(255,255,255,.96)', backdropFilter: 'blur(6px)', borderBottom: `1px solid ${ccTokens.line}`,
            }}
          >
            <IconButton onClick={onBack} aria-label="Back to applicants" sx={{ width: 44, height: 44 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography noWrap sx={{ flex: 1, fontWeight: 700, fontSize: 17 }}>
              {app.full_name}
            </Typography>
            <Chip size="small" label={app.stage_label} sx={{ mr: 1, fontWeight: 600 }} />
          </Box>
          <Box sx={{ pt: 2 }}>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              {app.full_name}
              {chips}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {subline}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: ccTokens.ink2, wordBreak: 'break-word' }}>
              {[app.phone, app.email].filter(Boolean).join(' · ') || 'No phone or email'}
            </Typography>
          </Box>
          {nextStep}
          {mustHaves}
          {answers}
          {interviews}
          {offers}
          {notes}
          {details}
          <Box
            sx={{
              position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1100, display: 'grid',
              gridTemplateColumns: `repeat(${contact.length}, 1fr)`, bgcolor: '#fff', borderTop: `1px solid ${ccTokens.line}`,
              pb: 'env(safe-area-inset-bottom)', boxShadow: '0 -4px 16px rgba(34,39,31,.06)',
            }}
          >
            {contact.map((c) => {
              const sx = { flexDirection: 'column', gap: 0.25, py: 1, minHeight: 60, color: ccTokens.brandDeep, fontSize: 12, fontWeight: 600 } as const;
              return c.href ? (
                <ButtonBase key={c.key} component="a" href={c.href} sx={sx}>
                  {c.icon}
                  {c.label}
                </ButtonBase>
              ) : (
                <ButtonBase key={c.key} onClick={c.onClick} sx={sx}>
                  {c.icon}
                  {c.label}
                </ButtonBase>
              );
            })}
          </Box>
        </>
      ) : (
        <>
          <Box sx={{ ...card, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.15 }}>
                {app.full_name}
                {chips}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>
                {subline}
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: ccTokens.ink2 }}>
                {[app.phone, app.email].filter(Boolean).join(' · ') || 'No phone or email'}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', rowGap: 1 }}>
                {contact.map((c) => (
                  <Button
                    key={c.key}
                    size="small"
                    variant="outlined"
                    startIcon={c.icon}
                    {...(c.href ? { href: c.href } : { onClick: c.onClick })}
                  >
                    {c.label}
                  </Button>
                ))}
              </Stack>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <IconButton onClick={onBack} aria-label="Close" sx={{ mt: -1, mr: -1 }}>
                <CloseIcon />
              </IconButton>
              <Box sx={{ mt: 1 }}>{rating}</Box>
            </Box>
          </Box>
          {nextStep}
          <Box sx={{ display: 'grid', gridTemplateColumns: { md: 'minmax(0, 1fr)', lg: 'minmax(0, 1.5fr) minmax(300px, 1fr)' }, columnGap: 3 }}>
            <Box sx={{ minWidth: 0 }}>
              {mustHaves}
              {answers}
              {interviews}
              {offers}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              {notes}
              {details}
            </Box>
          </Box>
        </>
      )}

      {reviewDialog}
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
        application={app.id}
        confirmLabel="Book it"
        onClose={() => setBooking(false)}
        onPick={async (start) => {
          let emailed = true;
          const booked = await review({
            title: `Book the interview for ${app.first_name}`,
            preview: () => previewBookInterview(app.id, start),
            commit: async (email, text) => {
              emailed = !(email && 'skip' in email);
              return (await bookInterviewForApplicant(app.id, start, email, text)).data;
            },
            sendLabel: 'Book and send',
            skipLabel: 'Book without emailing',
          });
          if (!booked) return; // Cancel: back to the times, nothing booked
          setBooking(false);
          await reloadAll();
          enqueueSnackbar(
            emailed ? 'Interview booked. They got an email with the time and their change / cancel link.' : 'Interview booked. No email went to them.',
            { variant: 'success' },
          );
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
      <StartOnboardingDialog
        open={onboardingOpen}
        applicationId={app.id}
        defaults={{ name: app.full_name, email: app.email }}
        onClose={() => setOnboardingOpen(false)}
        onDone={async (_detail, sent) => {
          setOnboardingOpen(false);
          await reloadAll();
          enqueueSnackbar(sent ? `Onboarding started; the first-day email went to ${app.email}.` : 'Onboarding started.', { variant: 'success' });
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
