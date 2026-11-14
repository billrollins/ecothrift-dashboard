/**
 * HR > Requests, the managers' inbox (Dash Update #140, Bill 2026-11-13, .ai/extended/home-and-hr-structure.md
 * decisions 6 and 9). One list of everything waiting on a manager or the owner: days off and new times, shift fixes
 * (a punch's times), open incident reports and questions to HR, the longest waiting first. Each row is answered where
 * it is: a reply or note, then Approve / Decline (Send for a question; Add note or Close for an incident; Open the
 * report for the whole story). A name opens the staff window. Answered shows the last 30 days. The Sign-in bar
 * (#121: who is locked out, send the reset link) moved here from the staff Requests page, for People at Manage.
 * Who answers which kind is unchanged (pages/hr/inbox/useHrInbox.ts). Staff follow their own requests on
 * Home > HR > Requests. A kit page (components/page): the top bar names it, so the body has no title, and its table
 * turns into cards on a phone. English and Spanish.
 */
import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  LinearProgress,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import InboxOutlined from '@mui/icons-material/InboxOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { useLanguage } from '../../../i18n/useLanguage';
import { EmptyState, PageShell, PageToolbar, Section, StatusPill, type Tone } from '../../../components/page/PageKit';
import { StaffLink } from '../../../components/staff/StaffLink';
import { SignInTroubleBar } from '../../../components/users/SignInTrouble';
import { canAccess } from '../../../auth/access';
import { useAuth } from '../../../hooks/useAuth';
import { decideScheduleRequest } from '../../../api/schedule.api';
import { answerHrQuestion, approveModificationRequest, denyModificationRequest } from '../../../api/hr.api';
import { addIncidentNote, setIncidentStatus } from '../../../api/incidents.api';
import { errorText, range } from '../../people/scheduleLayout';
import { KIND_COPY, PLACE_COPY } from '../incidents/incidentCopy';
import { ANSWERED_DAYS, useHrInbox, type InboxKind, type InboxRow } from './useHrInbox';

const COPY = {
  waiting: { en: 'Waiting', es: 'En espera' },
  answered: { en: `Answered (last ${ANSWERED_DAYS} days)`, es: `Respondidas (últimos ${ANSWERED_DAYS} días)` },
  view: { en: 'Show', es: 'Mostrar' },
  who: { en: 'Who', es: 'Quién' },
  request: { en: 'Request', es: 'Solicitud' },
  asked: { en: 'Asked', es: 'Pidió' },
  answer: { en: 'Answer', es: 'Respuesta' },
  off: { en: 'Day off', es: 'Día libre' },
  times: { en: 'New times', es: 'Otro horario' },
  fix: { en: 'Shift fix', es: 'Corrección de turno' },
  incident: { en: 'Incident', es: 'Incidente' },
  question: { en: 'Question', es: 'Pregunta' },
  reply: { en: 'Reply (optional)', es: 'Respuesta (opcional)' },
  note: { en: 'Note (optional)', es: 'Nota (opcional)' },
  followUp: { en: 'Follow-up note', es: 'Nota de seguimiento' },
  yourAnswer: { en: 'Your answer', es: 'Tu respuesta' },
  approve: { en: 'Approve', es: 'Aprobar' },
  decline: { en: 'Decline', es: 'Rechazar' },
  send: { en: 'Send', es: 'Enviar' },
  addNote: { en: 'Add note', es: 'Agregar nota' },
  close: { en: 'Close', es: 'Cerrar' },
  openReport: { en: 'Open the report', es: 'Abrir el reporte' },
  approved: { en: 'Approved', es: 'Aprobada' },
  declined: { en: 'Declined', es: 'Rechazada' },
  answeredOne: { en: 'Answered', es: 'Respondida' },
  closed: { en: 'Closed', es: 'Cerrado' },
  noted: { en: 'Note added', es: 'Nota agregada' },
  sent: { en: 'Answer sent', es: 'Respuesta enviada' },
  couldNot: { en: 'Could not save', es: 'No se pudo guardar' },
  loadFailed: { en: 'Some requests did not load. They show again on the next refresh.', es: 'Algunas solicitudes no cargaron. Vuelven a aparecer al actualizar.' },
  noneWaiting: { en: 'Nothing waiting', es: 'Nada en espera' },
  noneWaitingBody: {
    en: 'Days off, new times, shift fixes, incident reports and questions land here when someone sends one.',
    es: 'Aquí llegan los días libres, cambios de horario, correcciones de turno, reportes de incidentes y preguntas.',
  },
  noneAnswered: { en: 'Nothing answered yet', es: 'Nada respondido todavía' },
  noneAnsweredBody: { en: `Requests answered in the last ${ANSWERED_DAYS} days show here.`, es: `Aquí aparecen las respuestas de los últimos ${ANSWERED_DAYS} días.` },
  today: { en: 'today', es: 'hoy' },
  dayAgo: { en: '1 day ago', es: 'hace 1 día' },
  daysAgo: { en: 'days ago', es: 'días' },
  punched: { en: 'Punched', es: 'Marcó' },
  asks: { en: 'asks', es: 'pide' },
  stillIn: { en: 'still in', es: 'sin salida' },
  breakMin: { en: 'min break', es: 'min de descanso' },
  days: { en: 'days', es: 'días' },
  through: { en: 'to', es: 'al' },
} satisfies Record<string, { en: string; es: string }>;

