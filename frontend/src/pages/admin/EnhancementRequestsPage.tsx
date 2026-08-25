import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import { useMemo, useState } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { AreaBadge } from '../../components/enhancements/AreaBadge';
import { RequestsBoard } from '../../components/enhancements/RequestsBoard';
import {
  useAddEnhancementRequestNote,
  useEnhancementRequests,
  useTriageEnhancementRequest,
  useUpdateEnhancementRequest,
} from '../../hooks/useEnhancementRequests';
import {
  ENHANCEMENT_STATUSES,
  requestsForFilter,
  statusWord,
  type EnhancementAreaFilter,
  type EnhancementStatusFilter,
} from './enhancementRequestsTable';

function actionError(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail.trim() ? detail : fallback;
}

export default function EnhancementRequestsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const { data: rows = [], isLoading } = useEnhancementRequests();
  const update = useUpdateEnhancementRequest();
  const addNote = useAddEnhancementRequestNote();
  const triage = useTriageEnhancementRequest();
  const [area, setArea] = useState<EnhancementAreaFilter>('all');
  const [status, setStatus] = useState<EnhancementStatusFilter>('all');
  const visible = useMemo(() => requestsForFilter(rows, area, status), [rows, area, status]);
  const busy = update.isPending || addNote.isPending || triage.isPending;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Enhancement requests"
        subtitle="Set priority, a target date, and status. Staff read the same list from the Requests tab."
        dense
      />
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <TextField
          select
          size="small"
          label="Area"
          value={area}
          onChange={(event) => setArea(event.target.value as EnhancementAreaFilter)}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="all">All areas</MenuItem>
          <MenuItem value="restoration">
            <AreaBadge area="restoration" />
          </MenuItem>
          <MenuItem value="processing">
            <AreaBadge area="processing" />
          </MenuItem>
        </TextField>
        <TextField
          select
          size="small"
          label="Status"
          value={status}
          onChange={(event) => setStatus(event.target.value as EnhancementStatusFilter)}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="all">All statuses</MenuItem>
          {ENHANCEMENT_STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {statusWord(value)}
            </MenuItem>
          ))}
        </TextField>
        <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.5, color: 'text.secondary' }}>
          {visible.length} SHOWN
        </Typography>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 420, display: 'flex' }}>
        <RequestsBoard
          rows={visible}
          loading={isLoading}
          triage
          busy={busy}
          emptyText={
            area === 'all' && status === 'all'
              ? 'No enhancement requests.'
              : 'Nothing with this filter.'
          }
          onSave={(id, payload) =>
            update.mutate(
              { id, payload },
              {
                onError: (err) =>
                  enqueueSnackbar(actionError(err, 'Could not save that'), { variant: 'error' }),
              },
            )
          }
          onNote={(id, note) =>
            addNote.mutate(
              { id, body: note },
              {
                onError: (err) =>
                  enqueueSnackbar(actionError(err, 'Could not add that note'), { variant: 'error' }),
              },
            )
          }
          onTriage={(id, payload) =>
            triage.mutate(
              { id, payload },
              {
                onError: (err) =>
                  enqueueSnackbar(actionError(err, 'Could not update that'), { variant: 'error' }),
              },
            )
          }
        />
      </Box>
    </Box>
  );
}
