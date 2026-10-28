/**
 * A list of restoration items, mounted wherever someone might need to fix one.
 *
 * Ashley works it from `/restoration/overview` at her own desk; the same
 * component sits on the legacy studio Home so the two can never drift.
 *
 * Edits save as they are made. There is no Save button because there is nothing
 * to save at - leaving a field commits it. Success is silent: the value on the
 * row is the confirmation, and a toast per field would be unreadable when
 * twenty items are being filled in. Only failures speak up.
 */
import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import ArrowDropUp from '@mui/icons-material/ArrowDropUp';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSnackbar } from 'notistack';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { useFixRestorationFinish, usePatchRestorationQueueDetails } from '../../../hooks/useRestorationBench';
import { useCombineRestorationJobs, useSplitRestorationJob } from '../../../hooks/useRestorationJobs';
import type { RestorationBenchDisposition, RestorationJobDTO } from '../../../types/inventory.types';
import { studio } from '../tars/studio/tarsStudioTheme';
import { DispatchExplainerDialog } from './DispatchExplainerDialog';
import { RestorationQueueCard, QUEUE_CARD_COLUMNS, QueueSection, type QueueEdit } from './RestorationQueueCard';
import { dispatchOptions, type DispatchExplainer, type DispatchOption, type DispatchTarget } from './queueDispatch';
import { SplitStackDialog } from './SplitStackDialog';
import { StackPanel } from './StackPanel';
import {
  clusterQueue,
  combinable,
  familyElsewhere,
  isStack,
  unitCount,
  type QueueEntry,
  type SplitPlan,
} from './stackModel';
import type { TarsHistoryFilter } from '../tars/tarsBenchHistory';
import {
  DEFAULT_QUEUE_SORT,
  defaultDirForQueueField,
  nextQueueSort,
  queueRowKey,
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
  allJobs,
  focus,
  stackable = false,
}: {
  jobs: RestorationJobDTO[];
  accent: string;
  occupyingBenchJob?: RestorationJobDTO | null;
  busy?: boolean;
  onOpenHistory?: (job: RestorationJobDTO, filter?: TarsHistoryFilter) => void;
  onOpenWork?: (job: RestorationJobDTO) => void;
  onDispatch: (job: RestorationJobDTO, target: DispatchTarget) => void;
  /** Column name over the buttons. Always Dispatch - the buttons say the rest. */
  actionLabel?: string;
  emptyMessage?: string;
  /** Every loaded job, so a group can say where the rest of its stack is. */
  allJobs?: RestorationJobDTO[];
  /** A scanned unit: open its stack with that unit lit. */
  focus?: { jobId: number; sku: string; seq: number } | null;
  /** Queue only: stacks can be split, pulled from and stacked back. */
  stackable?: boolean;
}) {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const { scales } = useGradeScales();
  const patchDetails = usePatchRestorationQueueDetails();
  const fixFinish = useFixRestorationFinish();
  const splitJob = useSplitRestorationJob();
  const combineJobs = useCombineRestorationJobs();
  const [sort, setSort] = useState<QueueSort>(DEFAULT_QUEUE_SORT);
  const [explainer, setExplainer] = useState<DispatchExplainer | null>(null);
  const [openStack, setOpenStack] = useState<{ jobId: number; sku: string | null } | null>(null);
  const [splitFor, setSplitFor] = useState<{ job: RestorationJobDTO; picked: number[] } | null>(null);
  const [confirmCombine, setConfirmCombine] = useState<number[] | null>(null);

  const ordered = useMemo(() => sortQueue(jobs, scales, sort), [jobs, scales, sort]);
  const entries = useMemo(() => clusterQueue(ordered, stackable), [ordered, stackable]);
  const shownIds = useMemo(() => new Set(jobs.map((j) => j.id)), [jobs]);
  const rowBusy = Boolean(busy || fixFinish.isPending || splitJob.isPending || combineJobs.isPending);

  useEffect(() => {
    if (focus) setOpenStack({ jobId: focus.jobId, sku: focus.sku });
  }, [focus]);

  function failStack(err: unknown, fallback: string) {
    const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    enqueueSnackbar(detail || (err instanceof Error ? err.message : fallback), { variant: 'error' });
  }

  function stackBack(ids: number[], replaceValues = false) {
    combineJobs.mutate(
      { job_ids: ids, replace_values: replaceValues },
      {
        onSuccess: (job) => {
          setConfirmCombine(null);
          enqueueSnackbar(`Stacked: ×${unitCount(job)}`, { variant: 'success' });
        },
        onError: (err) => {
          const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '';
          if (!replaceValues && detail.includes('Confirm')) {
            setConfirmCombine(ids);
            return;
          }
          failStack(err, 'Could not stack them');
        },
      },
    );
  }

  /** Split, then offer Undo: the groups stack straight back onto the source. */
  function runSplit(job: RestorationJobDTO, groups: number[][], after?: (created: RestorationJobDTO[]) => void) {
    splitJob.mutate(
      { id: job.id, payload: { groups: groups.map((item_ids) => ({ item_ids })) } },
      {
        onSuccess: (result) => {
          setSplitFor(null);
          const ids = [result.source_job?.id, ...result.created_jobs.map((j) => j.id)].filter(
            (id): id is number => id != null,
          );
          if (!result.source_job || !isStack(result.source_job)) setOpenStack(null);
          if (after) {
            after(result.created_jobs);
            return;
          }
          const key = enqueueSnackbar(`Split into ${ids.length} groups`, {
            variant: 'success',
            action: (
              <Button
                size="small"
                sx={{ color: '#fff', fontWeight: 900 }}
                onClick={() => {
                  closeSnackbar(key);
                  stackBack(ids);
                }}
              >
                Undo
              </Button>
            ),
          });
        },
        onError: (err) => failStack(err, 'Could not split the stack'),
      },
    );
  }

  /** One unit to the bench: the same checks as the bench button, then split it off and go. */
  function justThisOne(job: RestorationJobDTO, itemId: number) {
    const unit = job.items.find((u) => u.id === itemId);
    if (!unit) return;
    const single = { ...job, quantity: 1, items: [unit] };
    const bench = dispatchOptions(single, {
      scaleGrades: scales[job.scale] ?? [],
      occupyingBenchJob: occupyingBenchJob ?? null,
    }).find((o) => o.target === 'bench');
    if (bench?.tone === 'blocked') {
      setExplainer(bench.explainer ?? null);
      return;
    }
    runSplit(job, [[itemId]], (created) => {
      if (created[0]) onDispatch(created[0], 'bench');
    });
  }

  function renderCard(job: RestorationJobDTO) {
    const open = openStack?.jobId === job.id && isStack(job);
    return (
      <Box key={queueRowKey(job)}>
        <RestorationQueueCard
          job={job}
          scales={scales}
          accent={accent}
          busy={rowBusy}
          occupyingBenchJob={occupyingBenchJob}
          onOpenHistory={onOpenHistory}
          onOpenWork={onOpenWork}
          onEdit={applyEdit}
          onDispatch={handleDispatch}
          stackOpen={open}
          onToggleStack={() => setOpenStack(open ? null : { jobId: job.id, sku: null })}
        />
        {open ? (
          <StackPanel
            job={job}
            accent={accent}
            highlightSku={openStack?.sku}
            busy={rowBusy}
            canBench={stackable}
            onClose={() => setOpenStack(null)}
            onSplit={(picked) => {
              if (!stackable) {
                setExplainer(splitOnlyInQueue);
                return;
              }
              setSplitFor({ job, picked });
            }}
            onPullOut={(ids) => {
              if (!stackable) {
                setExplainer(splitOnlyInQueue);
                return;
              }
              runSplit(job, [ids]);
            }}
            onJustThisOne={(id) => justThisOne(job, id)}
          />
        ) : null}
      </Box>
    );
  }

  function renderEntry(entry: QueueEntry) {
    if (entry.kind === 'job') return renderCard(entry.job);
    const family = entry.family ? entry.jobs[0].stack_family ?? null : null;
    const elsewhere = family != null && allJobs ? familyElsewhere(family, allJobs, shownIds) : [];
    const together = combinable(entry.jobs);
    // The job the stack started as keeps the decisions when they are joined back.
    const root = together.find((j) => j.id === family);
    const ids = root ? [root.id, ...together.filter((j) => j !== root).map((j) => j.id)] : together.map((j) => j.id);
    return (
      <StackCluster
        key={entry.key}
        accent={accent}
        units={entry.jobs.reduce((sum, j) => sum + unitCount(j), 0)}
        groups={entry.jobs.length}
        family={entry.family}
        elsewhere={elsewhere.length}
        busy={rowBusy}
        canJoin={ids.length >= 2}
        onJoin={() => stackBack(ids)}
      >
        {entry.jobs.map(renderCard)}
      </StackCluster>
    );
  }

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
          entries.map(renderEntry)
        )}
      </Stack>
      <DispatchExplainerDialog
        open={explainer != null}
        explainer={explainer}
        onClose={() => setExplainer(null)}
      />
      <SplitStackDialog
        job={splitFor?.job ?? null}
        picked={splitFor?.picked ?? NO_PICKS}
        accent={accent}
        busy={splitJob.isPending}
        onClose={() => setSplitFor(null)}
        onSplit={(plan: SplitPlan) => splitFor && runSplit(splitFor.job, plan.groups)}
      />
      <Dialog open={confirmCombine != null} onClose={() => setConfirmCombine(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 950 }}>Different prices</DialogTitle>
        <DialogContent>
          <Typography>
            These have different retail or price. Stacking them gives every unit the first card's retail, price and
            grade prices.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCombine(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={combineJobs.isPending}
            onClick={() => confirmCombine && stackBack(confirmCombine, true)}
          >
            Stack them
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

const NO_PICKS: number[] = [];

const splitOnlyInQueue: DispatchExplainer = {
  title: "Can't split it here",
  whyNot: 'Stacks are split in the Queue, before any work starts.',
  steps: ['Send it back to the Queue.', 'Then open the stack and split it.'],
};

/**
 * Cards that belong together: groups split from one stack, or the same item
 * from the same order. A bracket and one line say so; one button joins them.
 * The line is a fixed height so joining or splitting never moves the cards.
 */
function StackCluster({
  accent,
  units,
  groups,
  family,
  elsewhere,
  busy,
  canJoin,
  onJoin,
  children,
}: {
  accent: string;
  units: number;
  groups: number;
  family: boolean;
  elsewhere: number;
  busy: boolean;
  canJoin: boolean;
  onJoin: () => void;
  children: ReactNode;
}) {
  const said = family
    ? `From one stack · ${units} units in ${groups} groups${elsewhere > 0 ? ` · ${elsewhere} more on other tabs` : ''}`
    : `Same item, same order · ${units} units on ${groups} cards`;
  return (
    <Box
      data-stack-cluster
      sx={{ pl: 1.25, borderLeft: `3px dashed ${accent}`, display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minHeight: 30 }}>
        <Typography noWrap sx={{ fontSize: '0.74rem', fontWeight: 800, color: studio.inkMuted, flex: 1, minWidth: 0 }}>
          {said}
        </Typography>
        <Button
          size="small"
          variant="outlined"
          disabled={busy || !canJoin}
          onClick={onJoin}
          sx={{ fontWeight: 800, flexShrink: 0 }}
        >
          {family ? 'Stack back together' : 'Stack these'}
        </Button>
      </Stack>
      {children}
    </Box>
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
 * Always rendered - empty lists keep the headers - so arriving items never
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
          {col.id === 'stake' ? (
            <Stack direction="row" spacing={0.25} sx={{ width: '100%', justifyContent: 'center' }}>
              <QueueSortHeader field="stake" label="Stake" sort={sort} onSort={onSort} center />
              <QueueSortHeader field="priority" label="$/min" sort={sort} onSort={onSort} center />
            </Stack>
          ) : (
            <QueueSortHeader field={col.id} label={col.label} sort={sort} onSort={onSort} center={col.center} />
          )}
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
