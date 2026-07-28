import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import { useSnackbar } from 'notistack';
import type {
  DeliveryDayDetail,
  DeliveryRun,
  DeliveryRunStop,
  DeliveryStopItem,
} from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import type { useFieldPhotoUpload } from '../useFieldPhotoUpload';
import {
  clampSelectedStopId,
  compactStopItemSummary,
  defaultSelectedStopId,
  loadStopTone,
  partitionLoadBoardStops,
  stopDisplayName,
  stopItemCountLabel,
  stopNeedsScanBeforeLoad,
  stopsForUiStep,
} from '../fieldStepUtils';
import {
  canReopenTruckFromRun,
  canSealTruckFromRun,
  resolveStepCompletionControl,
  resolveStepSurface,
  runAllowsAction,
  sealTruckBlockers,
  sealWindowPhotoCount,
  truckLoadReadyToSeal,
} from '../fieldStepSurface';
import { finalActionThenAdvance } from '../finalActionAdvance';
import { normalizeFieldPhase } from '../fieldRunUtils';
import { extractScanErrorDetail, extractSkuFromScannedPayload } from '../fieldBarcodeScanner';
import { FieldDeliveryPager } from '../components/FieldDeliveryPager';
import { FieldDeliveryCardFrame } from '../components/FieldDeliveryCardFrame';
import { FieldDeliveryDetailsSheet } from '../components/FieldDeliveryDetailsSheet';
import { FieldBarcodeScannerSheet } from '../components/FieldBarcodeScannerSheet';
import { FieldStopSummaryRow } from '../components/FieldStopSummaryRow';
import { FieldStepSummaryShell } from '../components/FieldStepSummaryShell';
import { FieldSheet } from '../components/FieldSheet';
import {
  ecoField,
  ecoFieldPrimaryButtonSx,
  ecoFieldSecondaryOutlineSx,
  frameToneFromDotTone,
} from '../ecoFieldTheme';

function mutationErrorDetail(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'response' in err &&
    err.response &&
    typeof err.response === 'object' &&
    'data' in err.response &&
    err.response.data &&
    typeof err.response.data === 'object' &&
    'detail' in err.response.data
  ) {
    return String((err.response.data as { detail?: unknown }).detail || '');
  }
  return '';
}

const UNLOAD_REASONS = [
  'Left at dock by mistake',
  'Customer cancelled / not going',
  'Wrong truck / reload later',
  'Other',
];

function stopItemLines(stop: DeliveryRunStop): DeliveryStopItem[] {
  return stop.stop_items ?? [];
}

type UnloadFlow = {
  stop: DeliveryRunStop;
  step: 'scope' | 'pick_item' | 'reason';
  mode: 'one' | 'full' | null;
  itemId: number | null;
};

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;
type Photo = ReturnType<typeof useFieldPhotoUpload>;

type ScanTarget = { stopId: number; itemId: number };

type Props = {
  day: DeliveryDayDetail;
  run: DeliveryRun;
  mutations: Mutations;
  photo: Photo;
  busy: boolean;
  canManage?: boolean;
  onContinueRoutes: () => void;
};

function needsScan(item: DeliveryStopItem): boolean {
  return !item.is_verified && !item.verification_skipped;
}

/** Verified/skipped under older load rules but never marked loaded — stuck without actions. */
function needsLoadHeal(item: DeliveryStopItem): boolean {
  return (
    !item.is_ready &&
    !item.loaded_at &&
    (item.is_verified || item.verification_skipped)
  );
}

function nextScanTarget(stops: DeliveryRunStop[]): ScanTarget | null {
  for (const s of stops) {
    for (const item of s.stop_items ?? []) {
      if (needsScan(item)) return { stopId: s.id, itemId: item.id };
    }
  }
  return null;
}

