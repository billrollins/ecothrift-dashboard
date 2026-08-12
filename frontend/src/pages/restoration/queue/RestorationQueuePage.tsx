/**
 * The restoration queue from a Processing desk.
 *
 * Everything Ashley needs to hand an item over properly: what grade scale it is
 * on, what each grade is worth, where it should end up, and anything the bench
 * should know. The same list Mike sees on TARS Home.
 */
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import { useMemo } from 'react';
import { PageHeader } from '../../../components/common/PageHeader';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { useTarsBenchJobs } from '../../../hooks/useRestorationBench';
import { RestorationQueue } from './RestorationQueue';
import { isReadyForBench } from './restorationQueueModel';

export default function RestorationQueuePage() {
  const { data: jobs = [], isLoading } = useTarsBenchJobs();
  const { scales } = useGradeScales();

  const queueJobs = useMemo(
    () => jobs.filter((j) => j.stage === 'queued' || j.stage === 'sent'),
    [jobs],
  );

  const blocked = useMemo(
    () => queueJobs.filter((j) => !isReadyForBench(j, scales[j.scale] ?? [])).length,
    [queueJobs, scales],
  );

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <PageHeader
        title="Restoration queue"
        subtitle={
          blocked > 0
            ? `${queueJobs.length} waiting · ${blocked} cannot start until their grades are priced`
            : `${queueJobs.length} waiting · all priced and ready`
        }
      />
      {isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress size={30} />
        </Box>
      ) : (
        <Box sx={{ maxWidth: 1180 }}>
          <RestorationQueue jobs={queueJobs} emptyMessage="Nothing is waiting for restoration." />
        </Box>
      )}
    </Box>
  );
}