type CopyKey = keyof typeof COPY;

function useCopy() {
  const lang = useLanguage();
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const t = (key: CopyKey) => COPY[key][lang];
  const at = (iso: string, pattern: string) => format(parseISO(iso), pattern, locale);
  /** "Nov 12 · 2 days ago". */
  const ago = (iso: string) => {
    const days = differenceInCalendarDays(new Date(), parseISO(iso));
    const rel = days <= 0 ? t('today') : days === 1 ? t('dayAgo') : lang === 'es' ? `hace ${days} ${t('daysAgo')}` : `${days} ${t('daysAgo')}`;
    return `${at(iso, 'MMM d')} · ${rel}`;
  };
  return { t, at, ago, lang };
}

const KIND_LABEL: Record<InboxKind, CopyKey> = { off: 'off', times: 'times', fix: 'fix', incident: 'incident', question: 'question' };

function who(row: InboxRow): { id: number; name: string } {
  switch (row.kind) {
    case 'off':
    case 'times':
      return { id: row.schedule.employee, name: row.schedule.employee_name };
    case 'fix':
      return { id: row.fix.employee, name: row.fix.employee_name };
    case 'incident':
      return { id: row.incident.reported_by, name: row.incident.reported_by_name };
    case 'question':
      return { id: row.question.employee, name: row.question.employee_name };
  }
}

