/**
 * Restoration from a Processing desk.
 *
 * Four lists of the same kind of row: waiting, being worked, parked, and done.
 * Queue, Bench and Holding stay editable. Done is finished work waiting for
 * Processing; the note and destination can still be corrected. Prices and scale
 * stay locked. Done is finished work waiting for
 * Processing to receive the item; destination can still be corrected.
 *
 * Header, tabs, and list are three distinct bands. The tabs sit on the list
 * panel the way tabs sit on a folder — selected one joins the surface below —
 * so you never have to guess which list you are looking at.
 */
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSnackbar } from 'notistack';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RestorationReopenDialog } from './RestorationReopenDialog';
import { RequestsDrawerHost } from '../../../components/enhancements/RequestsDrawer';
import { PageHeader } from '../../../components/common/PageHeader';
import { useAuth } from '../../../hooks/useAuth';
import { useGradeScales } from '../../../hooks/useGradeScales';
import { useCreateRestorationJobFromSku } from '../../../hooks/useRestorationJobs';
import {
  useCompleteRestorationJob,
  useCreateRestorationOutputItem,
  useFixRestorationFinish,
  useHoldRestorationJob,
  useMoveRestorationJobBackToQueue,
  useProcessingCheckInRestorationJob,
  useRemapRestorationItemProduct,
  useReopenRestorationJob,
  useRestorationScoreboard,
  useTarsBenchJobs,
} from '../../../hooks/useRestorationBench';
import type {
  RestorationJobDTO,
  RestorationScanItemDTO,
} from '../../../types/inventory.types';
import { restorationBenchPath } from '../restorationRoutes';
import { resolveRestorationScan, shouldPickupOnScan } from '../restorationScanFind';
import { isHeldScanFocus, RestorationScanField, shouldKeepHistoryDrawer } from './RestorationScanField';
import { TarsScanMessageDialog } from '../tars/TarsScanMessageDialog';
import { TarsScoreboard } from '../tars/TarsScoreboard';
import { TarsSendBackDialog } from '../tars/TarsSendBackDialog';
import { TarsHoldDialog, type TarsHoldSubmit } from '../tars/TarsHoldDialog';
import { TarsDoneDialog } from '../tars/TarsDoneDialog';
import { myActiveBenchRestorationJob } from '../tars/tarsJobAdapter';
import { studio } from '../tars/studio/tarsStudioTheme';
import { RestorationQueue } from './RestorationQueue';
import { OverviewJobHistory } from './OverviewJobHistory';
import { RestorationAddToQueueDialog } from './RestorationAddToQueueDialog';
import {
  printRestorationReceiveLabels,
  RestorationReceiveDialog,
} from './RestorationReceiveDialog';
import { runRestorationReceive } from './restorationReceive';
import { dispatchJobSku, type DispatchTarget } from './queueDispatch';
import type { TarsHistoryFilter } from '../tars/tarsBenchHistory';
import { QUEUE_LISTS, isReadyForBench, queueListForStage, type QueueListId } from './restorationQueueModel';

type DispatchDialog = 'queue' | 'holding' | 'done' | 'receive' | 'fix' | 'reopen';