export function LoadStep({
  day,
  run,
  mutations,
  photo,
  busy,
  canManage,
  onContinueRoutes,
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const stops = useMemo(() => stopsForUiStep(run, 'load'), [run]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [skipItemId, setSkipItemId] = useState<number | null>(null);
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [unloadFlow, setUnloadFlow] = useState<UnloadFlow | null>(null);
  const [editing, setEditing] = useState(false);
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false);
  /** After Seal opens the camera, finish close_truck once the seal-window photo lands. */
  const [sealAfterPhoto, setSealAfterPhoto] = useState(false);
  /** Closing the scanner with X pauses auto-advance so the driver can browse out of order. */
  const [autoScan, setAutoScan] = useState(true);
  const healedItemIdsRef = useRef(new Set<number>());
  const phase = normalizeFieldPhase(run.phase);
  const inTruckClose = phase === 'truck' || Boolean(run.truck_closed);
  const { onTruck, notOnTruck } = useMemo(() => partitionLoadBoardStops(stops), [stops]);
  // After seal, load/unload are review-only unless server still advertises load actions.
  const canMutateLoad = run.truck_closed
    ? runAllowsAction(run.allowed_actions, 'load') ||
      runAllowsAction(run.allowed_actions, 'scan_verify')
    : true;

  const submitScan = async (
    itemId: number,
    code: string,
    notify = true,
    allowMismatch = false,
  ) => {
    const scanned = extractSkuFromScannedPayload(code);
    if (!scanned) return;
    try {
      await mutations.scanItem.mutateAsync({
        itemId,
        scanned_code: scanned,
        client_scan_id: crypto.randomUUID(),
        allow_mismatch: allowMismatch,
      });
    } catch (err) {
      if (notify) enqueueSnackbar(extractScanErrorDetail(err), { variant: 'error' });
      throw err;
    }
  };

  useEffect(() => {
    setSelectedId((prev) =>
      clampSelectedStopId(stops, prev, defaultSelectedStopId(run, 'load')),
    );
  }, [stops, run]);

  // Heal pre-change rows: scanned/skipped but not loaded → mark loaded so status goes green.
  useEffect(() => {
    for (const s of stops) {
      for (const item of s.stop_items ?? []) {
        if (!needsLoadHeal(item) || healedItemIdsRef.current.has(item.id)) continue;
        healedItemIdsRef.current.add(item.id);
        void mutations.loadItem
          .mutateAsync({ itemId: item.id, loaded: true })
          .catch(() => {
            healedItemIdsRef.current.delete(item.id);
          });
      }
    }
  }, [stops, mutations.loadItem]);

  const allLoaded = stops.every((s) => loadStopTone(s) === 'complete');
  const hasPendingScans = Boolean(nextScanTarget(stops));
  // Summary once scans are done (or truck phase). Edit reopens action cards.
  const workComplete = inTruckClose || allLoaded || !hasPendingScans;
  const surface = resolveStepSurface({
    workComplete: workComplete && scanTarget == null && skipItemId == null,
    editing,
  });
  const showLoadBoard = surface === 'summary';

  useEffect(() => {
    if (!workComplete) setEditing(false);
  }, [workComplete]);

  // Camera-first: open the next unverified item immediately while auto-scan is on.
  useEffect(() => {
    if (!autoScan || surface !== 'work') return;
    if (scanTarget != null || skipItemId != null) return;
    // Wait until stuck verified-but-unloaded rows are healed, or Scan/Skip never appear.
    const healing = stops.some((s) => (s.stop_items ?? []).some(needsLoadHeal));
    if (healing) return;
    const next = nextScanTarget(stops);
    if (!next) return;
    setSelectedId(next.stopId);
    setScanTarget(next);
  }, [autoScan, surface, scanTarget, skipItemId, stops]);

  const stop = stops.find((s) => s.id === selectedId) ?? null;
  const scanningStop =
    scanTarget != null ? stops.find((s) => s.id === scanTarget.stopId) ?? null : null;
  const scanningItem =
    scanTarget != null
      ? (scanningStop?.stop_items ?? []).find((item) => item.id === scanTarget.itemId) ?? null
      : null;

  const load = run.monitor?.load;
  const maxTruckPhotos = run.max_truck_photos || 4;
  // Seal-window count so a reopen resets the photo counter to 0/N.
  const truckPhotoCount = sealWindowPhotoCount(run);
  const truckPhotos = run.truck_photos ?? [];
  const canReopenTruck = canReopenTruckFromRun(run);

  const openScanForItem = (stopId: number, itemId: number) => {
    setSealAfterPhoto(false);
    setAutoScan(true);
    setSelectedId(stopId);
    setScanTarget({ stopId, itemId });
  };

  const handleScannerClose = () => {
    const item = scanningItem;
    const completed = Boolean(item?.is_verified || item?.verification_skipped);
    setScanTarget(null);
    // X / dismiss while still needing a scan → stop auto-open so they can scroll items.
    if (!completed) setAutoScan(false);
  };

  const quickLoadStop = async (s: DeliveryRunStop) => {
    setSealAfterPhoto(false);
    if (stopNeedsScanBeforeLoad(s)) {
      const first = (s.stop_items ?? []).find(needsScan);
      if (!first) return;
      setAutoScan(true);
      setSelectedId(s.id);
      setScanTarget({ stopId: s.id, itemId: first.id });
      return;
    }
    try {
      await mutations.loadStop.mutateAsync({ stopId: s.id, loaded: true });
      enqueueSnackbar(`${stopDisplayName(s).split(' ')[0]} loaded`, { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not load stop', { variant: 'error' });
    }
  };

  const confirmUnload = async (reason: string) => {
    if (!unloadFlow) return;
    try {
      if (unloadFlow.mode === 'one' && unloadFlow.itemId != null) {
        await mutations.loadItem.mutateAsync({
          itemId: unloadFlow.itemId,
          loaded: false,
          reason,
        });
        enqueueSnackbar('Item unloaded from truck', { variant: 'info' });
      } else {
        await mutations.loadStop.mutateAsync({
          stopId: unloadFlow.stop.id,
          loaded: false,
          reason,
        });
        enqueueSnackbar('Delivery unloaded from truck', { variant: 'info' });
      }
      setUnloadFlow(null);
    } catch {
      enqueueSnackbar('Could not unload', { variant: 'error' });
    }
  };

  const loadedItemsOnStop = (s: DeliveryRunStop) =>
    stopItemLines(s).filter((i) => Boolean(i.loaded_at) || i.is_ready);

  const sealAndContinue = async () => {
    if (!run.truck_closed && !canSealTruckFromRun(run)) {
      // Camera-first: when load is ready but this seal window has no photo, open camera.
      if (truckLoadReadyToSeal(run) && sealWindowPhotoCount(run) < 1) {
        setSealAfterPhoto(true);
        photo.pickPhoto('truck');
        return;
      }
      const reason = sealTruckBlockers(run)[0] || 'Truck is not ready to seal';
      enqueueSnackbar(reason, { variant: 'warning' });
      return;
    }
    setSealAfterPhoto(false);
    try {
      await finalActionThenAdvance(async () => {
        if (!run.truck_closed) {
          await mutations.closeTruck.mutateAsync(run.id);
        }
        await mutations.setPhase.mutateAsync({ runId: run.id, phase: 'route' });
      }, onContinueRoutes);
    } catch (err: unknown) {
      enqueueSnackbar(mutationErrorDetail(err) || 'Could not continue to Routes', {
        variant: 'error',
      });
    }
  };

  // Finish seal once the camera photo lands in the current seal window.
  useEffect(() => {
    if (!sealAfterPhoto) return;
    if (!canSealTruckFromRun(run)) return;
    setSealAfterPhoto(false);
    void sealAndContinue();
    // sealAndContinue closes over latest run/mutations; trigger only on photo readiness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sealAfterPhoto, run.truck_seal_photo_count, run.truck_photo_count, run.truck_closed, run.truck_closed_at]);

  const confirmReopenTruck = async () => {
    try {
      await mutations.reopenTruck.mutateAsync({ runId: run.id });
      setReopenConfirmOpen(false);
      setSealAfterPhoto(false);
      enqueueSnackbar('Truck reopened — load more, then reseal to continue', {
        variant: 'info',
      });
    } catch (err: unknown) {
      enqueueSnackbar(mutationErrorDetail(err) || 'Could not reopen truck', {
        variant: 'error',
      });
    }
  };

  const openEditStop = (s: DeliveryRunStop) => {
    setSealAfterPhoto(false);
    setSelectedId(s.id);
    setAutoScan(false);
    setEditing(true);
  };

  const unloadSheet = (
    <FieldSheet
      open={Boolean(unloadFlow)}
      onClose={() => setUnloadFlow(null)}
      eyebrow="Unload from truck"
      title={
        unloadFlow ? `Unload ${stopDisplayName(unloadFlow.stop).split(' ')[0]}?` : 'Unload'
      }
    >
      {unloadFlow?.step === 'scope' && (
        <Stack spacing={1}>
          <Button
            fullWidth
            variant="outlined"
            disabled={busy}
            onClick={() =>
              setUnloadFlow((prev) =>
                prev ? { ...prev, step: 'pick_item', mode: 'one', itemId: null } : prev,
              )
            }
            sx={{ minHeight: 56, borderRadius: 2, fontWeight: 750 }}
          >
            1 item
          </Button>
          <Button
            fullWidth
            variant="contained"
            disabled={busy}
            onClick={() =>
              setUnloadFlow((prev) =>
                prev ? { ...prev, step: 'reason', mode: 'full', itemId: null } : prev,
              )
            }
            sx={ecoFieldPrimaryButtonSx}
          >
            Full delivery
          </Button>
        </Stack>
      )}

      {unloadFlow?.step === 'pick_item' && (
        <Stack spacing={1}>
          {loadedItemsOnStop(unloadFlow.stop).map((item) => (
            <Button
              key={item.id}
              fullWidth
              variant="outlined"
              disabled={busy}
              onClick={() =>
                setUnloadFlow((prev) =>
                  prev ? { ...prev, step: 'reason', mode: 'one', itemId: item.id } : prev,
                )
              }
              sx={{
                minHeight: 56,
                borderRadius: 2,
                fontWeight: 750,
                justifyContent: 'flex-start',
                textAlign: 'left',
              }}
            >
              {item.description || item.sku || 'Item'}
              {item.sku ? ` · ${item.sku}` : ''}
            </Button>
          ))}
          <Button
            fullWidth
            variant="text"
            onClick={() =>
              setUnloadFlow((prev) =>
                prev ? { ...prev, step: 'scope', mode: null, itemId: null } : prev,
              )
            }
            sx={{ fontWeight: 750 }}
          >
            Back
          </Button>
        </Stack>
      )}

      {unloadFlow?.step === 'reason' && (
        <Stack spacing={1}>
          {UNLOAD_REASONS.map((reason) => (
            <Button
              key={reason}
              variant="outlined"
              disabled={busy}
              onClick={() => void confirmUnload(reason)}
              sx={{ minHeight: 52, borderRadius: 2, fontWeight: 750 }}
            >
              {reason}
            </Button>
          ))}
          <Button
            fullWidth
            variant="text"
            onClick={() =>
              setUnloadFlow((prev) => {
                if (!prev) return prev;
                const loaded = loadedItemsOnStop(prev.stop);
                if (prev.mode === 'one' && loaded.length > 1) {
                  return { ...prev, step: 'pick_item', itemId: null };
                }
                if (loaded.length > 1) {
                  return { ...prev, step: 'scope', mode: null, itemId: null };
                }
                return null;
              })
            }
            sx={{ fontWeight: 750 }}
          >
            Back
          </Button>
        </Stack>
      )}
    </FieldSheet>
  );

  if (showLoadBoard) {
    const sealWindowPhotos = run.truck_reopened_at
      ? truckPhotos.filter(
          (p) => !p.created_at || Date.parse(p.created_at) >= Date.parse(run.truck_reopened_at!),
        )
      : truckPhotos;
    const photoThumbs =
      sealWindowPhotos.length > 0 ? (
        <Stack direction="row" spacing={0.75} sx={{ overflowX: 'auto', pb: 0.25 }}>
          {sealWindowPhotos.slice(0, maxTruckPhotos).map((p) => (
            <Box
              key={p.id}
              component="img"
              src={p.url}
              alt="Truck"
              sx={{
                width: 56,
                height: 56,
                objectFit: 'cover',
                borderRadius: 1.5,
                flexShrink: 0,
                border: `1.5px solid ${ecoField.green}`,
                bgcolor: ecoField.tint,
              }}
            />
          ))}
        </Stack>
      ) : null;

    const completion = resolveStepCompletionControl({
      step: 'load',
      run,
      workComplete,
      editing,
      canMutate: canMutateLoad,
    });

    return (
      <>
        <FieldStepSummaryShell
          header={`${onTruck.length} on truck · ${notOnTruck.length} not on truck${
            load?.total_items != null ? ` · ${load.total_items} items` : ''
          }${
            run.truck_reopened_at && !run.truck_closed
              ? ' · truck open — reseal to continue'
              : ''
          }`}
          completion={completion}
          onCompletionAction={() => {
            if (completion.mode === 'reopen') {
              setSealAfterPhoto(false);
              setEditing(true);
              return;
            }
            void sealAndContinue();
          }}
          primaryDisabled={busy}
          primaryBusy={busy}
          secondaryLabel={
            run.truck_closed
              ? undefined
              : truckPhotoCount >= maxTruckPhotos
                ? `Truck photos (${truckPhotoCount}/${maxTruckPhotos})`
                : truckPhotoCount >= 1
                  ? `Add another truck photo (${truckPhotoCount}/${maxTruckPhotos})`
                  : run.truck_reopened_at
                    ? `Add new truck photo (${truckPhotoCount}/${maxTruckPhotos})`
                    : `Add truck photo (${truckPhotoCount}/${maxTruckPhotos})`
          }
          onSecondary={
            run.truck_closed
              ? undefined
              : () => {
                  setSealAfterPhoto(false);
                  photo.pickPhoto('truck');
                }
          }
          secondaryDisabled={busy || truckPhotoCount >= maxTruckPhotos}
          secondaryIcon={<CameraAltOutlined />}
          footerExtra={
            <Stack spacing={1}>
              {photoThumbs}
              {canReopenTruck && (
                <Button
                  fullWidth
                  variant="outlined"
                  disabled={busy}
                  onClick={() => {
                    setSealAfterPhoto(false);
                    setReopenConfirmOpen(true);
                  }}
                  sx={{ ...ecoFieldSecondaryOutlineSx, minHeight: 46 }}
                >
                  Reopen truck to load more
                </Button>
              )}
            </Stack>
          }
        >
          <Typography
            variant="caption"
            fontWeight={800}
            sx={{ color: ecoField.muted, letterSpacing: '.1em', textTransform: 'uppercase' }}
          >
            On truck
          </Typography>
          <Stack spacing={1} sx={{ mt: 1, mb: 2.5 }}>
            {onTruck.map((s) => {
              const items = loadedItemsOnStop(s);
              return (
                <FieldStopSummaryRow
                  key={s.id}
                  stop={s}
                  tone="complete"
                  titleMeta={stopItemCountLabel(s)}
                  subtitle={compactStopItemSummary(s)}
                  statusLabel="On truck"
                  complete
                  onActivate={() => openEditStop(s)}
                  disabled={busy}
                  trailing={
                    canMutateLoad ? (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSealAfterPhoto(false);
                          setUnloadFlow({
                            stop: s,
                            step: items.length > 1 ? 'scope' : 'reason',
                            mode: items.length > 1 ? null : 'full',
                            itemId: items.length === 1 ? items[0].id : null,
                          });
                        }}
                        sx={{
                          minHeight: 32,
                          px: 1,
                          borderRadius: 2,
                          fontWeight: 750,
                          color: ecoField.red,
                          borderColor: ecoField.red,
                        }}
                      >
                        Unload
                      </Button>
                    ) : undefined
                  }
                />
              );
            })}
          </Stack>

          <Typography
            variant="caption"
            fontWeight={800}
            sx={{ color: ecoField.muted, letterSpacing: '.1em', textTransform: 'uppercase' }}
          >
            Not on truck
          </Typography>
          <Stack spacing={1} sx={{ mt: 1, mb: 2 }}>
            {notOnTruck.map((s) => {
              const tone = loadStopTone(s);
              return (
                <FieldStopSummaryRow
                  key={s.id}
                  stop={s}
                  tone={tone}
                  titleMeta={stopItemCountLabel(s)}
                  subtitle={compactStopItemSummary(s)}
                  complete={false}
                  onActivate={() => openEditStop(s)}
                  disabled={busy}
                  trailing={
                    canMutateLoad ? (
                      <Button
                        size="small"
                        variant="contained"
                        disabled={busy}
                        onClick={(event) => {
                          event.stopPropagation();
                          void quickLoadStop(s);
                        }}
                        sx={{
                          minHeight: 32,
                          px: 1.25,
                          borderRadius: 2,
                          fontWeight: 800,
                          bgcolor: ecoField.green,
                          boxShadow: 'none',
                          '&:hover': { bgcolor: ecoField.greenDeep, boxShadow: 'none' },
                        }}
                      >
                        Load
                      </Button>
                    ) : undefined
                  }
                />
              );
            })}
          </Stack>
        </FieldStepSummaryShell>
        {unloadSheet}
        <FieldSheet
          open={reopenConfirmOpen}
          onClose={() => setReopenConfirmOpen(false)}
          eyebrow="Reopen truck"
          title="Load more after sealing?"
        >
          <Stack spacing={1.25}>
            <Typography color="text.secondary">
              You&apos;ll need a new truck photo before starting deliveries.
            </Typography>
            <Button
              fullWidth
              variant="contained"
              disabled={busy}
              onClick={() => void confirmReopenTruck()}
              sx={ecoFieldPrimaryButtonSx}
            >
              Reopen truck
            </Button>
            <Button
              fullWidth
              variant="outlined"
              disabled={busy}
              onClick={() => setReopenConfirmOpen(false)}
              sx={ecoFieldSecondaryOutlineSx}
            >
              Cancel
            </Button>
          </Stack>
        </FieldSheet>
      </>
    );
  }

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <FieldDeliveryPager
        stops={stops}
        selectedId={selectedId}
        toneFor={loadStopTone}
        onSelect={(id) => {
          setSelectedId(id);
          // Browsing stops manually pauses camera auto-open.
          if (scanTarget == null) setAutoScan(false);
        }}
        disabled={busy}
      >
        {stop && (
          <FieldDeliveryCardFrame
            stop={stop}
            statusLabel={loadStopTone(stop) === 'complete' ? 'Ready' : 'Loading'}
            statusTone={frameToneFromDotTone(loadStopTone(stop))}
            stepAccent="load"
            onOpenDetails={() => setDetailsOpen(true)}
            onOpenItems={() => setItemsOpen(true)}
          >
            <Stack spacing={1.25}>
              {(stop.stop_items ?? []).map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    border: `1.5px solid ${
                      item.is_ready ? ecoField.green : ecoField.line
                    }`,
                    borderRadius: `${18}px`,
                    p: 1.5,
                    bgcolor: item.is_ready ? ecoField.tint : '#fff',
                  }}
                >
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box sx={{ minWidth: 0, pr: 1 }}>
                      <Typography fontWeight={800}>{item.description}</Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={700}>
                        SKU {item.sku || '—'} · ×{item.quantity}
                      </Typography>
                    </Box>
                    {item.is_ready && (
                      <Chip
                        size="small"
                        label="✓ Loaded"
                        sx={{
                          bgcolor: ecoField.tint,
                          color: ecoField.greenDeep,
                          fontWeight: 800,
                          border: `1px solid ${ecoField.green}`,
                        }}
                      />
                    )}
                  </Stack>

                  {needsScan(item) && (
                    <Stack spacing={1} sx={{ mt: 1.25 }}>
                      <Stack direction="row" spacing={1}>
                        <Button
                          fullWidth
                          variant="contained"
                          startIcon={<QrCodeScannerRounded />}
                          disabled={busy}
                          onClick={() => openScanForItem(stop.id, item.id)}
                          sx={{ ...ecoFieldPrimaryButtonSx, minHeight: 52 }}
                        >
                          Scan
                        </Button>
                        <Button
                          fullWidth
                          variant="outlined"
                          disabled={busy}
                          onClick={() => {
                            setAutoScan(false);
                            setSkipItemId(item.id);
                          }}
                          sx={ecoFieldSecondaryOutlineSx}
                        >
                          Skip scan
                        </Button>
                      </Stack>
                      {item.scans_required > 1 && (
                        <LinearProgress
                          variant="determinate"
                          value={
                            item.scans_required > 0
                              ? (item.scan_count / item.scans_required) * 100
                              : 0
                          }
                          sx={{ height: 7, borderRadius: 99 }}
                        />
                      )}
                    </Stack>
                  )}

                  {needsLoadHeal(item) && (
                    <Button
                      fullWidth
                      variant="contained"
                      disabled={busy}
                      onClick={() =>
                        void mutations.loadItem.mutateAsync({ itemId: item.id, loaded: true })
                      }
                      sx={{ ...ecoFieldPrimaryButtonSx, mt: 1.25, minHeight: 52 }}
                    >
                      Mark loaded
                    </Button>
                  )}
                </Box>
              ))}
              {!(stop.stop_items ?? []).length && (
                <Typography color="text.secondary">No item lines on this delivery.</Typography>
              )}
            </Stack>
          </FieldDeliveryCardFrame>
        )}
      </FieldDeliveryPager>

      {surface === 'edit' && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Button
            fullWidth
            variant="outlined"
            onClick={() => {
              setEditing(false);
              setScanTarget(null);
              setSkipItemId(null);
              setAutoScan(false);
            }}
            sx={{ ...ecoFieldSecondaryOutlineSx, minHeight: 48 }}
          >
            Done editing
          </Button>
        </Box>
      )}

      <FieldBarcodeScannerSheet
        open={scanTarget != null && scanningItem != null}
        onClose={handleScannerClose}
        title={scanningItem?.description || 'Scan item'}
        eyebrow="Load verify"
        expectedSku={scanningItem?.sku || undefined}
        scanCount={scanningItem?.scan_count ?? 0}
        scansRequired={scanningItem?.scans_required ?? 1}
        verified={Boolean(scanningItem?.is_verified || scanningItem?.verification_skipped)}
        paused={mutations.scanItem.isPending}
        onScan={async (code, opts) => {
          if (scanTarget == null) return;
          await submitScan(scanTarget.itemId, code, false, Boolean(opts?.allow_mismatch));
        }}
        onSkipScan={() => {
          if (scanTarget == null) return;
          setSkipItemId(scanTarget.itemId);
          setScanTarget(null);
        }}
      />

      <FieldSheet
        open={skipItemId != null}
        onClose={() => {
          // Backing out of skip without choosing a reason — stay in browse mode.
          setSkipItemId(null);
          setAutoScan(false);
        }}
        title="No SKU / can’t scan"
        eyebrow="Audited exception"
      >
        <Stack spacing={1}>
          {['Label missing or damaged', 'No SKU on item', 'Other reason'].map((reason) => (
            <Button
              key={reason}
              variant="outlined"
              sx={{ minHeight: 58, borderRadius: 2, fontWeight: 750 }}
              onClick={async () => {
                if (skipItemId == null) return;
                await mutations.skipItem.mutateAsync({ itemId: skipItemId, reason });
                setSkipItemId(null);
                // Keep auto-scan so the next item camera opens immediately.
                setAutoScan(true);
              }}
            >
              {reason}
            </Button>
          ))}
        </Stack>
      </FieldSheet>

      <FieldSheet open={itemsOpen} onClose={() => setItemsOpen(false)} title="Items on this delivery">
        <Stack spacing={1}>
          {(stop?.stop_items ?? []).map((item) => (
            <Typography key={item.id} fontWeight={700}>
              ×{item.quantity} {item.description}
              {item.is_ready ? ' · ready' : ''}
            </Typography>
          ))}
        </Stack>
      </FieldSheet>

      <FieldDeliveryDetailsSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        day={day}
        stop={stop}
        canManage={canManage}
      />
    </Stack>
  );
}
