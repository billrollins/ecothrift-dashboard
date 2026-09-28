import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { format, parseISO } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useEffect, useMemo, useState } from 'react';
import { approveRequest, fetchApprovalRequests, rejectRequest, resumeRequest, undoRequest } from '../../api/approvalRequests.api';
import type { ApprovalRequest, ApprovalRequestStatus } from '../../types/approvalRequests.types';

const TABS: Array<{ value: string; label: string; statuses: ApprovalRequestStatus[] | null }> = [
  { value: 'waiting', label: 'Waiting', statuses: ['pending'] },
  { value: 'active', label: 'Running', statuses: ['approved', 'running', 'failed'] },
  { value: 'done', label: 'Done', statuses: ['applied', 'rejected', 'undone'] },
  { value: 'all', label: 'All', statuses: null },
];

const STATUS: Record<ApprovalRequestStatus, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' }> = {
  pending: { label: 'Waiting for you', color: 'warning' },
  approved: { label: 'Starting', color: 'info' },
  running: { label: 'Applying', color: 'info' },
  applied: { label: 'Applied', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
  rejected: { label: 'Rejected', color: 'default' },
  undone: { label: 'Undone', color: 'default' },
};

function when(iso: string | null): string {
  return iso ? format(parseISO(iso), 'MMM d, h:mm a') : '';
}

