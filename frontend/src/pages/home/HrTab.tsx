/**
 * Home > HR, the staff view (Dash Update #138; Bill's decisions 5 and 8 in .ai/extended/home-and-hr-structure.md): all
 * a staff member needs from HR in one place, for everyone, managers included (it shows only their own things).
 *
 *   Banner      while onboarding, how far along (moved here from Today); else a check-in this week or just signed
 *   Files       what they signed: e-sign documents (apps/esign), the offer letter, every handbook version, check-ins;
 *               the handbook to sign when a new version is out
 *   Training    placeholder (what I am cleared to do), built later
 *   SOPs        placeholder, built later
 *   Requests    time off, a fix to a shift, an incident report: start one, and see each one's status
 *
 * The flows are the existing ones: the schedule's AskDialog, Hours & pay's TimeChangeDialog, HR > Incidents'
 * IncidentForm. Built from the page kit on the Eco-Thrift theme. On a desk the Home band names the tab; on a phone the
 * top bar does, so the body never repeats the title. The body waits for its lists, so nothing jumps in later.
 */
import { useState, type ComponentType, type ReactNode } from 'react';
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { ThemeProvider, useTheme } from '@mui/material/styles';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import EventBusyRounded from '@mui/icons-material/EventBusyRounded';
import ReportGmailerrorredRounded from '@mui/icons-material/ReportGmailerrorredRounded';
import SchoolRounded from '@mui/icons-material/SchoolRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { EmptyState, Section, StatusPill, type Tone } from '../../components/page/PageKit';
import { FloorPage } from '../../components/layout/FloorPage';
import { TimeChangeDialog } from '../../components/hr/TimeChangeDialog';
import { ECO_ICONS } from '../../icons/ecoIcons';
import { ecoFonts, ecoTheme } from '../../theme/eco';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { t as tRoutines } from '../../i18n/routines';
import { getMyCheckins, getMyHrFilePdf, getMyHrFiles, getMyOnboarding, type MyHrFiles } from '../../api/hiring.api';
import { getHrQuestions, getModificationRequests, getTimeEntries, type HrQuestion, type ModificationRequest } from '../../api/hr.api';
import { getScheduleRequests, type ScheduleRequest } from '../../api/schedule.api';
import { createIncident, getIncidents, type IncidentSummary, type IncidentWrite } from '../../api/incidents.api';
import { listMine, type MyDocument } from '@/esign/api';
import { MY_ESIGN_KEY } from '../esign/MyEsignDocuments';
import { AskDialog, useRequestCopy } from '../people/ScheduleRequests';
import { IncidentForm } from '../hr/incidents/IncidentForm';
import { KIND_COPY, PLACE_COPY, useIncidentCopy } from '../hr/incidents/incidentCopy';
import type { TimeEntry } from '../../types/hr.types';

