/**
 * One incident report (#131): what was written, the spot, photos, and its history (notes, edits with the old text,
 * closing). Managers and the owner close and reopen; anyone who sees it adds a note.
 */
import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import { AddPhoto } from '../../../components/photos/AddPhoto';
import {
  getIncidentPhoto,
  type IncidentDetail,
  type IncidentNoteDTO,
  type IncidentReviewNoteChanges,
  type IncidentTextField,
} from '../../../api/incidents.api';
import { IncidentReviewPanel } from './IncidentReviewPanel';
import { IncidentSpotView } from './IncidentMap';
import { MAX_PHOTOS } from './IncidentForm';
import { FIELD_COPY, KIND_COPY, PLACE_COPY, ROLE_COPY, useIncidentCopy } from './incidentCopy';
import { StaffLink } from '../../../components/staff/StaffLink';

function Photo({ reportId, photoId }: { reportId: number; photoId: number }) {
  const { data } = useQuery({
    queryKey: ['incidents', 'photo', reportId, photoId],
    queryFn: async () => (await getIncidentPhoto(reportId, photoId)).data,
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!data) return undefined;
    const next = URL.createObjectURL(data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [data]);
  // A fixed box, so a photo that loads late moves nothing.
  return (
    <Box component="a" href={url ?? undefined} target="_blank" rel="noreferrer"
      sx={{ width: 96, height: 96, borderRadius: 1, border: 1, borderColor: 'divider', overflow: 'hidden', bgcolor: 'action.hover', display: 'block' }}>
      {url ? <Box component="img" src={url} alt="" data-testid="incident-photo-img" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
    </Box>
  );
}

export function StatusChip({ status }: { status: 'open' | 'closed' }) {
  const { t } = useIncidentCopy();
  return (
    <Chip size="small" label={t(status)} color={status === 'open' ? 'warning' : 'default'}
      sx={{ width: 76, fontWeight: 700 }} data-testid="incident-status" />
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{label}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{value}</Typography>
    </Box>
  );
}

function HistoryLine({ note }: { note: IncidentNoteDTO }) {
  const { t, pick, at } = useIncidentCopy();
  const show = (field: string, value: unknown): string => {
    if (value === null || value === undefined || value === '') return t('empty');
    if (typeof value === 'boolean') return value ? t('yes') : t('no');
    if (field === 'occurred_at' && typeof value === 'string') return at(value);
    if (field === 'kind') return pick(KIND_COPY[value as keyof typeof KIND_COPY], String(value));
    if (field === 'place') return pick(PLACE_COPY[value as keyof typeof PLACE_COPY], String(value));
    if (field === 'people' && Array.isArray(value)) {
      return value.map((p) => [pick(ROLE_COPY[p.role as keyof typeof ROLE_COPY], p.role), p.name, p.contact]
        .filter(Boolean).join(', ')).join('; ') || t('empty');
    }
    if (field === 'map') return t('spot');
    return String(value);
  };
  if (note.kind === 'ai_review') {
    const review = note.changes as IncidentReviewNoteChanges;
    return (
      <Box data-testid="incident-history-ai_review">
        <Typography variant="caption" color="text.secondary">
          {at(note.created_at)} · {note.author_name} {t('aiRan')}
        </Typography>
        <Typography variant="body2">
          {Object.keys(review.fields ?? {}).length} {t('aiSuggested')} · {(review.questions ?? []).length} {t('aiAsked')}
        </Typography>
      </Box>
    );
  }
  const head = note.kind === 'closed' ? t('closedIt') : note.kind === 'reopened' ? t('reopenedIt')
    : note.kind === 'edit' ? t('changed') : '';
  return (
    <Box data-testid={`incident-history-${note.kind}`}>
      <Typography variant="caption" color="text.secondary">
        {at(note.created_at)} · {note.author_name}{head ? ` ${head}` : ''}
      </Typography>
      {note.body ? <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{note.body}</Typography> : null}
      {Object.entries((note.changes ?? {}) as Record<string, { old: unknown; new: unknown }>).map(([field, change]) => (
        <Typography key={field} variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
          <b>{pick(FIELD_COPY[field], field)}</b> · {t('was')}: <s>{show(field, change.old)}</s> · {t('nowIs')}: {show(field, change.new)}
        </Typography>
      ))}
    </Box>
  );
}

export interface IncidentDetailDialogProps {
  report: IncidentDetail | null;
  loading: boolean;
  missing: boolean;
  canManage: boolean;
  myId: number | undefined;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onNote: (body: string) => Promise<unknown>;
  onStatus: (action: 'close' | 'reopen') => Promise<unknown>;
  onPhotos: (files: File[]) => Promise<unknown>;
  /** AI review (#133). */
  reviewing: boolean;
  onReview: () => Promise<unknown>;
  onReviewDecide: (choice: 'keep' | 'revert', field: IncidentTextField | null) => Promise<unknown>;
  onReviewAnswer: (index: number, answer: string) => Promise<unknown>;
  onReviewDone: () => Promise<unknown>;
}

export function IncidentDetailDialog({
  report, loading, missing, canManage, myId, busy, onClose, onEdit, onNote, onStatus, onPhotos,
  reviewing, onReview, onReviewDecide, onReviewAnswer, onReviewDone,
}: IncidentDetailDialogProps) {
  const { t, pick, at } = useIncidentCopy();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [note, setNote] = useState('');
  const open = Boolean(report) || loading || missing;
  useEffect(() => setNote(''), [report?.id]);
  const canEdit = Boolean(report && (canManage || (report.reported_by === myId && report.status === 'open')));
  const review = report?.ai_review ?? null;
  // A box under review shows inside the review (original and tidied), not twice; one changed since shows as it is now.
  const inReview = new Set<string>(review?.fields.filter((f) => f.now !== 'changed').map((f) => f.field) ?? []);
  const fact = (field: IncidentTextField, label: string, value: string) =>
    inReview.has(field) ? null : <Fact label={label} value={value} />;

  return (
    <Dialog open={open} onClose={onClose} fullScreen={phone} fullWidth maxWidth="sm" data-testid="incident-detail">
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {report ? `${pick(KIND_COPY[report.kind], report.kind_label)} · ${pick(PLACE_COPY[report.place], report.place_label)}` : t('title')}
        </Box>
        {report ? <StatusChip status={report.status} /> : null}
      </DialogTitle>
      <Box sx={{ height: 4 }}>{busy || loading || reviewing ? <LinearProgress /> : null}</Box>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {missing ? <Alert severity="info">{t('notFound')}</Alert> : null}
        {report ? (
          <>
            <Typography variant="body2" color="text.secondary">
              {t('happened')}: {at(report.occurred_at)} · {t('reportedBy')} <StaffLink userId={report.reported_by}>{report.reported_by_name}</StaffLink>, {at(report.created_at)}
            </Typography>
            {review ? (
              <IncidentReviewPanel review={review} busy={busy || reviewing} onDecide={onReviewDecide}
                onAnswer={onReviewAnswer} onDone={onReviewDone} />
            ) : null}
            {fact('place_detail', t('whereDetail'), report.place_detail)}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t('who')}</Typography>
              {report.people.length ? report.people.map((p, i) => (
                <Typography key={i} variant="body2">
                  {pick(ROLE_COPY[p.role], p.role)}{p.name ? `: ${p.name}` : ''}{p.contact ? ` · ${p.contact}` : ''}
                </Typography>
              )) : <Typography variant="body2">{t('noPeople')}</Typography>}
            </Box>
            {fact('what_happened', t('what'), report.what_happened)}
            <Fact label={t('injuries')} value={[
              inReview.has('injuries') ? '' : report.injuries,
              report.first_aid ? t('firstAid') : '',
              report.called_911 ? t('called911') : '',
            ].filter(Boolean).join('\n')} />
            {fact('witnesses', t('witnesses'), report.witnesses)}
            {fact('cameras', t('cameras'), report.cameras)}
            {fact('follow_up', t('followUp'), report.follow_up)}
            {report.map_pin ? (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t('spot')}</Typography>
                <IncidentSpotView spot={report.map_pin} />
              </Box>
            ) : null}
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>{t('photos')}</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {report.photos.map((id) => <Photo key={id} reportId={report.id} photoId={id} />)}
                <AddPhoto multiple max={MAX_PHOTOS - report.photos.length}
                  disabled={busy || report.photos.length >= MAX_PHOTOS} label={t('addPhoto')} usedWhere="Incident report"
                  fileInputTestId="incident-more-photo" onPhotos={(files) => { void onPhotos(files).catch(() => undefined); }} />
              </Box>
            </Box>
            <Divider />
            <Typography sx={{ fontWeight: 700 }}>{t('history')}</Typography>
            <Stack spacing={1.25}>
              <Typography variant="caption" color="text.secondary">
                {at(report.created_at)} · <StaffLink userId={report.reported_by}>{report.reported_by_name}</StaffLink> {t('filed')}
              </Typography>
              {report.notes.map((n) => <HistoryLine key={n.id} note={n} />)}
            </Stack>
            <TextField label={t('addNote')} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2}
              fullWidth slotProps={{ htmlInput: { maxLength: 4000, 'data-testid': 'incident-note' } }} />
            <Box>
              <Button variant="outlined" disabled={busy || !note.trim()} data-testid="incident-note-send"
                onClick={() => void onNote(note.trim()).then(() => setNote('')).catch(() => undefined)}>
                {t('sendNote')}
              </Button>
            </Box>
          </>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
        {report && canEdit ? <Button onClick={onEdit} disabled={busy || reviewing} data-testid="incident-edit">{t('edit')}</Button> : null}
        {report && canEdit ? (
          // One width whatever it says, so nothing beside it moves while the AI works.
          <Button onClick={() => void onReview().catch(() => undefined)} disabled={busy || reviewing}
            startIcon={<AutoAwesomeRounded />} sx={{ minWidth: 150 }} data-testid="incident-ai-review-run">
            {reviewing ? t('aiReviewing') : review ? t('aiReviewAgain') : t('aiReview')}
          </Button>
        ) : null}
        {report && canManage ? (
          report.status === 'open' ? (
            <Button color="success" variant="outlined" disabled={busy} onClick={() => void onStatus('close').catch(() => undefined)}
              data-testid="incident-close">{t('closeReport')}</Button>
          ) : (
            <Button variant="outlined" disabled={busy} onClick={() => void onStatus('reopen').catch(() => undefined)}
              data-testid="incident-reopen">{t('reopen')}</Button>
          )
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
