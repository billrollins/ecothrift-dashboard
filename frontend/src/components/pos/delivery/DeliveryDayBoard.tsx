import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import MapOutlined from '@mui/icons-material/MapOutlined';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSnackbar } from 'notistack';
import type { DeliveryAvailability, DeliveryCallResult, DeliveryJob } from '../../../types/pos.types';
import {
  useDeliveryRun,
  useDeliveryRunActions,
  useStartDeliveryRun,
  useUpdateDeliveryJob,
} from '../../../hooks/usePOS';
import {
  compressImageToJpeg,
  drainDeliveryUploadQueue,
  enqueueDeliveryPhoto,
  pendingCountForRun,
} from '../../../services/delivery/deliveryMediaClient';
import { DeliveryDayCard } from './DeliveryDayCard';
import { DeliveryCardPhaseActions } from './DeliveryCardPhaseActions';
import { DeliveryDetailsModal } from './DeliveryDetailsModal';
import {
  boardPrimaryAction,
  buildDeliveryDayCards,
  isStageReached,
  phaseProgress,
  resolveDayBoardStage,
  stageLabel,
  type DeliveryDayCardModel,
} from './dayBoardUtils';

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function SortableCardShell({
  id,
  children,
}: {
  id: number;
  children: (dragHandleProps: Record<string, unknown>) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.92 : 1,
        zIndex: isDragging ? 5 : 'auto',
      }}
    >
      {children({ ...attributes, ...listeners })}
    </Box>
  );
}

type Props = {
  date: string;
  dateLabel: string;
  slotSummary: string;
  availabilityId?: number | null;
  dayJobs: DeliveryJob[];
  daySlots: DeliveryAvailability[];
  canManage?: boolean;
  onEditSlot?: () => void;
  onOpenPlanningMaps?: () => void;
};