const COPY = {
  files: { en: 'Files', es: 'Archivos' },
  filesHint: { en: 'What you signed, and what is waiting for your signature', es: 'Lo que firmaste y lo que espera tu firma' },
  noFiles: { en: 'Nothing signed yet', es: 'Nada firmado todavía' },
  noFilesBody: {
    en: 'Your offer letter, the handbook, check-ins and documents sent to you show here once they are signed.',
    es: 'Tu carta de oferta, el manual, las revisiones y los documentos que te envíen aparecen aquí cuando estén firmados.',
  },
  toSign: { en: 'To sign', es: 'Por firmar' },
  sign: { en: 'Read and sign', es: 'Leer y firmar' },
  open: { en: 'Open', es: 'Abrir' },
  signedOn: { en: 'Signed', es: 'Firmado' },
  sentOn: { en: 'Sent', es: 'Enviado' },
  newVersion: { en: 'New version', es: 'Versión nueva' },
  waitingOn: { en: 'Waiting on', es: 'Esperando a' },
  others: { en: 'others', es: 'otros' },
  youSigned: { en: 'You signed', es: 'Firmaste' },
  training: { en: 'Training', es: 'Capacitación' },
  trainingBody: { en: 'What you are cleared to do.', es: 'Lo que ya puedes hacer.' },
  sops: { en: 'SOPs', es: 'Procedimientos' },
  sopsBody: { en: 'How we do things here, step by step.', es: 'Cómo hacemos las cosas aquí, paso a paso.' },
  soon: { en: 'Coming soon', es: 'Muy pronto' },
  requests: { en: 'Requests', es: 'Solicitudes' },
  requestsHint: { en: 'Start one here and see where each one stands', es: 'Empieza una aquí y mira cómo va cada una' },
  timeOff: { en: 'Time off', es: 'Día libre' },
  timeFix: { en: 'Fix a shift', es: 'Corregir un turno' },
  incident: { en: 'Report an incident', es: 'Reportar un incidente' },
  noRequests: { en: 'No requests yet', es: 'Todavía no hay solicitudes' },
  noRequestsBody: {
    en: 'Ask for a day off, fix a shift you clocked wrong, or report something that happened. Each one shows here with its answer.',
    es: 'Pide un día libre, corrige un turno mal marcado o reporta algo que pasó. Cada una aparece aquí con su respuesta.',
  },
  kindTimeFix: { en: 'Shift fix', es: 'Corrección de turno' },
  kindIncident: { en: 'Incident report', es: 'Reporte de incidente' },
  kindQuestion: { en: 'Question', es: 'Pregunta' },
  asked: { en: 'asked', es: 'pedida' },
  askedFirst: { en: 'Asked', es: 'Pedida' },
  waiting: { en: 'Waiting', es: 'En espera' },
  approved: { en: 'Approved', es: 'Aprobada' },
  declined: { en: 'Declined', es: 'Rechazada' },
  answered: { en: 'Answered', es: 'Respondida' },
  reportOpen: { en: 'Open', es: 'Abierto' },
  reportClosed: { en: 'Closed', es: 'Cerrado' },
  showAll: { en: 'Show all', es: 'Ver todas' },
  loadFailed: { en: 'Some of this did not load. Try again in a minute.', es: 'Algo no cargó. Intenta de nuevo en un minuto.' },
  onboarding: { en: 'Your onboarding', es: 'Tu incorporación' },
  done: { en: 'done', es: 'hechos' },
  of: { en: 'of', es: 'de' },
  handbookReady: { en: 'The handbook is ready to sign.', es: 'El manual está listo para firmar.' },
  checkinSoon: {
    en: 'Your {day}-day check-in with {who} is around {date}.',
    es: 'Tu revisión de {day} días con {who} es alrededor del {date}.',
  },
  checkinSigned: { en: 'Your {day}-day check-in is signed. Read it any time.', es: 'Tu revisión de {day} días está firmada. Léela cuando quieras.' },
  yourManager: { en: 'your manager', es: 'tu gerente' },
  myCheckins: { en: 'My check-ins', es: 'Mis revisiones' },
  whichShift: { en: 'Which shift?', es: '¿Qué turno?' },
  whichShiftHint: { en: 'Pick the shift to fix. Your manager sees what you ask for.', es: 'Elige el turno a corregir. Tu gerente ve lo que pides.' },
  noShifts: { en: 'No shifts yet.', es: 'Todavía no hay turnos.' },
  stillOpen: { en: 'still clocked in', es: 'aún marcado' },
  cancel: { en: 'Cancel', es: 'Cancelar' },
  couldNotOpen: { en: 'Could not open the file.', es: 'No se pudo abrir el archivo.' },
} satisfies Record<string, { en: string; es: string }>;

type CopyKey = keyof typeof COPY;

function useCopy() {
  const lang = useLanguage();
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const t = (key: CopyKey) => COPY[key][lang];
  const day = (iso: string | null | undefined, pattern = 'MMM d, yyyy') => (iso ? format(parseISO(iso), pattern, locale) : '');
  return { t, day, lang };
}

/** Newest first: the APIs write times in different zones (UTC or Central), so compare instants, not strings. */
const when = (iso: string) => (iso ? parseISO(iso).getTime() : 0);
const DAY = 86_400_000;

/** How many requests show before "Show all". */
const FIRST_REQUESTS = 8;

// ── Files ──────────────────────────────────────────────────────────────────

interface FileRow {
  key: string;
  title: string;
  /** One line under the title: when it was signed or sent, or who it waits on. */
  line: string;
  toSign: boolean;
  /** To sign: where signing happens. */
  signAt?: string;
  /** Signed: the PDF, a path under /api. */
  pdf?: string;
}

