/**
 * Restoration from a Processing desk.
 *
 * Three lists of the same kind of row: waiting, being worked, parked. All three
 * are editable, because an item does not stop needing a price or a destination
 * the moment it reaches a bench, and the person who knows the answer is rarely
 * the one holding it.
 */
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { PageHeader } from '../../../components/common/PageHeader';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { useTarsBenchJobs } from '../../../hooks/useRestorationBench';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { RestorationQueue } from './RestorationQueue';
import { QUEUE_LISTS, isReadyForBench, type QueueListId } from './restorationQueueModel';

export default function RestorationQueuePage() {
  const { data: jobs = [], isLoading } = useTarsBenchJobs();
  const { scales } = useGradeScales();
  const [list, setList] = useState<QueueListId>('queue');

  const byList = useMemo(() => {
    const out = {} as Record<QueueListId, RestorationJobDTO[]>;
    for (const entry of QUEUE_LISTS) {
      out[entry.id] = jobs.filter((j) => (entry.stages as readonly string[]).includes(j.stage));
    }
    return out;
  }, [jobs]);

  const active = QUEUE_LISTS.find((l) => l.id === list) ?? QUEUE_LISTS[0];
  const shown = byList[list] ?? [];

  const blocked = useMemo(
    () => (byList.queue ?? []).filter((j) => !isReadyForBench(j, scales[j.scale] ?? [])).length,
    [byList, scales],
  );

  return (
    <Box sx={{ px: { xs: 1.5, md: 2.5 }, py: { xs: 1.5, md: 2 } }}>
      <PageHeader
        title="Restoration"
        subtitle={
          blocked > 0
            ? `${(byList.queue ?? []).length} waiting · ${blocked} cannot start until their prices are filled in`
            : `${(byList.queue ?? []).length} waiting · all priced and ready`
        }
      />

      <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }}>
        {QUEUE_LISTS.map((entry) => {
          const selected = entry.id === list;
          const count = (byList[entry.id] ?? []).length;
          return (
            <Box
              key={entry.id}
              component="button"
              type="button"
              onClick={() => setList(entry.id)}
              aria-pressed={selected}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.35,
                py: 0.6,
                cursor: 'pointer',
                borderRadius: '8px',
                // The colour matches the left edge of the rows below, so the
                // tab and the list read as the same thing.
                border: `1px solid ${selected ? entry.accent : '#e2e8f0'}`,
                borderLeft: `4px solid ${entry.accent}`,
                bgcolor: selected ? `${entry.accent}12` : '#ffffff',
                color: selected ? entry.accent : '#64748b',
                '&:hover': { borderColor: entry.accent },
              }}
            >
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }}>{entry.label}</Typography>
              <Typography sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 900, opacity: 0.75 }}>
                {count}
              </Typography>
            </Box>
          );
        })}
      </Stack>

      {isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress size={30} />
        </Box>
      ) : (
        <RestorationQueue
          jobs={shown}
          accent={active.accent}
          emptyMessage={
            list === 'queue'
              ? 'Nothing is waiting for restoration.'
              : list === 'bench'
                ? 'Nothing is on a bench right now.'
                : 'Nothing is on hold.'
          }
        />
      )}
    </Box>
  );
}