function cell(value: unknown): string {
  if (value == null || value === '') return '-';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function errorText(err: unknown, fallback: string): string {
  if (isAxiosError(err) && typeof err.response?.data?.detail === 'string') return err.response.data.detail;
  return fallback;
}

function Evidence({ req }: { req: ApprovalRequest }) {
  const counts = Object.entries(req.preview.counts ?? {});
  const sample = req.preview.sample ?? [];
  const columns = useMemo(() => {
    const keys = new Set<string>();
    sample.slice(0, 20).forEach((row) => Object.keys(row).forEach((k) => keys.add(k)));
    return [...keys];
  }, [sample]);
  return (
    <Stack spacing={2}>
      {counts.length ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 1 }}>
          {counts.map(([label, value]) => (
            <Paper key={label} variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{cell(value)}</Typography>
            </Paper>
          ))}
        </Box>
      ) : null}
      {req.preview.changes?.length ? (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>What changes</Typography>
          {req.preview.changes.map((line) => (
            <Typography key={line} variant="body2" sx={{ mb: 0.25 }}>• {line}</Typography>
          ))}
        </Box>
      ) : null}
      {sample.length ? (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Sample ({sample.length} rows)</Typography>
          <Paper variant="outlined" sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {columns.map((c) => <TableCell key={c} sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{c}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {sample.map((row, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => <TableCell key={c}>{cell(row[c])}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      ) : null}
    </Stack>
  );
}

function Detail({ req }: { req: ApprovalRequest }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [note, setNote] = useState('');
  const [confirmUndo, setConfirmUndo] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['approval-requests'] });
  const act = useMutation({
    mutationFn: ({ what }: { what: 'approve' | 'reject' | 'undo' | 'resume' }) => {
      if (what === 'approve') return approveRequest(req.id, note);
      if (what === 'reject') return rejectRequest(req.id, note);
      if (what === 'undo') return undoRequest(req.id);
      return resumeRequest(req.id);
    },
    onSuccess: (_, { what }) => {
      enqueueSnackbar({ approve: 'Approved: applying now.', reject: 'Rejected.', undo: 'Undone.', resume: 'Resumed.' }[what], { variant: 'success' });
      setNote('');
      setConfirmUndo(false);
      refresh();
    },
    onError: (err) => enqueueSnackbar(errorText(err, 'That did not work.'), { variant: 'error' }),
  });
  const s = STATUS[req.status];
  const total = req.progress.total ?? 0;
  const done = req.progress.done ?? 0;
  const resultEntries = Object.entries(req.result ?? {}).filter(([, v]) => typeof v !== 'object' || v === null);

  return (
    <Stack spacing={2}>
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{req.title}</Typography>
          <Chip size="small" color={s.color} label={req.stale ? 'Stalled' : s.label} />
          <Chip size="small" variant="outlined" label={req.kind_label} />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          #{req.id} · staged {when(req.created_at)}{req.requested_by ? ` by ${req.requested_by}` : ''}
          {req.decided_by_name ? ` · decided by ${req.decided_by_name} ${when(req.decided_at)}` : ''}
        </Typography>
        {req.summary ? <Typography variant="body2" sx={{ mt: 1 }}>{req.summary}</Typography> : null}
        {req.decision_note ? <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Note: {req.decision_note}</Typography> : null}
      </Box>

      {req.status === 'pending' ? (
        <Paper variant="outlined" sx={{ p: 1.5, borderColor: 'warning.main' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <TextField size="small" fullWidth placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button variant="contained" onClick={() => act.mutate({ what: 'approve' })} disabled={act.isPending} sx={{ minWidth: 120 }}>
              Approve
            </Button>
            <Button color="inherit" onClick={() => act.mutate({ what: 'reject' })} disabled={act.isPending}>Reject</Button>
          </Stack>
        </Paper>
      ) : null}

      {['approved', 'running'].includes(req.status) ? (
        <Box>
          <LinearProgress variant={total ? 'determinate' : 'indeterminate'} value={total ? (done / total) * 100 : undefined} />
          <Typography variant="caption" color="text.secondary">
            {total ? `${done.toLocaleString()} of ${total.toLocaleString()}` : 'Starting…'}
          </Typography>
        </Box>
      ) : null}
      {req.status === 'failed' || req.stale ? (
        <Alert
          severity={req.status === 'failed' ? 'error' : 'warning'}
          action={<Button color="inherit" size="small" onClick={() => act.mutate({ what: 'resume' })} disabled={act.isPending}>Resume</Button>}
        >
          {req.status === 'failed' ? req.error.split('\n')[0] : 'No progress for 5 minutes (a deploy or restart). Resume carries on from where it stopped.'}
        </Alert>
      ) : null}

      {resultEntries.length ? (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack direction="row" spacing={3} useFlexGap flexWrap="wrap" alignItems="center">
            {resultEntries.map(([k, v]) => (
              <Typography key={k} variant="body2"><b>{cell(v)}</b> {k.replace(/_/g, ' ')}</Typography>
            ))}
            {req.can_undo ? (
              <Button size="small" color="warning" variant="outlined" onClick={() => setConfirmUndo(true)} sx={{ ml: 'auto' }}>
                Undo
              </Button>
            ) : null}
          </Stack>
        </Paper>
      ) : null}

      <Evidence req={req} />

      {req.log ? (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>Log</Typography>
          <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'action.hover', borderRadius: 1, fontSize: 12, maxHeight: 220, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {req.log}
          </Box>
        </Box>
      ) : null}

      <Dialog open={confirmUndo} onClose={() => setConfirmUndo(false)}>
        <DialogTitle>Undo this request?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">{req.title}: this reverses what it applied, and it is logged.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmUndo(false)}>Cancel</Button>
          <Button color="warning" variant="contained" onClick={() => act.mutate({ what: 'undo' })} disabled={act.isPending}>Undo</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/**
 * Superuser → Requests: routine data work staged in production waits here for the owner.
 * Approve starts it in the background (it can be undone); Reject closes it. J/K move.
 */
export default function RequestsPage() {
  const [tab, setTab] = useState('waiting');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const statuses = TABS.find((t) => t.value === tab)?.statuses;
  const query = useQuery({
    queryKey: ['approval-requests', tab],
    queryFn: () => fetchApprovalRequests(statuses ? statuses.join(',') : undefined),
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => ['approved', 'running'].includes(r.status)) ? 3000 : 30_000),
  });
  const rows = useMemo(() => query.data ?? [], [query.data]);
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (e.key !== 'j' && e.key !== 'k') return;
      const i = selected ? rows.findIndex((r) => r.id === selected.id) : -1;
      const next = rows[Math.min(Math.max(i + (e.key === 'j' ? 1 : -1), 0), rows.length - 1)];
      if (next) setSelectedId(next.id);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, selected]);

  return (
    <Box>
      <Stack direction="row" alignItems="center">
        <Typography variant="h5" component="h1" sx={{ fontWeight: 800, flex: 1 }}>Requests</Typography>
        <Button href="/admin/qa">Data QA checks</Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Routine data work staged in production for your approval. Nothing changes until you approve, and applied requests can be undone.
      </Typography>
      <Tabs value={tab} onChange={(_, v: string) => { setTab(v); setSelectedId(null); }} sx={{ mb: 1.5 }}>
        {TABS.map((t) => <Tab key={t.value} value={t.value} label={t.label} sx={{ textTransform: 'none' }} />)}
      </Tabs>
      {query.isError ? <Alert severity="error">Could not load requests.</Alert> : null}
      {!query.isLoading && rows.length === 0 ? (
        <Alert severity="info">{tab === 'waiting' ? 'Nothing is waiting for you.' : 'No requests here.'}</Alert>
      ) : null}
      {rows.length ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
          <Paper variant="outlined">
            <List dense disablePadding>
              {rows.map((r) => (
                <ListItemButton key={r.id} selected={selected?.id === r.id} onClick={() => setSelectedId(r.id)}>
                  <ListItemText
                    primary={r.title}
                    secondary={`${STATUS[r.status].label}${r.stale ? ' (stalled)' : ''} · ${when(r.created_at)}`}
                    slotProps={{ primary: { fontWeight: 700, noWrap: true } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Paper>
          {selected ? (
            <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
              <Detail key={selected.id} req={selected} />
            </Paper>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