export function fileRows(
  esign: MyDocument[],
  hiring: MyHrFiles | undefined,
  t: (key: CopyKey) => string,
  day: (iso: string | null | undefined) => string,
): FileRow[] {
  const toSign: FileRow[] = [];
  const rest: (FileRow & { at: string })[] = [];
  for (const d of esign) {
    if (d.my_turn) {
      toSign.push({ key: `esign-${d.party}`, title: d.title, line: `${t('sentOn')} ${day(d.sent_at)}`, toSign: true, signAt: `/hr/sign/${d.party}` });
    } else if (d.status === 'signed' || d.status === 'ended') {
      rest.push({
        key: `esign-${d.party}`, title: d.title, line: `${t('signedOn')} ${day(d.completed_at ?? d.signed_at)}`, toSign: false,
        pdf: d.has_pdf ? `/esign/envelopes/${d.envelope}/pdf/` : undefined, at: d.completed_at ?? d.signed_at ?? '',
      });
    } else if (d.status === 'out') {
      const on = `${t('waitingOn')} ${d.waiting_on ?? t('others')}`;
      rest.push({
        key: `esign-${d.party}`, title: d.title, line: d.my_status === 'signed' ? `${t('youSigned')} ${day(d.signed_at)} · ${on}` : on,
        toSign: false, at: d.signed_at ?? d.sent_at ?? '',
      });
    }
  }
  const book = hiring?.handbook;
  if (book && !book.signed) {
    const signedBefore = hiring.files.some((f) => f.kind === 'handbook');
    toSign.push({
      key: `handbook-v${book.version}`, title: `${book.title} (version ${book.version})`,
      line: signedBefore ? t('newVersion') : t('toSign'), toSign: true, signAt: '/onboarding',
    });
  }
  for (const f of hiring?.files ?? []) {
    rest.push({ key: f.key, title: f.title, line: `${t('signedOn')} ${day(f.signed_at)}`, toSign: false, pdf: f.pdf, at: f.signed_at ?? '' });
  }
  rest.sort((a, b) => when(b.at) - when(a.at));
  return [...toSign, ...rest];
}

async function openPdf(path: string, onError: (msg: string) => void) {
  // Open the window first (inside the click), or a phone's browser blocks it.
  const popup = window.open('', '_blank');
  try {
    const { data } = await getMyHrFilePdf(path);
    const url = URL.createObjectURL(data);
    if (popup) popup.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    popup?.close();
    onError('');
  }
}

function Row({ title, line, end, onClick, testId }: {
  title: string;
  line: string;
  end?: ReactNode;
  onClick?: () => void;
  testId?: string;
}) {
  const body = (
    <>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{title}</Typography>
        <Typography variant="caption" component="div" color="text.secondary">{line}</Typography>
      </Box>
      {end ? <Box sx={{ flexShrink: 0 }}>{end}</Box> : null}
    </>
  );
  const sx = {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    width: '100%',
    textAlign: 'left',
    px: { xs: 2, md: 2.5 },
    py: 1.25,
    borderTop: '1px solid',
    borderColor: 'divider',
  } as const;
  if (onClick) {
    return (
      <ButtonBase onClick={onClick} data-testid={testId} sx={{ ...sx, '&:hover': { bgcolor: 'action.hover' } }}>
        {body}
      </ButtonBase>
    );
  }
  return <Box data-testid={testId} sx={sx}>{body}</Box>;
}

function FilesSection({ rows, failed }: { rows: FileRow[]; failed: boolean }) {
  const { t } = useCopy();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  return (
    <Section title={t('files')} hint={t('filesHint')} flush>
      {failed ? <Typography variant="body2" color="error" sx={{ px: { xs: 2, md: 2.5 }, pb: 1.5 }}>{t('loadFailed')}</Typography> : null}
      {!rows.length && !failed ? (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
          <EmptyState Icon={ECO_ICONS.documents} title={t('noFiles')} body={t('noFilesBody')} />
        </Box>
      ) : null}
      {rows.map((row) => (
        <Row
          key={row.key}
          testId={`hr-file-${row.key}`}
          title={row.title}
          line={row.line}
          end={row.toSign ? (
            <Button size="small" variant="contained" onClick={() => navigate(row.signAt!)}>{t('sign')}</Button>
          ) : row.pdf ? (
            <Button size="small" variant="outlined"
              onClick={() => void openPdf(row.pdf!, () => enqueueSnackbar(t('couldNotOpen'), { variant: 'error' }))}>
              {t('open')}
            </Button>
          ) : undefined}
        />
      ))}
    </Section>
  );
}

