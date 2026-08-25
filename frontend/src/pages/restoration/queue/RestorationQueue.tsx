/**
 * A list of restoration items, mounted wherever someone might need to fix one.
 *
 * Ashley works it from `/restoration/overview` at her own desk; the same
 * component sits on the legacy studio Home so the two can never drift.
 *
 * Edits save as they are made. There is no Save button because there is nothing
 * to save at — leaving a field commits it. Success is silent: the value on the
 * row is the confirmation, and a toast per field would be unreadable when
 * twenty items are being filled in. Only failures speak up.
 */
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import ArrowDropUp from '@mui/icons-material/ArrowDropUp';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { useFixRestorationFinish, usePatchRestorationQueueDetails } from '../../../hooks/useRestorationBench';
import type { RestorationBenchDisposition, RestorationJobDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { DispatchExplainerDialog } from './DispatchExplainerDialog';
import { RestorationQueueCard, QUEUE_CARD_COLUMNS, QueueSection, type QueueEdit } from './RestorationQueueCard';
import type { DispatchExplainer, DispatchOption, DispatchTarget } from './queueDispatch';
import type { TarsHistoryFilter } from '../tars/tarsBenchHistory';
import {
  DEFAULT_QUEUE_SORT,
  defaultDirForQueueField,
  nextQueueSort,
  sortQueue,
  type QueueSort,
  type QueueSortField,
} from './restorationQueueModel';

export function RestorationQueue({
  jobs,
  accent,
  occupyingBenchJob,
  busy,
  onOpenHistory,
  onOpenWork,
  onDispatch,
  actionLabel = 'Dispatch',
  emptyMessage = 'Nothing here.',
}: {
  jobs: RestorationJobDTO[];
  accent: string;
  occupyingBenchJob?: RestorationJobDTO | null;
  busy?: boolean;
  onOpenHistory?: (job: RestorationJobDTO, filter?: TarsHistoryFilter) => void;
  onOpenWork?: (job: RestorationJobDTO) => void;
  onDispatch: (job: RestorationJobDTO, target: DispatchTarget) => void;
  /** Column name over the buttons. Always Dispatch — the buttons say the rest. */
  actionLabel?: string;
  emptyMessage?: string;
}) {
  const { enqueueSnackbar } = useSnackbar();
  const { scales } = useGradeScales();
  const patchDetails = usePatchRestorationQueueDetails();
  const fixFinish = useFixRestorationFinish();
  const [sort, setSort] = useState<QueueSort>(DEFAULT_QUEUE_SORT);
  const [explainer, setExplainer] = useState<DispatchExplainer | null>(null);

  const ordered = useMemo(() => sortQueue(jobs, scales, sort), [jobs, scales, sort]);
  const rowBusy = Boolean(busy || fixFinish.isPending);

  function fail(err: unknown) {
    enqueueSnackbar(err instanceof Error ? err.message : 'Could not save that change', {
      variant: 'error',
    });
  }

  function applyEdit(jobId: number, patch: QueueEdit) {
    if (patch.bench_disposition != null) {
      const job = jobs.find((row) => row.id === jobId);
      if (!job) return;
      fixFinish.mutate(
        {
          id: jobId,
          payload: {
            destination: patch.bench_disposition as RestorationBenchDisposition,
            final_grade: job.final_grade,
            starting_grade: job.starting_grade,
            notes: job.disposition_notes ?? '',
          },
        },
        { onError: fail },
      );
      return;
    }
    patchDetails.mutate(
      { id: jobId, payload: patch },
      { onError: fail },
    );
  }

  function handleDispatch(job: RestorationJobDTO, option: DispatchOption) {
    if (option.tone === 'blocked') {
      setExplainer(option.explainer ?? null);
      return;
    }
    onDispatch(job, option.target);
  }

  return (
    <>
      <Stack spacing={ordered.length === 0 ? 0 : 1} sx={{ width: '100%' }}>
        <QueueColumnHeaders sort={sort} onSort={setSort} actionLabel={actionLabel} />
        {ordered.length === 0 ? (
          <Box
            sx={{
              py: 2.5,
              textAlign: 'center',
              borderRadius: `${studio.radius.lg}px`,
              border: `1px dashed ${studio.panelBorder}`,
              bgcolor: studio.panel,
              color: studio.inkMuted,
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{emptyMessage}</Typography>
          </Box>
        ) : (
          ordered.map((job) => (
            <RestorationQueueCard
              key={job.id}
              job={job}
              scales={scales}
              accent={accent}
              busy={rowBusy}
              occupyingBenchJob={occupyingBenchJob}
              onOpenHistory={onOpenHistory}
              onOpenWork={onOpenWork}
              onEdit={applyEdit}
              onDispatch={handleDispatch}
            />
          ))
        )}
      </Stack>
      <DispatchExplainerDialog
        open={explainer != null}
        explainer={explainer}
        onClose={() => setExplainer(null)}
      />
    </>
  );
}

const QUEUE_COLUMNS: ReadonlyArray<{ id: QueueSortField; label: string; center?: boolean }> = [
  { id: 'item', label: 'Item' },
  { id: 'note', label: 'Note' },
  { id: 'destination', label: 'Destination' },
  { id: 'scale', label: 'Scale' },
  { id: 'prices', label: 'Prices' },
  { id: 'stake', label: 'At stake', center: true },
  { id: 'waiting', label: 'Waiting', center: true },
];

/**
 * The names of the card's sections, on the same tracks as the cards.
 *
 * Always rendered — empty lists keep the headers — so arriving items never
 * shove a new row in above the first card. Sticky so the names stay put
 * while the list scrolls; they start at the top of the scroller on load.
 * Clicking a name sorts the list; the arrow slot is always reserved so the
 * label never jumps.
 */
function QueueColumnHeaders({
  sort,
  onSort,
  actionLabel,
}: {
  sort: QueueSort;
  onSort: (next: QueueSort) => void;
  actionLabel: string;
}) {
  return (
    <Box
      sx={{
        display: { xs: 'none', lg: 'grid' },
        position: 'sticky',
        top: 0,
        zIndex: 2,
        flexShrink: 0,
        gridTemplateColumns: QUEUE_CARD_COLUMNS,
        width: '100%',
        px: 1.25,
        pt: 0.5,
        pb: 0.65,
        bgcolor: studio.canvas,
      }}
    >
      {QUEUE_COLUMNS.map((col, i) => (
        <QueueSection key={col.id} first={i === 0}>
          <QueueSortHeader field={col.id} label={col.label} sort={sort} onSort={onSort} center={col.center} />
        </QueueSection>
      ))}
      <QueueSection>
        <Typography
          sx={{
            minHeight: 18,
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
            color: studio.inkMuted,
          }}
        >
          {actionLabel}
        </Typography>
      </QueueSection>
    </Box>
  );
}

function QueueSortHeader({
  field,
  label,
  sort,
  onSort,
  center,
}: {
  field: QueueSortField;
  label: string;
  sort: QueueSort;
  onSort: (next: QueueSort) => void;
  center?: boolean;
}) {
  const active = sort.field === field;
  const dir = active ? sort.dir : defaultDirForQueueField(field);
  const Arrow = dir === 'asc' ? ArrowDropUp : ArrowDropDown;

  return (
    <Box
      component="button"
      type="button"
      role="columnheader"
      aria-label={`Sort by ${label}`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onSort(nextQueueSort(sort, field))}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: center ? 'center' : 'flex-start',
        gap: 0.15,
        width: '100%',
        minWidth: 0,
        m: 0,
        p: 0,
        border: 'none',
        bgcolor: 'transparent',
        cursor: 'pointer',
        color: active ? studio.ink : studio.inkMuted,
        '&:hover': { color: studio.ink },
        '&:hover .queue-sort-arrow': { opacity: 1 },
      }}
    >
      <Typography
        component="span"
        noWrap
        sx={{
          fontSize: '0.62rem',
          fontWeight: 800,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          color: 'inherit',
        }}
      >
        {label}
      </Typography>
      <Box
        className="queue-sort-arrow"
        aria-hidden
        sx={{
          width: 14,
          height: 14,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: active ? 1 : 0,
          color: active ? studio.accentDark : 'inherit',
        }}
      >
        <Arrow sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
}
