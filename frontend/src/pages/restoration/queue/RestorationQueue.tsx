/**
 * The restoration queue, mounted in two places.
 *
 * Ashley works it from `/restoration/queue` at her own desk; the same component
 * sits on TARS Home so she can lean over and use Mike's screen instead. One
 * implementation, so the two can never drift.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { usePatchRestorationQueueDetails } from '../../../hooks/useRestorationBench';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { RestorationQueueCard } from './RestorationQueueCard';
import {
  RestorationQueueDetailsDialog,
  type QueueDetailsSubmit,
} from './RestorationQueueDetailsDialog';
import { sortQueue } from './restorationQueueModel';

export function RestorationQueue({
  jobs,
  busy,
  onStart,
  emptyMessage = 'Nothing waiting.',
}: {
  jobs: RestorationJobDTO[];
  busy?: boolean;
  /** Omitted where the queue is read from outside the studio. */
  onStart?: (job: RestorationJobDTO) => void;
  emptyMessage?: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { scales } = useGradeScales();
  const patchDetails = usePatchRestorationQueueDetails();
  const [detailsJob, setDetailsJob] = useState<RestorationJobDTO | null>(null);

  const ordered = useMemo(() => sortQueue(jobs, scales), [jobs, scales]);

  // Keep the open dialog pointed at fresh data after a save.
  const liveDetailsJob = useMemo(
    () => (detailsJob ? jobs.find((j) => j.id === detailsJob.id) ?? detailsJob : null),
    [detailsJob, jobs],
  );

  async function saveDetails(jobId: number, payload: QueueDetailsSubmit) {
    try {
      await patchDetails.mutateAsync({ id: jobId, payload });
      setDetailsJob(null);
      enqueueSnackbar('Queue details saved', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(err instanceof Error ? err.message : 'Could not save queue details', {
        variant: 'error',
      });
    }
  }

  return (
    <>
      {ordered.length === 0 ? (
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
      ) : (
        <Stack spacing={1}>
          {ordered.map((job) => (
            <RestorationQueueCard
              key={job.id}
              job={job}
              scaleGrades={scales[job.scale] ?? []}
              busy={busy}
              onOpenDetails={setDetailsJob}
              onStart={onStart}
            />
          ))}
        </Stack>
      )}

      <RestorationQueueDetailsDialog
        job={liveDetailsJob}
        scales={scales}
        busy={patchDetails.isPending}
        onClose={() => setDetailsJob(null)}
        onSubmit={saveDetails}
      />
    </>
  );
}