// ── Training and SOPs (placeholders) ───────────────────────────────────────

function Soon({ title, body, Icon }: { title: string; body: string; Icon: ComponentType<SvgIconProps> }) {
  const { t } = useCopy();
  return (
    <Section sx={{ height: '100%' }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Icon sx={{ fontSize: 26, color: 'text.secondary', mt: 0.25, display: { xs: 'none', sm: 'block' } }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2">{title}</Typography>
          <Typography variant="body2" color="text.secondary">{body}</Typography>
          <Box sx={{ mt: 1 }}><StatusPill tone="quiet" label={t('soon')} /></Box>
        </Box>
      </Stack>
    </Section>
  );
}

// ── Requests ───────────────────────────────────────────────────────────────

export interface RequestRow {
  key: string;
  kind: string;
  what: string;
  status: { tone: Tone; label: string };
  /** The answer, once there is one: "Bill: enjoy the day". */
  reply: string;
  created_at: string;
  /** Incidents open in HR > Incidents. */
  href?: string;
}

function ShiftChooser({ onPick, onClose }: { onPick: (entry: TimeEntry) => void; onClose: () => void }) {
  const { t, day } = useCopy();
  const { user } = useAuth();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const shifts = useQuery({
    queryKey: ['timeEntries', { employee: user?.id, page_size: 14, ordering: '-date,-clock_in' }],
    queryFn: async () => (await getTimeEntries({ employee: user?.id, page_size: 14, ordering: '-date,-clock_in' })).data.results,
    enabled: Boolean(user?.id),
  });
  const clock = (iso: string | null) => (iso ? format(parseISO(iso), 'h:mmaaa') : t('stillOpen'));
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" fullScreen={phone}>
      <DialogTitle>{t('whichShift')}</DialogTitle>
      <DialogContent sx={{ px: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ px: 3, pb: 1 }}>{t('whichShiftHint')}</Typography>
        {shifts.isLoading ? <Box sx={{ display: 'grid', placeItems: 'center', py: 3 }}><CircularProgress size={24} /></Box> : null}
        {shifts.isSuccess && !shifts.data.length ? <Typography sx={{ px: 3, py: 1 }}>{t('noShifts')}</Typography> : null}
        {(shifts.data ?? []).map((entry) => (
          <Row
            key={entry.id}
            testId={`hr-shift-${entry.id}`}
            title={day(entry.date, 'EEE MMM d')}
            line={`${clock(entry.clock_in)} – ${clock(entry.clock_out)}${entry.break_minutes ? ` · ${entry.break_minutes} min break` : ''}`}
            end={<ECO_ICONS.edit sx={{ fontSize: 18, color: 'text.secondary' }} />}
            onClick={() => onPick(entry)}
          />
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
      </DialogActions>
    </Dialog>
  );
}

function RequestsSection({ rows, failed, onStart }: {
  rows: RequestRow[];
  failed: boolean;
  onStart: (what: 'off' | 'fix' | 'incident') => void;
}) {
  const { t, day } = useCopy();
  const navigate = useNavigate();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FIRST_REQUESTS);
  const start = { justifyContent: 'flex-start', minHeight: 44, px: 1.5, whiteSpace: 'nowrap' } as const;
  return (
    <Section title={t('requests')} hint={t('requestsHint')} flush>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        flexWrap="wrap"
        useFlexGap
        sx={{ px: { xs: 2, md: 2.5 }, pb: 2 }}
      >
        <Button variant="contained" startIcon={<EventBusyRounded />} sx={start} onClick={() => onStart('off')} data-testid="hr-start-off">
          {t('timeOff')}
        </Button>
        <Button variant="outlined" startIcon={<ECO_ICONS.timeClock />} sx={start} onClick={() => onStart('fix')} data-testid="hr-start-fix">
          {t('timeFix')}
        </Button>
        <Button variant="outlined" color="error" startIcon={<ReportGmailerrorredRounded />} sx={start} onClick={() => onStart('incident')}
          data-testid="hr-start-incident">
          {t('incident')}
        </Button>
      </Stack>
      {failed ? <Typography variant="body2" color="error" sx={{ px: { xs: 2, md: 2.5 }, pb: 1.5 }}>{t('loadFailed')}</Typography> : null}
      {!rows.length && !failed ? (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }}>
          <EmptyState Icon={ECO_ICONS.requests} title={t('noRequests')} body={t('noRequestsBody')} />
        </Box>
      ) : null}
      {shown.map((r) => (
        <Box key={r.key} data-testid={`hr-request-${r.key}`}>
          <Row
            title={r.what}
            line={[r.kind, `${r.kind ? t('asked') : t('askedFirst')} ${day(r.created_at, 'MMM d')}`, r.reply].filter(Boolean).join(' · ')}
            end={<StatusPill tone={r.status.tone} label={r.status.label} />}
            onClick={r.href ? () => navigate(r.href!) : undefined}
          />
        </Box>
      ))}
      {rows.length > FIRST_REQUESTS && !all ? (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', px: { xs: 1, md: 1.5 }, py: 0.5 }}>
          <Button size="small" onClick={() => setAll(true)}>{t('showAll')} ({rows.length})</Button>
        </Box>
      ) : null}
    </Section>
  );
}

// ── Onboarding banner ──────────────────────────────────────────────────────

export interface Banner {
  title: string;
  line?: string;
  /** Onboarding: how far along, 0-100. */
  progress?: number;
  to: string;
  action: string;
}

/** While onboarding: how far along (moved here from Today). Otherwise a check-in coming up this week, or one just signed. */
function HrBanner({ banner }: { banner: Banner }) {
  const Icon = banner.progress === undefined ? ECO_ICONS.checkIn : ECO_ICONS.onboarding;
  return (
    <Section sx={{ bgcolor: 'success.light' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 2 }} alignItems={{ sm: 'center' }} data-testid="hr-banner">
        <Icon sx={{ fontSize: 32, display: { xs: 'none', sm: 'block' } }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h6" component="h2">{banner.title}</Typography>
          {banner.line ? <Typography variant="body2">{banner.line}</Typography> : null}
          {banner.progress !== undefined ? (
            <LinearProgress variant="determinate" value={banner.progress} sx={{ mt: 1, height: 8, borderRadius: 4 }} />
          ) : null}
        </Box>
        <Button variant="contained" component={RouterLink} to={banner.to} sx={{ flexShrink: 0 }}>{banner.action}</Button>
      </Stack>
    </Section>
  );
}

// ── The tab ────────────────────────────────────────────────────────────────

/** Every list the tab shows, with each request kind turned into one row type. */
function useHrTabData() {
  const { user } = useAuth();
  const me = user?.id;
  const { t, day } = useCopy();
  const sched = useRequestCopy();
  const incidentCopy = useIncidentCopy();
  const checkins = useQuery({ queryKey: ['hiring', 'my-checkins'], queryFn: async () => (await getMyCheckins()).data, retry: false, staleTime: 5 * 60 * 1000 });
  const onboarding = useQuery({ queryKey: ['hiring', 'my-onboarding'], queryFn: async () => (await getMyOnboarding()).data, retry: false, staleTime: 5 * 60 * 1000 });
  const files = useQuery({ queryKey: ['hiring', 'my-files'], queryFn: async () => (await getMyHrFiles()).data, retry: false });
  const esign = useQuery({ queryKey: MY_ESIGN_KEY, queryFn: listMine, retry: false });
  const schedule = useQuery({ queryKey: ['scheduleRequests', 'mine'], queryFn: async () => (await getScheduleRequests()).data });
  const fixes = useQuery({
    queryKey: ['modRequests', { employee: me, page_size: 100 }],
    queryFn: async () => (await getModificationRequests({ employee: me, page_size: 100 })).data.results,
    enabled: Boolean(me),
  });
  const incidents = useQuery({ queryKey: ['incidents', 'list'], queryFn: async () => (await getIncidents()).data });
  const questions = useQuery({ queryKey: ['hrQuestions'], queryFn: async () => (await getHrQuestions()).data });

  const tone = (status: string): { tone: Tone; label: string } => {
    if (status === 'pending' || status === 'open') return { tone: 'wait', label: t('waiting') };
    if (status === 'approved') return { tone: 'good', label: t('approved') };
    if (status === 'answered') return { tone: 'good', label: t('answered') };
    return { tone: 'problem', label: t('declined') };
  };
  const who = (name: string | null | undefined, text: string) => [name, text].filter(Boolean).join(': ');
  const clock = (iso: string | null) => (iso ? format(parseISO(iso), 'h:mmaaa') : '?');

  const requests: RequestRow[] = [
    ...(schedule.data ?? []).filter((r: ScheduleRequest) => r.employee === me && r.status !== 'withdrawn').map((r) => ({
      // describe() already starts with "Day off" or "New times".
      key: `s${r.id}`, kind: '', what: sched.describe(r),
      status: tone(r.status), reply: r.status === 'pending' ? '' : who(r.decided_by_name, r.reply), created_at: r.created_at,
    })),
    ...(fixes.data ?? []).filter((r: ModificationRequest) => r.employee === me).map((r) => ({
      key: `t${r.id}`, kind: t('kindTimeFix'),
      what: `${sched.date(r.entry_date)}: ${clock(r.requested_clock_in)}–${clock(r.requested_clock_out)}`,
      status: tone(r.status), reply: r.status === 'pending' ? '' : who(r.reviewed_by_name, r.review_note), created_at: r.created_at,
    })),
    ...(incidents.data?.reports ?? []).filter((r: IncidentSummary) => r.reported_by === me).map((r) => ({
      key: `i${r.id}`, kind: t('kindIncident'),
      what: `${incidentCopy.pick(KIND_COPY[r.kind], r.kind_label)} · ${incidentCopy.pick(PLACE_COPY[r.place], r.place_label)}`,
      status: r.status === 'open' ? { tone: 'info' as Tone, label: t('reportOpen') } : { tone: 'quiet' as Tone, label: t('reportClosed') },
      reply: '', created_at: r.created_at, href: `/hr/incidents?report=${r.id}`,
    })),
    // Questions are no longer started here (Bill: issues go to him), but ones already asked keep their answer in view.
    ...(questions.data ?? []).filter((q: HrQuestion) => q.employee === me).map((q) => ({
      key: `q${q.id}`, kind: t('kindQuestion'), what: q.question, status: tone(q.status),
      reply: q.status === 'answered' ? who(q.answered_by_name, q.answer) : '', created_at: q.created_at,
    })),
  ].sort((a, b) => when(b.created_at) - when(a.created_at));

  // The banner, as Today showed it: onboarding while their own items are open; else a check-in this week or just signed.
  const o = onboarding.data?.onboarding;
  const now = Date.now();
  const soon = (checkins.data ?? []).find((c) => c.status === 'scheduled' && when(`${c.due_date}T12:00:00`) - now < 7 * DAY);
  const fresh = (checkins.data ?? []).find((c) => c.status === 'done' && c.signed_at && now - when(c.signed_at) < 14 * DAY);
  let banner: Banner | null = null;
  if (o && o.status === 'active' && o.done < o.total) {
    banner = {
      title: `${t('onboarding')}: ${o.done} ${t('of')} ${o.total} ${t('done')}`,
      line: onboarding.data?.handbook && !onboarding.data.handbook.signed ? t('handbookReady') : undefined,
      progress: o.total ? (100 * o.done) / o.total : 0, to: '/onboarding', action: t('open'),
    };
  } else if (soon) {
    banner = {
      title: t('checkinSoon').replace('{day}', String(soon.day)).replace('{who}', soon.manager?.name ?? t('yourManager'))
        .replace('{date}', day(soon.due_date, 'EEE MMM d')),
      to: '/check-ins', action: t('myCheckins'),
    };
  } else if (fresh) {
    banner = { title: t('checkinSigned').replace('{day}', String(fresh.day)), to: '/check-ins', action: t('myCheckins') };
  }
  return {
    // The body waits for every list (the banner's too), so the banner and the rows never push anything later.
    loading: [onboarding, checkins, files, esign, schedule, fixes, incidents, questions].some((q) => q.isLoading),
    banner,
    esign: esign.data ?? [],
    files: files.data,
    filesFailed: files.isError || esign.isError,
    requests,
    requestsFailed: schedule.isError || fixes.isError || incidents.isError || questions.isError,
  };
}

function HrTabBody() {
  const { t, day } = useCopy();
  const { enqueueSnackbar } = useSnackbar();
  const incidentCopy = useIncidentCopy();
  const queryClient = useQueryClient();
  const data = useHrTabData();
  const [starting, setStarting] = useState<'off' | 'fix' | 'incident' | null>(null);
  const [fixing, setFixing] = useState<TimeEntry | null>(null);
  const [incidentError, setIncidentError] = useState('');
  const today = format(new Date(), 'yyyy-MM-dd');

  const report = useMutation({
    mutationFn: async ({ payload, photos }: { payload: IncidentWrite; photos: File[] }) => (await createIncident(payload, photos)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['incidents', 'list'] });
      void queryClient.invalidateQueries({ queryKey: ['store-map'] });
      enqueueSnackbar(incidentCopy.t('sent'), { variant: 'success' });
      setStarting(null);
    },
    onError: (err) => {
      const body = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
      const first = body ? Object.values(body)[0] : undefined;
      setIncidentError(Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : incidentCopy.t('couldNot'));
    },
  });

  if (data.loading) {
    return <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  const rows = fileRows(data.esign, data.files, t, (iso) => day(iso));
  return (
    <Stack spacing={{ xs: 2, md: 3 }} data-testid="hr-tab">
      {data.banner ? <HrBanner banner={data.banner} /> : null}
      <Box
        sx={{
          display: 'grid',
          gap: { xs: 2, md: 3 },
          alignItems: 'start',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          // Bill's order: Files, Training, SOPs, Requests. On a desk Requests takes the right column.
          gridTemplateAreas: { xs: '"files" "learn" "requests"', md: '"files requests" "learn requests"' },
        }}
      >
        <Box sx={{ gridArea: 'files', minWidth: 0 }}>
          <FilesSection rows={rows} failed={data.filesFailed} />
        </Box>
        <Box sx={{ gridArea: 'learn', minWidth: 0, display: 'grid', gap: { xs: 2, md: 3 }, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Soon title={t('training')} body={t('trainingBody')} Icon={SchoolRounded} />
          <Soon title={t('sops')} body={t('sopsBody')} Icon={ECO_ICONS.routine} />
        </Box>
        <Box sx={{ gridArea: 'requests', minWidth: 0 }}>
          <RequestsSection rows={data.requests} failed={data.requestsFailed} onStart={setStarting} />
        </Box>
      </Box>

      {starting === 'off' ? (
        <AskDialog initial={{ date: today }} today={today} onClose={() => setStarting(null)}
          onSent={() => void queryClient.invalidateQueries({ queryKey: ['scheduleRequests'] })} />
      ) : null}
      {starting === 'fix' ? (
        <ShiftChooser onClose={() => setStarting(null)} onPick={(entry) => { setStarting(null); setFixing(entry); }} />
      ) : null}
      <TimeChangeDialog entry={fixing} onClose={() => setFixing(null)} />
      <IncidentForm
        open={starting === 'incident'}
        report={null}
        busy={report.isPending}
        error={incidentError}
        onClose={() => setStarting(null)}
        onSubmit={(payload, photos) => {
          setIncidentError('');
          return report.mutateAsync({ payload, photos });
        }}
      />
    </Stack>
  );
}

/** Home > HR. On a desk inside the Home band (title + tab bar); on a phone the top bar and the bottom tab bar do that. */
export default function HrTab() {
  const lang = useLanguage();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('md'));
  const body = (
    <ThemeProvider theme={ecoTheme}>
      <Box sx={{ maxWidth: 1180, mx: 'auto', width: '100%', fontFamily: ecoFonts.body, color: 'text.primary' }}>
        <HrTabBody />
      </Box>
    </ThemeProvider>
  );
  if (phone) {
    return <Box sx={{ px: 2, py: 2, bgcolor: ecoTheme.palette.background.default, flex: 1 }}>{body}</Box>;
  }
  return <FloorPage title={tRoutines('hrTab', lang)}>{body}</FloorPage>;
}