export function DeliveryDayBoard({
  date,
  dateLabel,
  slotSummary,
  availabilityId,
  dayJobs,
  daySlots,
  canManage,
  onEditSlot,
  onOpenPlanningMaps,
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { data: run, isLoading, refetch } = useDeliveryRun(date);
  const startRun = useStartDeliveryRun();
  const actions = useDeliveryRunActions();
  const updateJob = useUpdateDeliveryJob();
  const [pendingUploads, setPendingUploads] = useState(0);
  const [tick, setTick] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const proofInputRef = useRef<HTMLInputElement | null>(null);
  const uploadStopRef = useRef<number | null>(null);
  const autoOptimizeAttemptRef = useRef<number | null>(null);

  const stage = resolveDayBoardStage(run);
  const cards = useMemo(() => buildDeliveryDayCards(dayJobs, run), [dayJobs, run]);
  const selectedCard = cards.find((c) => c.key === selectedKey) ?? null;
  const primary = boardPrimaryAction(stage, run);
  const confirmedRoutable = cards.filter((c) => c.is_confirmed && c.group === 'actionable');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!run) return;
    void pendingCountForRun(run.id).then(setPendingUploads);
  }, [run]);

  useEffect(() => {
    if (!run || run.status === 'completed') return;
    const drain = async () => {
      await drainDeliveryUploadQueue(run.id, async (blob, meta) => {
        const form = new FormData();
        form.append('file', blob, `${meta.kind}.jpg`);
        form.append('kind', meta.kind);
        form.append('client_photo_id', meta.clientPhotoId);
        if (meta.stopId) form.append('stop_id', String(meta.stopId));
        await actions.upload.mutateAsync({ runId: run.id, form });
      });
      setPendingUploads(await pendingCountForRun(run.id));
      await refetch();
    };
    void drain();
    const onOnline = () => void drain();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      !run ||
      run.status === 'completed' ||
      stage !== 'route' ||
      confirmedRoutable.length === 0 ||
      run.route_summary?.etas_available ||
      autoOptimizeAttemptRef.current === run.id
    ) {
      return;
    }
    autoOptimizeAttemptRef.current = run.id;
    void actions.optimize.mutateAsync({ id: run.id, optimize: true }).catch(() => undefined);
  }, [run?.id, stage, confirmedRoutable.length, run?.route_summary?.etas_available]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveElapsed = useMemo(() => {
    if (!run?.started_at) return 0;
    if (run.status === 'completed') return run.elapsed_seconds;
    const started = Date.parse(run.started_at);
    if (!Number.isFinite(started)) return run.elapsed_seconds;
    void tick;
    return Math.max(0, Math.floor((Date.now() - started) / 1000));
  }, [run, tick]);

  const queuePhoto = async (file: File, kind: 'truck' | 'delivery_proof' | 'issue', stopId?: number) => {
    if (!run) return;
    const clientPhotoId = crypto.randomUUID();
    const blob = await compressImageToJpeg(file);
    await enqueueDeliveryPhoto({ runId: run.id, stopId, clientPhotoId, kind, blob });
    setPendingUploads(await pendingCountForRun(run.id));
    try {
      const form = new FormData();
      form.append('file', blob, `${kind}.jpg`);
      form.append('kind', kind);
      form.append('client_photo_id', clientPhotoId);
      if (stopId) form.append('stop_id', String(stopId));
      await actions.upload.mutateAsync({ runId: run.id, form });
      setPendingUploads(await pendingCountForRun(run.id));
      enqueueSnackbar('Photo uploaded', { variant: 'success' });
    } catch {
      enqueueSnackbar('Photo queued — will retry when online', { variant: 'warning' });
    }
  };

  const errMsg = (err: unknown, fallback: string) =>
    (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

  const handlePrimary = async () => {
    if (!primary) return;
    try {
      if (primary.action === 'start') {
        await startRun.mutateAsync({ date, availability_id: availabilityId ?? null });
        enqueueSnackbar('Delivery day started', { variant: 'success' });
        return;
      }
      if (!run) return;
      if (primary.action === 'to_route') {
        await actions.setPhase.mutateAsync({ id: run.id, phase: 'route' });
      } else if (primary.action === 'to_load') {
        await actions.setPhase.mutateAsync({ id: run.id, phase: 'load' });
      } else if (primary.action === 'begin_drive') {
        const updated = await actions.beginRoute.mutateAsync(run.id);
        if (updated.maps_url) window.open(updated.maps_url, '_blank', 'noopener,noreferrer');
        enqueueSnackbar('En route', { variant: 'success' });
      } else if (primary.action === 'return_store') {
        const updated = await actions.returnToStore.mutateAsync(run.id);
        if (updated.maps_url) window.open(updated.maps_url, '_blank', 'noopener,noreferrer');
      } else if (primary.action === 'finish') {
        if (pendingUploads > 0) {
          enqueueSnackbar('Wait for pending uploads', { variant: 'warning' });
          return;
        }
        await actions.finish.mutateAsync({ id: run.id });
        enqueueSnackbar('Delivery day finished', { variant: 'success' });
      }
    } catch (err) {
      enqueueSnackbar(errMsg(err, 'Action failed'), { variant: 'error' });
    }
  };

  const reorderConfirmed = async (orderedStopIds: number[]) => {
    if (!run) return;
    try {
      await actions.reorder.mutateAsync({ id: run.id, stop_ids: orderedStopIds });
    } catch (err) {
      enqueueSnackbar(errMsg(err, 'Could not reorder'), { variant: 'error' });
    }
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = confirmedRoutable.map((c) => c.stop!.id);
    const oldIndex = ids.indexOf(Number(active.id));
    const newIndex = ids.indexOf(Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    await reorderConfirmed(arrayMove(ids, oldIndex, newIndex));
  };

  const moveStop = async (stopId: number, direction: -1 | 1) => {
    const ids = confirmedRoutable.map((c) => c.stop!.id);
    const idx = ids.indexOf(stopId);
    const next = idx + direction;
    if (idx < 0 || next < 0 || next >= ids.length) return;
    await reorderConfirmed(arrayMove(ids, idx, next));
  };

  const renderCard = (card: DeliveryDayCardModel, indexLabel: string, dragHandleProps?: Record<string, unknown>) => (
    <DeliveryDayCard
      key={card.key}
      card={card}
      stage={stage}
      indexLabel={indexLabel}
      emphasized={card.is_next_up && stage === 'active'}
      onOpen={() => setSelectedKey(card.key)}
      phaseActions={
        <DeliveryCardPhaseActions
          card={card}
          stage={stage}
          run={run ?? null}
          busy={
            actions.addCall.isPending ||
            actions.markLoaded.isPending ||
            actions.complete.isPending ||
            actions.returnReconcile.isPending
          }
          dragHandleProps={dragHandleProps}
          onSaveCall={async (result: DeliveryCallResult, note: string) => {
            if (!card.stop) return;
            await actions.addCall.mutateAsync({ stopId: card.stop.id, result, note });
            enqueueSnackbar('Call saved', { variant: 'success' });
          }}
          onMoveUp={() => card.stop && void moveStop(card.stop.id, -1)}
          onMoveDown={() => card.stop && void moveStop(card.stop.id, 1)}
          onMarkLoaded={async (loaded) => {
            if (!card.stop) return;
            await actions.markLoaded.mutateAsync({ stopId: card.stop.id, loaded });
          }}
          onMarkSecured={async (secured) => {
            if (!card.stop) return;
            await actions.markSecured.mutateAsync({ stopId: card.stop.id, secured });
          }}
          onScanVerify={async (sku) => {
            if (!card.stop) return;
            try {
              await actions.scanVerify.mutateAsync({ stopId: card.stop.id, sku });
              enqueueSnackbar(`Verified ${sku}`, { variant: 'success' });
            } catch (err) {
              enqueueSnackbar(errMsg(err, 'SKU mismatch'), { variant: 'error' });
            }
          }}
          onContactPresent={async () => {
            if (!card.stop) return;
            await actions.contactPresent.mutateAsync({ stopId: card.stop.id });
          }}
          onMarkDelivered={async () => {
            if (!card.stop) return;
            await actions.markDelivered.mutateAsync({ stopId: card.stop.id });
          }}
          onProofPhoto={() => {
            if (!card.stop) return;
            uploadStopRef.current = card.stop.id;
            proofInputRef.current?.click();
          }}
          onSaveSignature={async (blob) => {
            if (!run || !card.stop) return;
            const clientPhotoId = crypto.randomUUID();
            await enqueueDeliveryPhoto({
              runId: run.id,
              stopId: card.stop.id,
              clientPhotoId,
              kind: 'signature',
              blob,
            });
            const form = new FormData();
            form.append('file', blob, 'signature.jpg');
            form.append('kind', 'signature');
            form.append('client_photo_id', clientPhotoId);
            form.append('stop_id', String(card.stop.id));
            await actions.upload.mutateAsync({ runId: run.id, form });
            enqueueSnackbar('Signature saved', { variant: 'success' });
          }}
          onComplete={async () => {
            if (!card.stop) return;
            await actions.complete.mutateAsync({ stopId: card.stop.id });
            enqueueSnackbar('Stop completed', { variant: 'success' });
          }}
          onCompleteOverride={async (reason) => {
            if (!card.stop) return;
            await actions.complete.mutateAsync({
              stopId: card.stop.id,
              override: true,
              override_reason: reason,
            });
          }}
          onHold={async (reason) => {
            if (!card.stop) return;
            await actions.hold.mutateAsync({ stopId: card.stop.id, reason });
          }}
          onRelease={async () => {
            if (!card.stop) return;
            await actions.release.mutateAsync(card.stop.id);
          }}
          onReportIssue={async (code, note) => {
            if (!card.stop) return;
            await actions.reportIssue.mutateAsync({
              stopId: card.stop.id,
              issue_code: code,
              note,
            });
            enqueueSnackbar('Issue reported', { variant: 'warning' });
          }}
          onReconcile={async (body) => {
            if (!card.stop) return;
            await actions.returnReconcile.mutateAsync({ stopId: card.stop.id, ...body });
            enqueueSnackbar('Reconciled', { variant: 'success' });
          }}
        />
      }
    />
  );

  if (isLoading) {
    return (
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography>Loading day…</Typography>
      </Paper>
    );
  }

  const listBody = (
    <Stack spacing={1.25}>
      {cards.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography color="text.secondary">No deliveries on this day yet.</Typography>
        </Box>
      ) : stage === 'route' ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext
            items={confirmedRoutable.map((c) => c.stop!.id)}
            strategy={verticalListSortingStrategy}
          >
            {cards.map((card, idx) => {
              const label = `#${idx + 1}`;
              if (card.is_confirmed && card.stop && card.group === 'actionable') {
                return (
                  <SortableCardShell key={card.key} id={card.stop.id}>
                    {(dragHandleProps) => renderCard(card, label, dragHandleProps)}
                  </SortableCardShell>
                );
              }
              return renderCard(card, label);
            })}
          </SortableContext>
        </DndContext>
      ) : (
        cards.map((card, idx) => renderCard(card, `#${idx + 1}`))
      )}
    </Stack>
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        maxHeight: { xs: 'none', md: 'calc(100vh - 220px)' },
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          px: { xs: 2, md: 2.5 },
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box>
          <Typography variant="h6" fontWeight={800}>
            {dateLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {slotSummary}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center">
          {run && (
            <>
              <Chip size="small" label={formatElapsed(liveElapsed)} />
              <Chip
                size="small"
                color={run.status === 'en_route' ? 'success' : 'default'}
                label={stageLabel(stage)}
              />
              <Chip
                size="small"
                label={`${run.progress?.completed ?? 0}/${run.progress?.total ?? cards.length} done`}
              />
            </>
          )}
          {!run && (
            <>
              <Chip size="small" color="info" label={`${dayJobs.filter((j) => j.status === 'scheduled').length} scheduled`} />
              <Chip size="small" variant="outlined" label={`${cards.length} total`} />
            </>
          )}
          {pendingUploads > 0 && (
            <Chip size="small" color="info" label={`${pendingUploads} upload pending`} />
          )}
          {stage === 'initial' && onOpenPlanningMaps && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<MapOutlined />}
              onClick={onOpenPlanningMaps}
              disabled={dayJobs.filter((j) => j.status === 'scheduled').length === 0}
            >
              Google Maps route
            </Button>
          )}
          {run?.maps_url && stage !== 'initial' && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<MapOutlined />}
              href={run.maps_url}
              target="_blank"
              rel="noreferrer"
            >
              Open route
            </Button>
          )}
          {canManage && onEditSlot && (
            <Button size="small" onClick={onEditSlot}>
              Edit slot
            </Button>
          )}
        </Stack>
      </Box>

      {stage !== 'initial' && stage !== 'completed' && (
        <Stack
          direction="row"
          spacing={0.75}
          sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', overflowX: 'auto' }}
        >
          {phaseProgress(stage).map((p) => (
            <Chip
              key={p.key}
              size="small"
              label={p.label}
              color={stage === p.key ? 'primary' : 'default'}
              variant={isStageReached(stage, p.key) ? 'filled' : 'outlined'}
            />
          ))}
        </Stack>
      )}

      {stage === 'load' && run && (
        <Box sx={{ px: 1.5, pt: 1.5 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void queuePhoto(f, 'truck');
            }}
          />
          <Paper variant="outlined" sx={{ p: 1.25 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Box>
                <Typography fontWeight={800}>Truck photos</Typography>
                <Typography variant="caption" color="text.secondary">
                  {run.truck_photo_count}/{run.max_truck_photos} · at least one required
                </Typography>
              </Box>
              <Button
                startIcon={<PhotoCamera />}
                variant="contained"
                disabled={(run.truck_photo_count || 0) >= (run.max_truck_photos || 4)}
                onClick={() => fileInputRef.current?.click()}
                sx={{ minHeight: 44 }}
              >
                Add photo
              </Button>
            </Stack>
          </Paper>
        </Box>
      )}

      <input
        ref={proofInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const stopId = uploadStopRef.current;
          if (f && stopId) void queuePhoto(f, 'delivery_proof', stopId);
        }}
      />

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          p: { xs: 1.5, md: 2 },
          pb: 'calc(88px + env(safe-area-inset-bottom))',
        }}
      >
        {stage === 'initial' && (
          <Alert
            severity="info"
            sx={{
              mb: 1.5,
              alignItems: 'flex-start',
              '& .MuiAlert-message': { width: '100%', overflow: 'visible' },
            }}
          >
            Review today&apos;s deliveries, then start the day to call customers, optimize the route,
            load the truck, and deliver — all on this same board.
          </Alert>
        )}
        <Box sx={{ maxWidth: { md: 960, lg: 1100 } }}>{listBody}</Box>
      </Box>

      {primary && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: 1.5,
            pb: 'calc(12px + env(safe-area-inset-bottom))',
            zIndex: 3,
          }}
        >
          <Button
            fullWidth
            variant="contained"
            size="large"
            disabled={primary.disabled || startRun.isPending || actions.beginRoute.isPending || actions.finish.isPending}
            onClick={() => void handlePrimary()}
            sx={{ minHeight: 52 }}
          >
            {primary.label}
          </Button>
          {stage === 'route' && run && (
            <Button
              fullWidth
              sx={{ mt: 1, minHeight: 44 }}
              disabled={actions.optimize.isPending}
              onClick={() =>
                void actions.optimize
                  .mutateAsync({ id: run.id, optimize: true })
                  .then(() => enqueueSnackbar('Route optimized', { variant: 'success' }))
                  .catch((err) => enqueueSnackbar(errMsg(err, 'Optimize failed'), { variant: 'error' }))
              }
            >
              Optimize / recalculate ETAs
            </Button>
          )}
        </Box>
      )}

      <DeliveryDetailsModal
        open={Boolean(selectedCard)}
        card={selectedCard}
        run={run ?? null}
        canManage={canManage}
        daySlots={daySlots}
        onClose={() => setSelectedKey(null)}
        onSaveNotes={async (jobId, notes) => {
          if (run) {
            const stop = run.stops.find((s) => s.job_id === jobId);
            if (stop) {
              await actions.notes.mutateAsync({ stopId: stop.id, notes });
              return;
            }
          }
          await updateJob.mutateAsync({ id: jobId, data: { notes } });
        }}
        onAppendAddress={async (jobId, data) => {
          await actions.appendAddress.mutateAsync({ jobId, ...data });
        }}
        onReschedule={
          canManage
            ? async (jobId, availabilityIdValue, notes) => {
                await actions.reschedule.mutateAsync({
                  jobId,
                  availability_id: availabilityIdValue,
                  notes,
                });
              }
            : undefined
        }
        onCancel={
          canManage
            ? async (jobId) => {
                await updateJob.mutateAsync({ id: jobId, data: { status: 'cancelled' } });
                await refetch();
                enqueueSnackbar('Cancelled', { variant: 'info' });
              }
            : undefined
        }
        onUpdateContact={
          canManage
            ? async (jobId, data) => {
                await updateJob.mutateAsync({ id: jobId, data });
              }
            : undefined
        }
        onScanVerify={async (stopId, sku) => {
          try {
            await actions.scanVerify.mutateAsync({ stopId, sku });
            enqueueSnackbar(`Verified ${sku}`, { variant: 'success' });
          } catch (err) {
            enqueueSnackbar(errMsg(err, 'SKU mismatch'), { variant: 'error' });
            throw err;
          }
        }}
      />
    </Paper>
  );
}