export default function RestorationQueuePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { data: jobs = [], isLoading } = useTarsBenchJobs();
  const scoreboard = useRestorationScoreboard();
  const { scales } = useGradeScales();
  const moveBack = useMoveRestorationJobBackToQueue();
  const holdJob = useHoldRestorationJob();
  const completeJob = useCompleteRestorationJob();
  const reopenJob = useReopenRestorationJob();
  const fixFinish = useFixRestorationFinish();
  const processingCheckIn = useProcessingCheckInRestorationJob();
  const mintPart = useCreateRestorationOutputItem();
  const remapProduct = useRemapRestorationItemProduct();
  const createFromSku = useCreateRestorationJobFromSku();
  const [list, setList] = useState<QueueListId>('queue');
  const [scan, setScan] = useState('');
  const [scanMessage, setScanMessage] = useState<{ title: string; message: string } | null>(null);
  const [dialog, setDialog] = useState<DispatchDialog | null>(null);
  const [dialogJob, setDialogJob] = useState<RestorationJobDTO | null>(null);
  const [historyJobId, setHistoryJobId] = useState<number | null>(null);
  const [historyFilter, setHistoryFilter] = useState<TarsHistoryFilter>('all');
  const [addItem, setAddItem] = useState<RestorationScanItemDTO | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const jobParam = searchParams.get('job');
  const addParam = searchParams.get('add');

  const clearSelection = useCallback(() => {
    setHistoryJobId(null);
    setHistoryFilter('all');
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('job');
        next.delete('add');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  useEffect(() => {
    function reclaim() {
      if (dialog != null || scanMessage != null || addItem != null) return;
      const active = document.activeElement;
      if (active === scanInputRef.current) return;
      if (isHeldScanFocus(active)) return;
      scanInputRef.current?.focus({ preventScroll: true });
    }

    reclaim();
    const onPointerUp = (event: PointerEvent) => {
      if (dialog == null && scanMessage == null && addItem == null) {
        if (!shouldKeepHistoryDrawer(event.target)) clearSelection();
      }
      requestAnimationFrame(reclaim);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isHeldScanFocus(event.target)) return;
      requestAnimationFrame(reclaim);
    };
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [dialog, scanMessage, addItem, clearSelection]);

  const byList = useMemo(() => {
    const out = {} as Record<QueueListId, RestorationJobDTO[]>;
    for (const entry of QUEUE_LISTS) {
      out[entry.id] = jobs.filter((j) => (entry.stages as readonly string[]).includes(j.stage));
    }
    return out;
  }, [jobs]);

  const occupyingBenchJob = useMemo(
    () => myActiveBenchRestorationJob(byList.bench ?? [], user?.id),
    [byList.bench, user?.id],
  );

  const active = QUEUE_LISTS.find((l) => l.id === list) ?? QUEUE_LISTS[0];
  const shown = byList[list] ?? [];
  const dispatchBusy =
    moveBack.isPending ||
    holdJob.isPending ||
    completeJob.isPending ||
    reopenJob.isPending ||
    fixFinish.isPending ||
    processingCheckIn.isPending ||
    mintPart.isPending ||
    remapProduct.isPending;

  const blocked = useMemo(
    () => (byList.queue ?? []).filter((j) => !isReadyForBench(j, scales[j.scale] ?? [])).length,
    [byList, scales],
  );

  const historyJob = useMemo(
    () => (historyJobId == null ? null : jobs.find((job) => job.id === historyJobId) ?? null),
    [jobs, historyJobId],
  );

  function revealJob(job: RestorationJobDTO, filter: TarsHistoryFilter = 'all') {
    setList(queueListForStage(job.stage));
    setHistoryJobId(job.id);
    setHistoryFilter(filter);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('job', String(job.id));
        next.delete('add');
        return next;
      },
      { replace: true },
    );
  }

  useEffect(() => {
    if (!addParam) return;
    let cancelled = false;
    const scanned = addParam;
    void resolveRestorationScan(scanned, []).then((result) => {
      if (cancelled) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('add');
          if (result.kind === 'job') next.set('job', String(result.job.id));
          return next;
        },
        { replace: true },
      );
      if (result.kind === 'job') {
        setList(queueListForStage(result.job.stage));
        setHistoryJobId(result.job.id);
      } else if (result.kind === 'item') setAddItem(result.item);
      else if (result.kind === 'none') {
        setScanMessage({
          title: 'No matching item',
          message: `${scanned.toUpperCase()} is not in restoration and no catalog item was found for that SKU.`,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [addParam, setSearchParams]);

  useEffect(() => {
    if (addParam || !jobParam || isLoading) return;
    const id = Number(jobParam);
    if (!Number.isFinite(id)) return;
    const match = jobs.find((job) => job.id === id);
    if (!match) return;
    setList(queueListForStage(match.stage));
    setHistoryJobId(match.id);
  }, [addParam, jobParam, jobs, isLoading]);

  useEffect(() => {
    if (historyJobId == null) return;
    const el = document.querySelector(`[data-restoration-job="${historyJobId}"]`);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [historyJobId, list]);

  function goToBench(job: RestorationJobDTO) {
    navigate(restorationBenchPath(job.id, job.stage !== 'bench'));
  }

  function openDialog(kind: DispatchDialog, job: RestorationJobDTO) {
    setDialogJob(job);
    setDialog(kind);
  }

  function closeDialog() {
    if (dispatchBusy) return;
    setDialog(null);
    setDialogJob(null);
  }

  function handleDispatch(job: RestorationJobDTO, target: DispatchTarget) {
    if (target === 'bench' && job.stage !== 'done') {
      goToBench(job);
      return;
    }
    if (job.stage === 'done' && target === 'queue') {
      openDialog('reopen', job);
      return;
    }
    if (target === 'queue') openDialog('queue', job);
    else if (target === 'holding') openDialog('holding', job);
    else if (target === 'done') openDialog('done', job);
    else if (target === 'receive') openDialog('receive', job);
    else if (target === 'fix') openDialog('fix', job);
  }

  function fail(err: unknown, fallback: string) {
    enqueueSnackbar(err instanceof Error ? err.message : fallback, { variant: 'error' });
  }

  async function submitScan() {
    const v = scan.trim();
    if (!v) return;
    setScan('');
    const result = await resolveRestorationScan(v, jobs);
    if (result.kind === 'job') {
      if (shouldPickupOnScan(result.job, occupyingBenchJob == null)) {
        goToBench(result.job);
        return;
      }
      revealJob(result.job);
      return;
    }
    if (result.kind === 'item') {
      setAddItem(result.item);
      return;
    }
    setScanMessage({
      title: 'No matching item',
      message: `${v.toUpperCase()} is not in restoration and no catalog item was found for that SKU.`,
    });
  }

  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 2.5 },
        py: { xs: 1.5, md: 2 },
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: studio.canvas,
      }}
    >
      <PageHeader
        compact
        title="Overview"
        subtitle={
          blocked > 0
            ? `${(byList.queue ?? []).length} waiting · ${blocked} cannot start until their prices are filled in`
            : `${(byList.queue ?? []).length} waiting · all priced and ready`
        }
      />

      {/* Strip is always painted — scan stays put while the numbers load. */}
      <Box sx={{ minHeight: 74, maxHeight: 74, overflow: 'hidden', mb: 1.5, flexShrink: 0 }}>
        <TarsScoreboard
          board={scoreboard.data}
          action={
            <RestorationScanField
              fill
              value={scan}
              onChange={setScan}
              onSubmit={submitScan}
              inputRef={scanInputRef}
            />
          }
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          border: `1.5px solid ${studio.panelBorder}`,
          borderRadius: `${studio.radius.xl}px`,
          overflow: 'hidden',
          bgcolor: studio.canvas,
          boxShadow: studio.panelShadow,
        }}
      >
        <Stack
          direction="row"
          spacing={0.25}
          sx={{
            flexShrink: 0,
            px: 1.5,
            pt: 0.85,
            bgcolor: studio.panel,
            borderBottom: `1px solid ${studio.panelBorder}`,
          }}
        >
          {QUEUE_LISTS.map((entry) => {
            const selected = entry.id === list;
            const count = (byList[entry.id] ?? []).length;
            return (
              <Box
                key={entry.id}
                component="button"
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setList(entry.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.6,
                  pt: 0.7,
                  pb: 0.8,
                  mb: '-1px',
                  cursor: 'pointer',
                  fontWeight: 900,
                  borderRadius: '8px 8px 0 0',
                  border: '1px solid',
                  borderColor: selected ? studio.panelBorder : 'transparent',
                  borderBottomColor: selected ? studio.canvas : 'transparent',
                  bgcolor: selected ? studio.canvas : 'transparent',
                  color: selected ? entry.accent : studio.inkMuted,
                  '&:hover': { color: selected ? entry.accent : studio.ink },
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: entry.accent,
                    opacity: selected ? 1 : 0.72,
                    flexShrink: 0,
                  }}
                />
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 900 }}>{entry.label}</Typography>
                <Box
                  component="span"
                  sx={{
                    minWidth: 20,
                    px: 0.55,
                    borderRadius: '999px',
                    fontFamily: 'monospace',
                    fontSize: '0.72rem',
                    fontWeight: 900,
                    lineHeight: '18px',
                    textAlign: 'center',
                    bgcolor: selected ? `${entry.accent}22` : studio.rule,
                    color: selected ? entry.accent : studio.ink,
                  }}
                >
                  {count}
                </Box>
              </Box>
            );
          })}
        </Stack>

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: { xs: 1.25, md: 1.5 } }}>
          {isLoading ? (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
              <CircularProgress size={30} />
            </Box>
          ) : (
            <RestorationQueue
              jobs={shown}
              accent={active.accent}
              occupyingBenchJob={occupyingBenchJob}
              busy={dispatchBusy}
              onOpenHistory={revealJob}
              onOpenWork={goToBench}
              onDispatch={handleDispatch}
              emptyMessage={
                list === 'queue'
                  ? 'Nothing is waiting for restoration.'
                  : list === 'bench'
                    ? 'Nothing is on a bench right now.'
                    : list === 'holding'
                      ? 'Nothing is on hold.'
                      : 'Nothing is waiting for Processing.'
              }
            />
          )}
        </Box>
      </Box>

      <OverviewJobHistory job={historyJob} initialFilter={historyFilter} onClose={clearSelection} />

      <TarsScanMessageDialog
        open={scanMessage != null}
        title={scanMessage?.title ?? ''}
        message={scanMessage?.message ?? ''}
        onClose={() => {
          setScanMessage(null);
          requestAnimationFrame(() => scanInputRef.current?.focus());
        }}
      />

      <RestorationAddToQueueDialog
        item={addItem}
        busy={createFromSku.isPending}
        onCancel={() => setAddItem(null)}
        onConfirm={() => {
          if (!addItem) return;
          createFromSku.mutate(addItem.sku, {
            onSuccess: (created) => {
              setAddItem(null);
              revealJob(created);
            },
            onError: (err) => fail(err, 'Could not add that to the queue'),
          });
        }}
      />

      <TarsSendBackDialog
        open={dialog === 'queue'}
        itemLabel={dialogJob ? dispatchJobSku(dialogJob) : 'this item'}
        from={dialogJob?.stage === 'pending' ? 'holding' : 'bench'}
        jobId={dialogJob?.id ?? null}
        busy={moveBack.isPending}
        onCancel={closeDialog}
        onSubmit={({ note, reason }) => {
          if (!dialogJob) return;
          moveBack.mutate(
            { id: dialogJob.id, note, reason },
            {
              onSuccess: () => {
                enqueueSnackbar('Sent back to the queue', { variant: 'info' });
                setDialog(null);
                setDialogJob(null);
              },
              onError: (err) => fail(err, 'Could not send that back'),
            },
          );
        }}
      />

      <TarsHoldDialog
        open={dialog === 'holding'}
        title="Place on hold"
        itemLabel={dialogJob ? dispatchJobSku(dialogJob) : 'this item'}
        jobId={dialogJob?.id ?? null}
        itemId={dialogJob?.items[0]?.id ?? null}
        requesting={holdJob.isPending}
        onClose={closeDialog}
        onSubmit={(info: TarsHoldSubmit) => {
          if (!dialogJob) return;
          holdJob.mutate(
            {
              id: dialogJob.id,
              payload: {
                wait_for: info.waitFor,
                storage_location: info.storageLocation,
              },
            },
            {
              onSuccess: () => {
                enqueueSnackbar('Item placed on hold', { variant: 'info' });
                setDialog(null);
                setDialogJob(null);
              },
              onError: (err) => fail(err, 'Could not place that on hold'),
            },
          );
        }}
      />

      <TarsDoneDialog
        open={dialog === 'done' || dialog === 'fix'}
        job={dialog === 'done' || dialog === 'fix' ? dialogJob : null}
        evaluation={null}
        cannotUndo={dialog === 'done'}
        mode={dialog === 'fix' ? 'fix' : 'finish'}
        onClose={closeDialog}
        onSubmit={(payload) => {
          if (!dialogJob) return;
          const isFix = dialog === 'fix';
          const mutate = isFix ? fixFinish.mutate : completeJob.mutate;
          mutate(
            { id: dialogJob.id, payload },
            {
              onSuccess: () => {
                enqueueSnackbar(
                  isFix ? 'Finish corrected' : 'Sent to Done — waiting for Processing to check it in',
                  { variant: 'success' },
                );
                setDialog(null);
                setDialogJob(null);
              },
              onError: (err) => fail(err, isFix ? 'Could not correct that finish' : 'Could not finish that item'),
            },
          );
        }}
      />

      <RestorationReceiveDialog
        open={dialog === 'receive'}
        job={dialog === 'receive' ? dialogJob : null}
        busy={processingCheckIn.isPending || mintPart.isPending || remapProduct.isPending}
        onCancel={closeDialog}
        onSubmit={async (submit) => {
          if (!dialogJob) return;
          try {
            await runRestorationReceive({
              jobId: dialogJob.id,
              submit,
              remap: (itemId, payload) => remapProduct.mutateAsync({ itemId, payload }),
              mint: (id, payload) => mintPart.mutateAsync({ id, payload }),
              checkIn: (id, payload) => processingCheckIn.mutateAsync({ id, payload }),
              printLabels: printRestorationReceiveLabels,
            });
            enqueueSnackbar(submit.print ? 'Received and printed' : 'Received', { variant: 'success' });
            setDialog(null);
            setDialogJob(null);
          } catch (err) {
            fail(err, 'Could not receive that item');
          }
        }}
      />

      <RestorationReopenDialog
        open={dialog === 'reopen'}
        itemLabel={dialogJob ? dispatchJobSku(dialogJob) : 'this item'}
        jobId={dialogJob?.id ?? null}
        busy={reopenJob.isPending}
        onCancel={closeDialog}
        onSubmit={(note) => {
          if (!dialogJob) return;
          reopenJob.mutate(
            { id: dialogJob.id, note },
            {
              onSuccess: () => {
                enqueueSnackbar('Back in the queue', { variant: 'info' });
                setDialog(null);
                setDialogJob(null);
              },
              onError: (err) => fail(err, 'Could not send that back'),
            },
          );
        }}
      />
      <RequestsDrawerHost defaultArea="restoration" />
    </Box>
  );
}