/** What is asked, in a line or two, with the person's own words under it. */
function RequestCell({ row }: { row: InboxRow }) {
  const { t, at, lang } = useCopy();
  let what = '';
  let words = '';
  let link: string | null = null;
  if (row.kind === 'off') {
    const r = row.schedule;
    const n = differenceInCalendarDays(parseISO(r.end_date), parseISO(r.date)) + 1;
    what = n > 1
      ? `${at(r.date, 'EEE MMM d')} ${t('through')} ${at(r.end_date, 'EEE MMM d')} (${n} ${t('days')})`
      : at(r.date, 'EEE MMM d');
    words = r.note;
  } else if (row.kind === 'times') {
    const r = row.schedule;
    what = `${at(r.date, 'EEE MMM d')}, ${r.start_time && r.end_time ? range(r.start_time, r.end_time) : ''}`;
    words = r.note;
  } else if (row.kind === 'fix') {
    const r = row.fix;
    const time = (iso: string | null) => (iso ? at(iso, 'h:mmaaa') : '?');
    const punched = `${time(r.entry_clock_in)}-${r.entry_clock_out ? time(r.entry_clock_out) : t('stillIn')}`;
    // A time left out of the request stays as punched.
    const asks = `${time(r.requested_clock_in ?? r.entry_clock_in)}-${time(r.requested_clock_out ?? r.entry_clock_out)}`;
    const brk = r.requested_break_minutes != null ? `, ${r.requested_break_minutes} ${t('breakMin')}` : '';
    what = `${at(r.entry_date, 'EEE MMM d')}: ${t('punched')} ${punched}, ${t('asks')} ${asks}${brk}`;
    words = r.reason;
  } else if (row.kind === 'incident') {
    const r = row.incident;
    what = `${KIND_COPY[r.kind]?.[lang] ?? r.kind_label} · ${PLACE_COPY[r.place]?.[lang] ?? r.place_label} · ${at(r.occurred_at, 'EEE MMM d, h:mm a')}`;
    words = r.what_happened;
    link = `/people/incidents?report=${r.id}`;
  } else if (row.kind === 'question') {
    what = row.question.question;
  }
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" component="div" sx={{ fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {t(KIND_LABEL[row.kind])}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{what}</Typography>
      {words ? (
        <Typography variant="body2" color="text.secondary"
          sx={{ fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          “{words}”
        </Typography>
      ) : null}
      {link ? (
        <Link component={RouterLink} to={link} variant="body2" sx={{ fontWeight: 600 }} data-testid={`inbox-open-${row.key}`}>
          {t('openReport')}
        </Link>
      ) : null}
    </Box>
  );
}

/** The answer box and buttons for one waiting row. The row leaves the list once it is answered. */
function AnswerCell({ row, onDone }: { row: InboxRow; onDone: () => void }) {
  const { t } = useCopy();
  const { enqueueSnackbar } = useSnackbar();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>, done: CopyKey) => {
    setBusy(true);
    try {
      await work();
      enqueueSnackbar(t(done), { variant: 'success' });
      setText('');
      onDone();
    } catch (err) {
      enqueueSnackbar(errorText(err, t('couldNot')), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const placeholder: CopyKey = row.kind === 'question' ? 'yourAnswer' : row.kind === 'incident' ? 'followUp' : row.kind === 'fix' ? 'note' : 'reply';
  let buttons;
  if (row.kind === 'question') {
    const q = row.question;
    buttons = (
      <Button size="small" variant="contained" disabled={busy || !text.trim()} onClick={() => run(() => answerHrQuestion(q.id, text.trim()), 'sent')}>
        {t('send')}
      </Button>
    );
  } else if (row.kind === 'incident') {
    const r = row.incident;
    buttons = (
      <>
        <Button size="small" variant="outlined" disabled={busy || !text.trim()} onClick={() => run(() => addIncidentNote(r.id, text.trim()), 'noted')}>
          {t('addNote')}
        </Button>
        <Button size="small" variant="contained" disabled={busy} onClick={() => run(() => setIncidentStatus(r.id, 'close', text.trim()), 'closed')}>
          {t('close')}
        </Button>
      </>
    );
  } else {
    const decide = (approve: boolean) =>
      row.kind === 'fix'
        ? (approve ? approveModificationRequest : denyModificationRequest)(row.fix.id, text.trim())
        : decideScheduleRequest(row.schedule.id, approve, text.trim());
    buttons = (
      <>
        <Button size="small" color="error" disabled={busy} onClick={() => run(() => decide(false), 'declined')}>{t('decline')}</Button>
        <Button size="small" variant="contained" disabled={busy} onClick={() => run(() => decide(true), 'approved')}>{t('approve')}</Button>
      </>
    );
  }
  return (
    // Side by side only on a wide screen; below that the buttons sit under the box, so the request keeps its room.
    <Stack direction={{ xs: 'column', xl: 'row' }} spacing={1} alignItems={{ xs: 'stretch', xl: 'center' }} sx={{ width: '100%' }}>
      <TextField size="small" value={text} onChange={(e) => setText(e.target.value)} placeholder={t(placeholder)}
        sx={{ flex: 1, minWidth: { xl: 180 } }}
        inputProps={{ maxLength: row.kind === 'question' ? 1000 : 300, 'aria-label': t(placeholder) }} />
      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ flexShrink: 0 }}>{buttons}</Stack>
    </Stack>
  );
}

/** What came back on an answered row: the outcome, who and when, and the reply. */
function OutcomeCell({ row }: { row: InboxRow }) {
  const { t, at } = useCopy();
  let tone: Tone = 'good';
  let label = t('approved');
  let by = '';
  let words = '';
  if (row.kind === 'off' || row.kind === 'times') {
    const r = row.schedule;
    if (r.status === 'declined') { tone = 'problem'; label = t('declined'); }
    by = r.decided_by_name;
    words = r.reply;
  } else if (row.kind === 'fix') {
    const r = row.fix;
    if (r.status === 'denied') { tone = 'problem'; label = t('declined'); }
    by = r.reviewed_by_name ?? '';
    words = r.review_note;
  } else if (row.kind === 'question') {
    label = t('answeredOne');
    by = row.question.answered_by_name;
    words = row.question.answer;
  } else if (row.kind === 'incident') {
    tone = 'quiet';
    label = t('closed');
    by = row.incident.closed_by_name;
  }
  return (
    <Box sx={{ minWidth: 0, textAlign: 'left' }}>
      <StatusPill tone={tone} label={label} />
      <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
        {[by, row.answered ? at(row.answered, 'MMM d') : ''].filter(Boolean).join(' · ')}
      </Typography>
      {words ? <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{words}</Typography> : null}
    </Box>
  );
}

type View = 'waiting' | 'answered';

export default function HrInboxPage() {
  const { t, ago } = useCopy();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const inbox = useHrInbox();
  // Cannot sign in (#121): a fixed-height bar, there from the first paint for whoever may help.
  const canHelpSignIn = canAccess(user, ['people:manage']);
  const [view, setView] = useState<View>('waiting');
  const rows = view === 'waiting' ? inbox.waiting : inbox.answered;

  // A list that failed says so once, in a snackbar, so nothing on the page moves.
  useEffect(() => {
    if (inbox.failed) enqueueSnackbar(t('loadFailed'), { variant: 'warning', preventDuplicate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.failed]);

  return (
    <PageShell width="wide">
      <PageToolbar
        lead={
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, v: View | null) => v && setView(v)}
            aria-label={t('view')}>
            <ToggleButton value="waiting" data-testid="inbox-view-waiting" sx={{ textTransform: 'none', fontWeight: 700 }}>
              {t('waiting')} ({inbox.waiting.length})
            </ToggleButton>
            <ToggleButton value="answered" data-testid="inbox-view-answered" sx={{ textTransform: 'none', fontWeight: 700 }}>
              {t('answered')}
            </ToggleButton>
          </ToggleButtonGroup>
        }
      />
      {canHelpSignIn ? <SignInTroubleBar /> : null}
      <Section flush>
        {/* The loading bar keeps its 4px whether it shows or not. */}
        <Box sx={{ height: 4 }}>{inbox.loading ? <LinearProgress /> : null}</Box>
        {rows.length ? (
          <Table size="small" data-testid={`inbox-${view}`}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: { md: 150 } }}>{t('who')}</TableCell>
                <TableCell>{t('request')}</TableCell>
                <TableCell sx={{ width: { md: 140 } }}>{t('asked')}</TableCell>
                {/* Waiting: the answer box needs no heading (on a phone its buttons sit at the card's foot). */}
                <TableCell sx={{ width: { md: 260, xl: 440 } }}>{view === 'waiting' ? '' : t('answer')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => {
                const person = who(row);
                return (
                  <TableRow key={row.key} data-testid={`inbox-row-${row.key}`} sx={{ verticalAlign: 'top' }}>
                    <TableCell sx={{ fontWeight: 700 }}>
                      <StaffLink userId={person.id}>{person.name}</StaffLink>
                    </TableCell>
                    <TableCell><RequestCell row={row} /></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{ago(row.asked)}</TableCell>
                    <TableCell>
                      {view === 'waiting' ? <AnswerCell row={row} onDone={inbox.refresh} /> : <OutcomeCell row={row} />}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : inbox.loading ? (
          <Box sx={{ minHeight: 220 }} />
        ) : (
          <EmptyState
            Icon={InboxOutlined}
            title={view === 'waiting' ? t('noneWaiting') : t('noneAnswered')}
            body={view === 'waiting' ? t('noneWaitingBody') : t('noneAnsweredBody')}
          />
        )}
      </Section>
    </PageShell>
  );
}
