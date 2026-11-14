/**
 * HR → Requests (Bill, Dash Updates #59, 2026-11-03): every HR request in one place. Anyone asks for a day off or new
 * times (the Schedule's requests, #60 and #61) or asks HR a question, and sees all of their own requests with the
 * answer: those two plus their time-change requests (asked from Me → Hours & pay). Whoever answers a kind sees
 * everyone's waiting ones under "Waiting on you", and the approvers stay as they are: the schedule's managers
 * (hr.schedule:write), the owner for time changes (hr.mod_requests:triage), People at Manage for questions.
 * Swapping a shift with someone is not built (it needs the other person's yes); picking up a day is "New times" and
 * dropping one is "Day off". English and Spanish.
 * Documents to sign (#62): anything sent to them to e-sign (apps/esign) shows on top, signed here while signed in.
 * Answering moved (#140, Bill 2026-11-13): managers and the owner answer everyone's requests in the HR workspace's
 * Requests inbox (/people/requests); this page is each person's own requests, with a link there for whoever answers.
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
import { Link as RouterLink } from 'react-router-dom';
import { getScheduleRequests, type ScheduleRequest } from '../../api/schedule.api';
import {
  askHrQuestion,
  getHrQuestions,
  getModificationRequests,
  type ModificationRequest,
} from '../../api/hr.api';
import { AskDialog, useRequestCopy } from '../people/ScheduleRequests';
import { errorText } from '../people/scheduleLayout';
import MyEsignDocuments from '../esign/MyEsignDocuments';
import { inboxRights } from './inbox/useHrInbox';

const COPY = {
  askChange: { en: 'Ask for a day off or new times', es: 'Pedir un día libre u otro horario' },
  askQuestion: { en: 'Ask HR a question', es: 'Preguntar a RR. HH.' },
  question: { en: 'Your question', es: 'Tu pregunta' },
  questionKind: { en: 'Question', es: 'Pregunta' },
  timeChange: { en: 'Time change', es: 'Cambio de horas' },
  answerThem: { en: 'Requests waiting on you are in HR > Requests', es: 'Las solicitudes que esperan tu respuesta están en RR. HH. > Solicitudes' },
  openInbox: { en: 'Open', es: 'Abrir' },
  myRequests: { en: 'My requests', es: 'Mis solicitudes' },
  none: { en: 'No requests yet.', es: 'Todavía no hay solicitudes.' },
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

export default function HrRequests() {
  const { user } = useAuth();
  const { t, at } = useCopy();
  const schedCopy = useRequestCopy();
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState<'change' | 'question' | null>(null);
  const me = user?.id;
  // Whoever answers a kind does it in the Requests inbox (#140); this page only points there.
  const rights = inboxRights(user);
  const answersSomething = rights.schedule || rights.fixes || rights.questions || rights.incidents;

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

  return (
    <Stack spacing={1.5} sx={{ maxWidth: 900 }} data-testid="hr-requests">
      {answersSomething ? (
        <Alert severity="info" data-testid="hr-requests-inbox-link"
          action={<Button component={RouterLink} to="/people/requests" color="inherit" size="small">{t('openInbox')}</Button>}>
          {t('answerThem')}
        </Alert>
      ) : null}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <Button variant="contained" onClick={() => setAsking('change')}>{t('askChange')}</Button>
        <Button variant="outlined" onClick={() => setAsking('question')}>{t('askQuestion')}</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">{t('noSwap')}</Typography>
      {loading ? <LinearProgress /> : null}
      {failed ? <Alert severity="warning">{t('loadFailed')}</Alert> : null}
      <MyEsignDocuments />

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
