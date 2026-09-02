/**
 * The Notes and Actions tabs of the receive dialog - the same pair the Finish form has,
 * so a job reads the same way on the bench and at the receiving desk.
 *
 * Both panes stay mounted so their queries do not refetch every time the tab changes.
 */
import { Box } from '@mui/material';
import { useMemo, useState } from 'react';
import { ItemNoteComposer } from '../../../components/notes/ItemNoteComposer';
import { ItemNotesTrail } from '../../../components/notes/ItemNotesTrail';
import { useAuth } from '../../../hooks/useAuth';
import { useJobNotes } from '../../../hooks/useItemNotes';
import { useRestorationActions, useRestorationJobTimeline } from '../../../hooks/useRestorationBench';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import {
  filterBenchHistory,
  mergeBenchHistory,
  type TarsHistoryFilter,
} from '../tars/tarsBenchHistory';
import { HistoryFilterRows } from '../tars/tarsHistoryFilters';
import { JobHistoryList } from './JobHistoryList';

export type ReceiveTab = 'receive' | 'notes' | 'actions';

export function ReceiveHistoryPanes({
  job,
  open,
  tab,
}: {
  job: RestorationJobDTO;
  open: boolean;
  tab: ReceiveTab;
}) {
  const { user } = useAuth();
  const [historyFilter, setHistoryFilter] = useState<TarsHistoryFilter>('all');
  const jobId = open ? job.id : null;
  const notes = useJobNotes(jobId);
  const actions = useRestorationActions(jobId);
  const timeline = useRestorationJobTimeline(jobId);

  const merged = useMemo(
    () =>
      mergeBenchHistory(
        actions.data?.results ?? [],
        timeline.data ?? [],
        actions.data?.current_action_id ?? job.current_action ?? null,
      ),
    [actions.data, timeline.data, job.current_action],
  );
  const rows = useMemo(() => filterBenchHistory(merged, historyFilter), [merged, historyFilter]);

  return (
    <>
      <Box
        role="tabpanel"
        hidden={tab !== 'notes'}
        sx={{
          height: '100%',
          minHeight: 0,
          display: tab === 'notes' ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ItemNotesTrail notes={notes.data ?? []} loading={notes.isLoading} fill />
        </Box>
        <Box sx={{ pt: 0.75 }}>
          <ItemNoteComposer itemId={job.items[0]?.id ?? null} jobId={jobId} />
        </Box>
      </Box>

      <Box
        role="tabpanel"
        hidden={tab !== 'actions'}
        sx={{
          height: '100%',
          minHeight: 0,
          display: tab === 'actions' ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ flexShrink: 0, pb: 1 }}>
          <HistoryFilterRows filter={historyFilter} onFilter={setHistoryFilter} />
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <JobHistoryList
            rows={rows}
            empty={merged.length === 0 ? 'Nothing recorded on this job yet.' : 'Nothing in this history yet.'}
            jobId={jobId}
            actions={actions.data?.results ?? []}
            merged={merged}
            currentUserId={user?.id ?? null}
            closed={job.stage === 'done' || job.stage === 'returned'}
          />
        </Box>
      </Box>
    </>
  );
}
