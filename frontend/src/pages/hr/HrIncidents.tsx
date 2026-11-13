/**
 * HR -> Incidents (Samantha + Bill, Dash Updates #131, 2026-11-13): any staff member reports an incident on a phone
 * right after it happens and sees their own reports; managers and the owner see every report, add follow-up notes and
 * close one. The owner gets a Dash message on each new report. Nothing is deleted; an edit keeps the old text.
 * `?report=<id>` opens one report (the owner's message links here).
 */
import { useState } from 'react';
import { Alert, Box, Button, ButtonBase, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ReportGmailerrorredRounded from '@mui/icons-material/ReportGmailerrorredRounded';
import PhotoCameraOutlined from '@mui/icons-material/PhotoCameraOutlined';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../../hooks/useAuth';
import {
  addIncidentNote,
  addIncidentPhotos,
  answerIncidentReview,
  decideIncidentReview,
  finishIncidentReview,
  runIncidentReview,
  createIncident,
  getIncident,
  getIncidents,
  setIncidentStatus,
  updateIncident,
  type IncidentDetail,
  type IncidentSummary,
  type IncidentTextField,
  type IncidentWrite,
} from '../../api/incidents.api';
import { IncidentForm } from './incidents/IncidentForm';
import { IncidentDetailDialog, StatusChip } from './incidents/IncidentDetailDialog';
import { KIND_COPY, PLACE_COPY, useIncidentCopy } from './incidents/incidentCopy';
import { StaffLink } from '../../components/staff/StaffLink';

type Filter = 'open' | 'closed' | 'all';

function errorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data && typeof data === 'object') {
    const first = Object.values(data as Record<string, unknown>)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    if (typeof first === 'string') return first;
  }
  return fallback;
}

function Row({ report, onOpen }: { report: IncidentSummary; onOpen: () => void }) {
  const { pick, at } = useIncidentCopy();
  return (
    <ButtonBase onClick={onOpen} data-testid={`incident-row-${report.id}`}
      sx={{ display: 'flex', width: '100%', textAlign: 'left', gap: 1.5, alignItems: 'flex-start', p: 1.5,
        border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }} noWrap>
          {pick(KIND_COPY[report.kind], report.kind_label)} · {pick(PLACE_COPY[report.place], report.place_label)}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {at(report.occurred_at)} · <StaffLink userId={report.reported_by}>{report.reported_by_name}</StaffLink>
        </Typography>
        <Typography variant="body2" noWrap>{report.what_happened}</Typography>
      </Box>
      <Stack spacing={0.5} alignItems="flex-end" sx={{ flexShrink: 0 }}>
        <StatusChip status={report.status} />
        {/* Counts keep one width, shown or not, so rows line up. */}
        <Stack direction="row" spacing={1} sx={{ color: 'text.secondary', minWidth: 76, justifyContent: 'flex-end' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, visibility: report.photo_count ? 'visible' : 'hidden' }}>
            <PhotoCameraOutlined sx={{ fontSize: 16 }} /><Typography variant="caption">{report.photo_count}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, visibility: report.note_count ? 'visible' : 'hidden' }}>
            <ChatBubbleOutlineRounded sx={{ fontSize: 16 }} /><Typography variant="caption">{report.note_count}</Typography>
          </Box>
        </Stack>
      </Stack>
    </ButtonBase>
  );
}

