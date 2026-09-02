/**
 * What was done to the selected Overview row.
 *
 * A right drawer - off the flow, so the list never jumps. Slim enough that
 * the queue still reads. Composer lives here; there is no second notes drawer.
 */
import Close from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useRestorationActions, useRestorationJobTimeline } from '../../../hooks/useRestorationBench';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { HistoryFilterRows } from '../tars/tarsHistoryFilters';
import {
  filterBenchHistory,
  mergeBenchHistory,
  type TarsHistoryFilter,
} from '../tars/tarsBenchHistory';
import { JobNotesSlot } from '../../../components/notes/JobNotesSlot';
import { studio } from '../tars/studio/tarsStudioTheme';
import { JobHistoryList } from './JobHistoryList';

export const HISTORY_DRAWER_WIDTH = 560;

export function OverviewJobHistory({
  job,
  onClose,
  initialFilter = 'all',
}: {
  job: RestorationJobDTO | null;
  onClose: () => void;
  initialFilter?: TarsHistoryFilter;
}) {
  const { user } = useAuth();
  const open = job != null;
  const jobId = job?.id ?? null;
  const [filter, setFilter] = useState<TarsHistoryFilter>(initialFilter);
  const actions = useRestorationActions(jobId);
  const timeline = useRestorationJobTimeline(jobId);
  const merged = useMemo(
    () =>
      mergeBenchHistory(
        actions.data?.results ?? [],
        timeline.data ?? [],
        actions.data?.current_action_id ?? job?.current_action ?? null,
      ),
    [actions.data, timeline.data, job?.current_action],
  );
  const rows = useMemo(() => filterBenchHistory(merged, filter), [merged, filter]);
  const sku = job?.items[0]?.sku ?? job?.sku ?? '';

  useEffect(() => {
    setFilter(initialFilter);
  }, [jobId, initialFilter]);

  return (
    <Drawer
      variant="persistent"
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          'aria-hidden': open ? undefined : true,
          sx: {
            width: { xs: '100vw', md: HISTORY_DRAWER_WIDTH },
            maxWidth: '100vw',
            bgcolor: studio.panel,
            display: 'flex',
            flexDirection: 'column',
            visibility: open ? 'visible' : 'hidden',
            pointerEvents: open ? 'auto' : 'none',
          },
        },
      }}
    >
      <Box
        data-overview-history=""
        sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
      >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          flexShrink: 0,
          px: 1.5,
          py: 1.15,
          minHeight: 56,
          borderBottom: `1px solid ${studio.rule}`,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 900, fontSize: '0.82rem', color: studio.ink }}>
            What was done
          </Typography>
          <Typography
            noWrap
            sx={{ fontSize: '0.68rem', fontWeight: 700, color: studio.inkMuted, minHeight: 16 }}
          >
            {job ? [sku, job.name].filter(Boolean).join(' · ') : '\u00a0'}
          </Typography>
        </Box>
        <IconButton
          size="small"
          aria-label="Close history"
          onClick={onClose}
          sx={{ color: studio.inkMuted }}
        >
          <Close fontSize="small" />
        </IconButton>
      </Stack>

      <Box sx={{ px: 1.25, pt: 1, flexShrink: 0 }}>
        <JobNotesSlot jobId={jobId} itemId={job?.items[0]?.id ?? null} compose />
      </Box>

      <Box sx={{ px: 1.25, pt: 1, flexShrink: 0 }}>
        <HistoryFilterRows filter={filter} onFilter={setFilter} />
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.25 }}>
        {job == null ? (
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: studio.inkMuted, px: 0.5, py: 1 }}>
            Select an item to see what was done.
          </Typography>
        ) : (
          <JobHistoryList
            rows={rows}
            empty={merged.length === 0 ? 'Nothing recorded yet.' : 'Nothing in this history yet.'}
            jobId={jobId}
            actions={actions.data?.results ?? []}
            merged={merged}
            currentUserId={user?.id ?? null}
            closed={job.stage === 'done' || job.stage === 'returned'}
          />
        )}
      </Box>
      </Box>
    </Drawer>
  );
}
