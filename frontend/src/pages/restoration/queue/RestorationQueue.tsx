/**
 * A list of restoration items, mounted wherever someone might need to fix one.
 *
 * Ashley works it from `/restoration/queue` at her own desk; the same component
 * sits on TARS Home so she can lean over and use Mike's screen. One
 * implementation, so the two can never drift.
 *
 * Edits save as they are made. There is no Save button because there is nothing
 * to save at — leaving a field commits it. Success is silent: the value on the
 * row is the confirmation, and a toast per field would be unreadable when
 * twenty items are being filled in. Only failures speak up.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { useSnackbar } from 'notistack';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { usePatchRestorationQueueDetails } from '../../../hooks/useRestorationBench';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { RestorationQueueCard, type QueueEdit } from './RestorationQueueCard';
import { sortQueue } from './restorationQueueModel';

export function RestorationQueue({
  jobs,
  accent,
  onStart,
  emptyMessage = 'Nothing here.',
}: {
  jobs: RestorationJobDTO[];
  accent: string;
  /** Omitted where there is no bench to send an item to. */
  onStart?: (job: RestorationJobDTO) => void;
  emptyMessage?: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { scales } = useGradeScales();
  const patchDetails = usePatchRestorationQueueDetails();

  const ordered = useMemo(() => sortQueue(jobs, scales), [jobs, scales]);

  function applyEdit(jobId: number, patch: QueueEdit) {
    patchDetails.mutate(
      { id: jobId, payload: patch },
      {
        onError: (err) =>
          enqueueSnackbar(err instanceof Error ? err.message : 'Could not save that change', {
            variant: 'error',
          }),
      },
    );
  }

  if (ordered.length === 0) {
    return (
      <Box
        sx={{
          py: 5,
          textAlign: 'center',
          borderRadius: `${studio.radius.lg}px`,
          border: `1px dashed ${studio.panelBorder}`,
          color: '#94a3b8',
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{emptyMessage}</Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1} sx={{ width: '100%' }}>
      {ordered.map((job) => (
        <RestorationQueueCard
          key={job.id}
          job={job}
          scales={scales}
          accent={accent}
          onEdit={applyEdit}
          onStart={onStart}
        />
      ))}
    </Stack>
  );
}