export default function HrIncidents() {
  const { t, lang } = useIncidentCopy();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('open');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IncidentDetail | null>(null);
  const [formError, setFormError] = useState('');

  const list = useQuery({
    queryKey: ['incidents', 'list'],
    queryFn: async () => (await getIncidents()).data,
    refetchInterval: 60_000,
  });
  const canManage = list.data?.can_manage ?? false;
  const reports = (list.data?.reports ?? []).filter((r) => !canManage || filter === 'all' || r.status === filter);

  const selectedId = Number(params.get('report')) || null;
  const detail = useQuery({
    queryKey: ['incidents', 'detail', selectedId],
    queryFn: async () => (await getIncident(selectedId as number)).data,
    enabled: selectedId != null,
    retry: false,
  });
  const openReport = (id: number | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('report', String(id));
    else next.delete('report');
    setParams(next, { replace: true });
  };

  const refresh = (row: IncidentDetail) => {
    queryClient.setQueryData(['incidents', 'detail', row.id], row);
    void queryClient.invalidateQueries({ queryKey: ['incidents', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['store-map'] });
  };
  const act = useMutation({
    mutationFn: async (fn: () => Promise<{ data: IncidentDetail }>) => (await fn()).data,
    onSuccess: refresh,
    onError: (err) => enqueueSnackbar(errorText(err, t('couldNot')), { variant: 'error' }),
  });
  // AI review (#133): its own pending flag, so the button can say it is reviewing while the AI works.
  const review = useMutation({
    mutationFn: async () => (await runIncidentReview(selectedId as number, lang)).data,
    onSuccess: refresh,
    onError: (err) => enqueueSnackbar(errorText(err, t('couldNot')), { variant: 'error' }),
  });
  const decide = (choice: 'keep' | 'revert', field: IncidentTextField | null) =>
    act.mutateAsync(async () => {
      const res = await decideIncidentReview(selectedId as number, choice, field, lang);
      if (res.data.skipped) enqueueSnackbar(t('aiSkipped'), { variant: 'warning' });
      return res;
    });
  const save = useMutation({
    mutationFn: async ({ payload, photos }: { payload: IncidentWrite; photos: File[] }) =>
      (editing ? await updateIncident(editing.id, payload) : await createIncident(payload, photos)).data,
    onSuccess: (row) => {
      refresh(row);
      enqueueSnackbar(editing ? t('saved') : t('sent'), { variant: 'success' });
      setFormOpen(false);
      if (!editing) openReport(row.id);
      setEditing(null);
    },
    onError: (err) => setFormError(errorText(err, t('couldNot'))),
  });

  const startNew = () => {
    setEditing(null);
    setFormError('');
    setFormOpen(true);
  };

  return (
    <Box data-testid="hr-incidents" sx={{ maxWidth: 760 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{t('intro')}</Typography>
      <Button variant="contained" color="error" size="large" startIcon={<ReportGmailerrorredRounded />} onClick={startNew}
        data-testid="incident-new" sx={{ mb: 2, width: { xs: '100%', sm: 'auto' } }}>
        {t('report')}
      </Button>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, minHeight: 40 }}>
        <Typography sx={{ fontWeight: 700, flex: 1 }}>{canManage ? t('title') : t('yours')}</Typography>
        {canManage ? (
          <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_, v: Filter | null) => v && setFilter(v)}
            aria-label={t('title')}>
            <ToggleButton value="open" sx={{ textTransform: 'none' }} data-testid="incident-filter-open">{t('open')}</ToggleButton>
            <ToggleButton value="closed" sx={{ textTransform: 'none' }}>{t('closed')}</ToggleButton>
            <ToggleButton value="all" sx={{ textTransform: 'none' }}>{t('all')}</ToggleButton>
          </ToggleButtonGroup>
        ) : null}
      </Box>
      {list.isError ? <Alert severity="error">{t('loadFailed')}</Alert> : null}
      <Stack spacing={1}>
        {reports.map((r) => <Row key={r.id} report={r} onOpen={() => openReport(r.id)} />)}
        {list.isSuccess && !reports.length ? <Typography color="text.secondary">{t('none')}</Typography> : null}
      </Stack>

      <IncidentDetailDialog
        report={detail.data ?? null}
        loading={selectedId != null && detail.isLoading}
        missing={selectedId != null && detail.isError}
        canManage={canManage}
        myId={user?.id}
        busy={act.isPending}
        onClose={() => openReport(null)}
        onEdit={() => {
          setEditing(detail.data ?? null);
          setFormError('');
          setFormOpen(true);
        }}
        onNote={(body) => act.mutateAsync(() => addIncidentNote(selectedId as number, body))}
        onStatus={(action) => act.mutateAsync(() => setIncidentStatus(selectedId as number, action))}
        onPhotos={(files) => act.mutateAsync(() => addIncidentPhotos(selectedId as number, files))}
        reviewing={review.isPending}
        onReview={() => review.mutateAsync()}
        onReviewDecide={decide}
        onReviewAnswer={(index, answer) => act.mutateAsync(() => answerIncidentReview(selectedId as number, index, answer, lang))}
        onReviewDone={() => act.mutateAsync(() => finishIncidentReview(selectedId as number))}
      />
      <IncidentForm
        open={formOpen}
        report={editing}
        busy={save.isPending}
        error={formError}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(payload, photos) => {
          setFormError('');
          return save.mutateAsync({ payload, photos });
        }}
      />
    </Box>
  );
}
