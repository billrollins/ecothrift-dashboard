/**
 * HR → Requests (Bill, Dash Updates #59, 2026-11-03): every HR request in one place. Anyone asks for a day off or new
 * times (the Schedule's requests, #60 and #61) or asks HR a question, and sees all of their own requests with the
 * answer: those two plus their time-change requests (asked from Me → Hours & pay). Whoever answers a kind sees
 * everyone's waiting ones under "Waiting on you", and the approvers stay as they are: the schedule's managers
 * (hr.schedule:write), the owner for time changes (hr.mod_requests:triage), People at Manage for questions.
 * Swapping a shift with someone is not built (it needs the other person's yes); picking up a day is "New times" and
 * dropping one is "Day off". English and Spanish.
 * Documents to sign (#62): anything sent to them to e-sign (apps/esign) shows on top, signed here while signed in.
 */
import { useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { canAccess } from '../../auth/access';
import { SignInTroubleBar } from '../../components/users/SignInTrouble';
import { getScheduleRequests, type ScheduleRequest } from '../../api/schedule.api';
import {
  answerHrQuestion,
  askHrQuestion,
  approveModificationRequest,
  denyModificationRequest,
  getHrQuestions,
  getModificationRequests,
  type HrQuestion,
  type ModificationRequest,
} from '../../api/hr.api';
import { AskDialog, DecideRow, useRequestCopy } from '../people/ScheduleRequests';
import { errorText } from '../people/scheduleLayout';
import MyEsignDocuments from '../esign/MyEsignDocuments';
import { StaffLink } from '../../components/staff/StaffLink';

const COPY = {
  askChange: { en: 'Ask for a day off or new times', es: 'Pedir un día libre u otro horario' },
  askQuestion: { en: 'Ask HR a question', es: 'Preguntar a RR. HH.' },
  question: { en: 'Your question', es: 'Tu pregunta' },
  questionKind: { en: 'Question', es: 'Pregunta' },
  timeChange: { en: 'Time change', es: 'Cambio de horas' },
  waitingOnYou: { en: 'Waiting on you', es: 'Esperan tu respuesta' },
  myRequests: { en: 'My requests', es: 'Mis solicitudes' },
  none: { en: 'No requests yet.', es: 'Todavía no hay solicitudes.' },
  noneWaiting: { en: 'Nothing waiting.', es: 'Nada en espera.' },
  answer: { en: 'Answer', es: 'Respuesta' },
  sendAnswer: { en: 'Send answer', es: 'Enviar respuesta' },
  note: { en: 'Note (optional)', es: 'Nota (opcional)' },
  approve: { en: 'Approve', es: 'Aprobar' },
  deny: { en: 'Decline', es: 'Rechazar' },
  send: { en: 'Send', es: 'Enviar' },
  sent: { en: 'Sent to HR', es: 'Enviado a RR. HH.' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  done: { en: 'Done', es: 'Listo' },
  couldNot: { en: 'Could not send', es: 'No se pudo enviar' },
  loadFailed: { en: 'Some requests did not load.', es: 'Algunas solicitudes no cargaron.' },
  pending: { en: 'Waiting', es: 'En espera' },
  open: { en: 'Waiting', es: 'En espera' },
  approved: { en: 'Approved', es: 'Aprobada' },
  declined: { en: 'Declined', es: 'Rechazada' },
  denied: { en: 'Declined', es: 'Rechazada' },
  answered: { en: 'Answered', es: 'Respondida' },
  noSwap: {
    en: 'To pick up a shift, ask for new times on that day; to drop one, ask for the day off.',
    es: 'Para tomar un turno, pide otro horario ese día; para dejarlo, pide el día libre.',
  },
} satisfies Record<string, { en: string; es: string }>;

type CopyKey = keyof typeof COPY;
type Status = 'pending' | 'open' | 'approved' | 'declined' | 'denied' | 'answered';
const STATUS_COLOR: Record<Status, 'info' | 'success' | 'error'> = {
  pending: 'info', open: 'info', approved: 'success', declined: 'error', denied: 'error', answered: 'success',
};

/** One of my requests, whatever its kind, for the "My requests" list. */
export interface MyRow {
  key: string;
  kind: string;
  what: string;
  note: string;
  status: Status;
  reply: string;
  created_at: string;
}

function useCopy() {
  const lang = useLanguage();
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const t = (key: CopyKey) => COPY[key][lang];
  const at = (iso: string, pattern: string) => format(parseISO(iso), pattern, locale);
  return { t, at };
}

/** "Mon Nov 2: 9:02am-5:10pm, 30 min break" from what the time change asks for. */
export function timeChangeText(r: ModificationRequest, at: (iso: string, p: string) => string): string {
  const when = [r.requested_clock_in, r.requested_clock_out].map((x) => (x ? at(x, 'h:mmaaa') : '?'));
  const brk = r.requested_break_minutes != null ? `, ${r.requested_break_minutes} min break` : '';
  return `${at(r.entry_date, 'EEE MMM d')}: ${when.join('-')}${brk}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 0.5 }}>{title}</Typography>
        {children}
      </CardContent>
    </Card>
  );
}

function QuestionDialog({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const { t } = useCopy();
  const { enqueueSnackbar } = useSnackbar();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await askHrQuestion(text);
      enqueueSnackbar(t('sent'), { variant: 'success' });
      onSent();
      onClose();
    } catch (err) {
      enqueueSnackbar(errorText(err, t('couldNot')), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('askQuestion')}</DialogTitle>
      <DialogContent>
        <TextField autoFocus fullWidth multiline minRows={3} label={t('question')} value={text} sx={{ mt: 1 }}
          onChange={(e) => setText(e.target.value)} inputProps={{ maxLength: 1000 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>{t('cancel')}</Button>
        <Button variant="contained" onClick={send} disabled={busy || !text.trim()}>{t('send')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function AnswerRow({ question, onDone }: { question: HrQuestion; onDone: () => void }) {
  const { t } = useCopy();
  const { enqueueSnackbar } = useSnackbar();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await answerHrQuestion(question.id, answer);
      onDone();
    } catch (err) {
      enqueueSnackbar(errorText(err, t('couldNot')), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box data-testid={`question-${question.id}`} sx={{ py: 1.25 }}>
      <Typography fontWeight={700}><StaffLink userId={question.employee}>{question.employee_name}</StaffLink> · {t('questionKind')}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{question.question}</Typography>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <TextField size="small" placeholder={t('answer')} value={answer} onChange={(e) => setAnswer(e.target.value)}
          sx={{ flex: 1 }} inputProps={{ maxLength: 1000, 'aria-label': t('answer') }} />
        <Button size="small" variant="contained" disabled={busy || !answer.trim()} onClick={send}>{t('sendAnswer')}</Button>
      </Stack>
    </Box>
  );
}

function TimeChangeRow({ request, onDone }: { request: ModificationRequest; onDone: () => void }) {
  const { t, at } = useCopy();
  const { enqueueSnackbar } = useSnackbar();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      await (approve ? approveModificationRequest : denyModificationRequest)(request.id, note);
      onDone();
    } catch (err) {
      enqueueSnackbar(errorText(err, t('couldNot')), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box data-testid={`timechange-${request.id}`} sx={{ py: 1.25 }}>
      <Typography fontWeight={700}><StaffLink userId={request.employee}>{request.employee_name}</StaffLink> · {t('timeChange')}</Typography>
      <Typography variant="body2">{timeChangeText(request, at)}</Typography>
      {request.reason ? <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>“{request.reason}”</Typography> : null}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <TextField size="small" placeholder={t('note')} value={note} onChange={(e) => setNote(e.target.value)} sx={{ flex: 1 }}
          inputProps={{ 'aria-label': t('note') }} />
        <Button size="small" color="error" disabled={busy} onClick={() => decide(false)}>{t('deny')}</Button>
        <Button size="small" variant="contained" disabled={busy} onClick={() => decide(true)}>{t('approve')}</Button>
      </Stack>
    </Box>
  );
}

export default function HrRequests() {
  const { user } = useAuth();
  const { t, at } = useCopy();
  const schedCopy = useRequestCopy();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<'change' | 'question' | null>(null);
  const me = user?.id;
  const canSchedule = canAccess(user, ['hr.schedule:write', 'people:manage']);
  const canTime = canAccess(user, ['hr.mod_requests:triage', 'admin:full']);
  const canAnswer = canAccess(user, ['hr.questions:answer', 'people:manage']);
  // Cannot sign in (#121): managers see who is locked out and send the reset link.
  const canHelpSignIn = canAccess(user, ['people:manage']);

  const schedule = useQuery({ queryKey: ['scheduleRequests', 'hr'], queryFn: async () => (await getScheduleRequests()).data });
  const times = useQuery({
    queryKey: ['modRequests', { hr: true }],
    queryFn: async () => (await getModificationRequests({ page_size: 200 })).data.results,
  });
  const questions = useQuery({ queryKey: ['hrQuestions'], queryFn: async () => (await getHrQuestions()).data });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['scheduleRequests'] });
    void queryClient.invalidateQueries({ queryKey: ['modRequests'] });
    void queryClient.invalidateQueries({ queryKey: ['hrQuestions'] });
  };

  const sched = schedule.data ?? [];
  const timeRows = times.data ?? [];
  const asked = questions.data ?? [];
  const waitSched = canSchedule ? sched.filter((r) => r.status === 'pending' && r.employee !== me) : [];
  const waitTime = canTime ? timeRows.filter((r) => r.status === 'pending' && r.employee !== me) : [];
  const waitQuestions = canAnswer ? asked.filter((q) => q.status === 'open' && q.employee !== me) : [];
  const answersSomething = canSchedule || canTime || canAnswer;

  const mine: MyRow[] = [
    ...sched.filter((r: ScheduleRequest) => r.employee === me && r.status !== 'withdrawn').map((r) => ({
      key: `s${r.id}`, kind: r.kind === 'off' ? schedCopy.t('off') : schedCopy.t('times'), what: schedCopy.describe(r),
      note: r.note, status: r.status as Status, reply: [r.decided_by_name, r.reply].filter(Boolean).join(': '), created_at: r.created_at,
    })),
    ...timeRows.filter((r) => r.employee === me).map((r) => ({
      key: `t${r.id}`, kind: t('timeChange'), what: timeChangeText(r, at), note: r.reason, status: r.status as Status,
      reply: [r.reviewed_by_name, r.review_note].filter(Boolean).join(': '), created_at: r.created_at,
    })),
    ...asked.filter((q) => q.employee === me).map((q) => ({
      key: `q${q.id}`, kind: t('questionKind'), what: q.question, note: '', status: q.status as Status,
      reply: [q.answered_by_name, q.answer].filter(Boolean).join(': '), created_at: q.created_at,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const loading = schedule.isLoading || times.isLoading || questions.isLoading;
  const failed = schedule.isError || times.isError || questions.isError;
  const waiting = waitSched.length + waitTime.length + waitQuestions.length;

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 900 }} data-testid="hr-requests">
      {canHelpSignIn ? <SignInTroubleBar /> : null}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="contained" onClick={() => setAsking('change')}>{t('askChange')}</Button>
        <Button variant="outlined" onClick={() => setAsking('question')}>{t('askQuestion')}</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{t('noSwap')}</Typography>
      {loading ? <LinearProgress /> : null}
      {failed ? <Alert severity="warning">{t('loadFailed')}</Alert> : null}
      <MyEsignDocuments />

      {answersSomething ? (
        <Section title={waiting ? `${t('waitingOnYou')} (${waiting})` : t('waitingOnYou')}>
          {!loading && !waiting ? <Typography color="text.secondary">{t('noneWaiting')}</Typography> : null}
          {[
            ...waitSched.map((r) => <DecideRow key={`s${r.id}`} request={r} onDone={refresh} />),
            ...waitTime.map((r) => <TimeChangeRow key={`t${r.id}`} request={r} onDone={refresh} />),
            ...waitQuestions.map((q) => <AnswerRow key={`q${q.id}`} question={q} onDone={refresh} />),
          ].map((row, i) => <Box key={row.key}>{i ? <Divider /> : null}{row}</Box>)}
        </Section>
      ) : null}

      <Section title={t('myRequests')}>
        {!loading && !mine.length ? <Typography color="text.secondary">{t('none')}</Typography> : null}
        {mine.map((r, i) => (
          <Box key={r.key} data-testid={`my-${r.key}`}>
            {i ? <Divider /> : null}
            <Box sx={{ py: 1.25 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">{r.kind} · {at(r.created_at, 'MMM d')}</Typography>
                  <Typography fontWeight={700} sx={{ whiteSpace: 'pre-wrap' }}>{r.what}</Typography>
                </Box>
                <Chip size="small" variant="outlined" color={STATUS_COLOR[r.status]} label={t(r.status)} />
              </Stack>
              {r.note ? <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>“{r.note}”</Typography> : null}
              {r.status !== 'pending' && r.status !== 'open' && r.reply ? <Typography variant="body2" sx={{ mt: 0.5 }}>{r.reply}</Typography> : null}
            </Box>
          </Box>
        ))}
      </Section>

      {asking === 'change' ? (
        <AskDialog initial={{ date: format(new Date(), 'yyyy-MM-dd') }} today={format(new Date(), 'yyyy-MM-dd')}
          onClose={() => setAsking(null)} onSent={refresh} />
      ) : null}
      {asking === 'question' ? <QuestionDialog onClose={() => setAsking(null)} onSent={refresh} /> : null}
    </Stack>
  );
}
