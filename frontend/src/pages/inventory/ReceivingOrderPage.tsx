import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, Typography, LinearProgress } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import ArrowBack from '@mui/icons-material/ArrowBack';
import useMediaQuery from '@mui/material/useMediaQuery';
import { format } from 'date-fns';

import {
  PALLET_SIDES,
  compressImageToJpeg,
  drainPhotoUploadQueue,
  enqueuePendingPhoto,
  pendingCountForOrder,
  saveWizardStep,
  loadWizardStep,
  type PendingPhotoKind,
} from '../../services/receiving/receivingClient';
import {
  completeReceiving,
  createOrderDispute,
  fetchOrdersForReceiving,
  uploadReceivingPhoto,
} from '../../api/inventory.api';
import { usePurchaseOrderSurface } from '../../hooks/useInventory';
import { receivingDetailQueryKey, usePatchReceivingMutation, useReceivingDetail } from '../../hooks/useReceiving';
import { LoadingScreen } from '../../components/feedback/LoadingScreen';
import ReceivingDesktopWorkspace from '../../components/inventory/receiving/ReceivingDesktopWorkspace';
import { rcvSurface } from '../../components/inventory/receiving/receivingTheme';
import ReceivingMobileWizard from '../../components/inventory/receiving/ReceivingMobileWizard';
import type { PalletSideId, ReceivingDetailDTO, ReceivingPatchPayload } from '../../types/inventory.types';
import { useSnackbar } from 'notistack';

function palletSlotFilled(rec: ReceivingDetailDTO, palletNumber: number, side: string): boolean {
  return rec.attachments.some(
    (a) =>
      a.kind === 'pallet_side' &&
      a.pallet_number === palletNumber &&
      a.side === side,
  );
}

export default function ReceivingOrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const oid = Number.isFinite(Number(id)) ? Number(id) : null;
  const mobile = useMediaQuery('(max-width:767px)');

  const po = usePurchaseOrderSurface(oid);
  const receivingQ = useReceivingDetail(oid);
  const patchMut = usePatchReceivingMutation(oid);

  const [palletCountInput, setPalletCountInput] = useState(0);
  const [issuesDraft, setIssuesDraft] = useState('');
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [pendingUploadsUi, setPendingUploadsUi] = useState(0);

  const m = receivingQ.data;

  useEffect(() => {
    if (!m) return;
    setPalletCountInput(m.received_pallet_count || 0);
    setIssuesDraft(m.issues || '');
  }, [m]);

  useEffect(() => {
    if (!mobile || !oid) return;
    let cancelled = false;
    void loadWizardStep(oid).then((s) => {
      if (!cancelled && s !== null && s !== undefined) setWizardStep(Math.max(0, Math.min(3, s)));
    });
    return () => {
      cancelled = true;
    };
  }, [mobile, oid]);

  useEffect(() => {
    if (!mobile || !oid) return;
    void saveWizardStep(oid, wizardStep);
  }, [wizardStep, mobile, oid]);

  const flushPendingBadge = useCallback(async () => {
    if (!oid) return;
    const n = await pendingCountForOrder(oid);
    setPendingUploadsUi(n);
  }, [oid]);

  useEffect(() => {
    void flushPendingBadge();
  }, [flushPendingBadge, m?.draft_version]);

  const drainOnline = useCallback(async () => {
    if (!oid) return;
    try {
      await drainPhotoUploadQueue(oid, async (blob, meta) => {
        await uploadReceivingPhoto(oid, blob, {
          kind: meta.kind as 'bol' | 'truck' | 'pallet_side',
          client_photo_id: meta.clientPhotoId,
          pallet_number: meta.palletNumber,
          side: meta.side,
        });
      });
      await queryClient.invalidateQueries({ queryKey: receivingDetailQueryKey(oid) });
    } catch {
      /* uploads may fail offline */
    }
    await flushPendingBadge();
  }, [oid, queryClient, flushPendingBadge]);

  useEffect(() => {
    void drainOnline();
  }, [drainOnline, oid]);

  useEffect(() => {
    const on = () => void drainOnline();
    window.addEventListener('online', on);
    return () => window.removeEventListener('online', on);
  }, [drainOnline]);

  const sendPatch = useCallback(
    (payload: ReceivingPatchPayload) => {
      patchMut.mutate(payload, {
        onError: (e) => {
          enqueueSnackbar((e as Error)?.message || 'Save failed', { variant: 'error' });
        },
      });
    },
    [patchMut, enqueueSnackbar],
  );

  const buildPalletsFromCount = useCallback(
    (count: number, base: ReceivingDetailDTO | undefined): ReceivingPatchPayload['pallets'] => {
      const existing = new Map((base?.pallets ?? []).map((p) => [p.pallet_number, p.damaged]));
      const out: Array<{ pallet_number: number; damaged: boolean }> = [];
      for (let n = 1; n <= count; n++) {
        out.push({ pallet_number: n, damaged: existing.get(n) ?? false });
      }
      return out;
    },
    [],
  );

  const onQuickFill = useCallback(() => {
    setPalletCountInput(1);
    sendPatch({ received_pallet_count: 1, pallets: [{ pallet_number: 1, damaged: false }] });
  }, [sendPatch]);

  const onPalletCountChange = useCallback(
    (n: number) => {
      setPalletCountInput(n);
      sendPatch({ received_pallet_count: n, pallets: buildPalletsFromCount(n, m) ?? [] });
    },
    [buildPalletsFromCount, m, sendPatch],
  );

  const onDamaged = useCallback(
    (palletNumber: number, damaged: boolean) => {
      const count = m?.received_pallet_count ?? palletCountInput ?? 0;
      const pmap = new Map((m?.pallets ?? []).map((p) => [p.pallet_number, p.damaged]));
      pmap.set(palletNumber, damaged);
      const pallets: Array<{ pallet_number: number; damaged: boolean }> = [];
      for (let n = 1; n <= count; n++) pallets.push({ pallet_number: n, damaged: pmap.get(n) ?? false });
      sendPatch({ received_pallet_count: count, pallets });
    },
    [m, palletCountInput, sendPatch],
  );

  const runPhotoPipeline = useCallback(
    async (kind: PendingPhotoKind, file: File, extra?: { palletNumber?: number; side?: string }) => {
      if (oid == null || !Number.isFinite(oid)) return;
      const blob = await compressImageToJpeg(file);
      const clientPhotoId = crypto.randomUUID();
      const pk =
        extra?.palletNumber != null && extra?.side
          ? `${extra.palletNumber}-${extra.side}`
          : `${kind}`;
      setUploadingKey(pk);
      try {
        await enqueuePendingPhoto({
          orderId: oid,
          blob,
          clientPhotoId,
          kind,
          palletNumber: extra?.palletNumber,
          side: extra?.side,
        });
        await drainOnline();
      } finally {
        setUploadingKey(null);
      }
    },
    [drainOnline, oid],
  );

  const onBolTruckPick = useCallback(
    async (kind: 'bol' | 'truck', files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      try {
        await runPhotoPipeline(kind, f);
      } catch {
        enqueueSnackbar('Photo failed — will retry when online.', { variant: 'warning' });
      }
    },
    [runPhotoPipeline, enqueueSnackbar],
  );

  const onPalletPick = useCallback(
    async (pallet: number, side: PalletSideId, files: FileList | null) => {
      const f = files?.[0];
      if (!f) return;
      try {
        await runPhotoPipeline('pallet_side', f, { palletNumber: pallet, side });
      } catch {
        enqueueSnackbar('Photo saved locally — syncing when connection allows.', { variant: 'info' });
      }
    },
    [runPhotoPipeline, enqueueSnackbar],
  );

  const pickerOrdersQ = useQuery({
    queryKey: ['ordersForReceiving', 'picker-toolbar'],
    enabled: oid != null && Number.isFinite(oid) && !mobile,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await fetchOrdersForReceiving({ page: 1, page_size: 200 });
      return data;
    },
  });

  const onPalletSet = useCallback(
    (count: number) => {
      setPalletCountInput(count);
      sendPatch({ received_pallet_count: count, pallets: buildPalletsFromCount(count, m) ?? [] });
    },
    [buildPalletsFromCount, m, sendPatch],
  );

  const onBulkPalletPhotos = useCallback(
    async (files: File[]) => {
      if (oid == null || files.length === 0) return;
      const imgs = [...files];
      const count = (
        queryClient.getQueryData<ReceivingDetailDTO>(receivingDetailQueryKey(oid)) ?? m
      )?.received_pallet_count;
      if (!count || count < 1 || !m) return;

      outer: for (let pn = 1; pn <= count && imgs.length > 0; pn++) {
        for (const s of PALLET_SIDES) {
          if (imgs.length === 0) break outer;
          const cur =
            queryClient.getQueryData<ReceivingDetailDTO>(receivingDetailQueryKey(oid)) ?? m;
          if (palletSlotFilled(cur, pn, s)) continue;
          const next = imgs.shift();
          if (!next) break outer;
          try {
            await runPhotoPipeline('pallet_side', next, {
              palletNumber: pn,
              side: s as PalletSideId,
            });
          } catch {
            enqueueSnackbar('Bulk photo failed.', { variant: 'warning' });
            return;
          }
        }
      }
    },
    [oid, queryClient, m, runPhotoPipeline, enqueueSnackbar],
  );

  const intakeDisputeMut = useMutation({
    mutationFn: async ({
      palletNumber,
      subjectPalletId,
    }: {
      palletNumber: number;
      subjectPalletId: number;
    }) => {
      if (oid == null) throw new Error('bad_order');
      const detail = queryClient.getQueryData<ReceivingDetailDTO>(receivingDetailQueryKey(oid));
      if (!detail) throw new Error('no_receiving');
      await createOrderDispute(oid, {
        kind: 'intake',
        title: `Receiving · pallet ${palletNumber}`,
        description: '',
        subject_receiving: detail.id,
        subject_pallet: subjectPalletId,
        payload: { pallet_number: palletNumber, source: 'receiving_ui' },
      });
    },
    onSuccess: () => {
      enqueueSnackbar('Intake dispute opened', { variant: 'success' });
      if (oid != null) {
        void queryClient.invalidateQueries({ queryKey: ['purchaseOrders', oid] });
        void queryClient.invalidateQueries({ queryKey: ['purchaseOrderSurface', oid] });
      }
    },
    onError: () => {
      enqueueSnackbar('Could not open dispute', { variant: 'error' });
    },
  });

  const completeMut = useMutation({
    mutationFn: async () => {
      if (oid == null) throw new Error('bad_order');
      await drainOnline();
      const res = await completeReceiving(oid);
      return res.data;
    },
    onSuccess: () => {
      if (oid == null) return;
      enqueueSnackbar('Receiving complete · order delivered', { variant: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] });
      void queryClient.invalidateQueries({ queryKey: receivingDetailQueryKey(oid) });
      void queryClient.invalidateQueries({ queryKey: ['ordersForReceiving'] });
      void flushPendingBadge();
    },
    onError: (err: unknown) => {
      const detail = err as { response?: { data?: { detail?: unknown } | string }; message?: string };
      const raw = detail?.response?.data;
      const msg =
        typeof raw === 'object' && raw && Array.isArray((raw as { detail?: unknown }).detail)
          ? (raw as { detail: string[] }).detail.join('; ')
          : typeof raw === 'object' &&
              raw &&
              typeof (raw as { detail?: string }).detail === 'string'
            ? (raw as { detail: string }).detail
            : 'Complete failed';
      enqueueSnackbar(msg, { variant: 'error' });
    },
  });

  const orderLabel = useMemo(() => {
    if (po.data) return `${po.data.order_number} · ${po.data.vendor_name}`;
    return oid ? `Order #${oid}` : '';
  }, [po.data, oid]);

  if (!Number.isFinite(oid)) {
    return <Typography color="error">Invalid order.</Typography>;
  }

  if (receivingQ.isLoading || po.isLoading) return <LoadingScreen />;
  if (receivingQ.error || !m) {
    return <Alert severity="error">Could not load receiving.</Alert>;
  }

  const poSurface = po.data ?? undefined;
  if (!mobile && !poSurface) {
    return (
      <Box sx={{ p: 2, bgcolor: rcvSurface.page }}>
        <Alert severity="error">Could not load order details for receiving.</Alert>
        <Button sx={{ mt: 1 }} variant="text" size="small" onClick={() => navigate('/inventory/orders')}>
          Back to orders
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', bgcolor: rcvSurface.page }}>
      {po.data ? (
        <Box
          sx={{
            px: { xs: 1.5, md: 3 },
            py: 1,
            display: 'flex',
            gap: 1,
            flexWrap: 'wrap',
            alignItems: 'center',
            borderBottom: `1px solid ${rcvSurface.panel}`,
          }}
        >
          <Chip
            size="small"
            label={`Receiving track: ${po.data.receiving_status ?? 'not_started'}`}
            color={po.data.receiving_status === 'done' ? 'success' : 'default'}
            variant={po.data.receiving_status === 'active' ? 'filled' : 'outlined'}
          />
          {po.data.receiving_done_at ? (
            <Typography variant="caption" color="text.secondary">
              Completed {format(new Date(po.data.receiving_done_at), 'MMM d, yyyy h:mm a')}
            </Typography>
          ) : null}
          <Chip
            size="small"
            variant="outlined"
            label={`Intake disputes: ${po.data.intake_dispute_status ?? 'none'}`}
          />
        </Box>
      ) : null}
      {mobile && (
        <>
          <Button startIcon={<ArrowBack />} size="small" sx={{ mb: 1 }} onClick={() => navigate('/inventory/orders')}>
            List
          </Button>
          {pendingUploadsUi > 0 && (
            <Typography variant="caption" color="text.secondary" display="block">
              {pendingUploadsUi} photo(s) pending upload
            </Typography>
          )}
        </>
      )}
      {mobile && !navigator.onLine && (
        <Typography variant="caption" color="warning.main" display="block">
          Offline — edits queue locally; photos sync when you are back online.
        </Typography>
      )}
      {(patchMut.isPending || completeMut.isPending) && mobile ? (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            pointerEvents: 'none',
            '& .MuiLinearProgress-root': { height: 3 },
          }}
          aria-hidden
        >
          <LinearProgress color="primary" />
        </Box>
      ) : null}

      {mobile ? (
        <ReceivingMobileWizard
          receiving={m}
          orderLabel={orderLabel}
          step={wizardStep}
          onStepChange={setWizardStep}
          palletCountInput={palletCountInput}
          issuesDraft={issuesDraft}
          uploadingKey={uploadingKey}
          onReceivedDateChange={(iso) => sendPatch({ received_date: iso })}
          onPalletCountChange={onPalletCountChange}
          onQuickFill={onQuickFill}
          onConditionChange={(v) => sendPatch({ condition: v })}
          onIssuesDraftChange={setIssuesDraft}
          onIssuesBlur={() => sendPatch({ issues: issuesDraft })}
          onBolTruckPick={onBolTruckPick}
          onPalletPick={onPalletPick}
          onDamaged={onDamaged}
          onComplete={() => completeMut.mutate()}
          disabled={patchMut.isPending || completeMut.isPending}
        />
      ) : (
        poSurface != null ? (
          <ReceivingDesktopWorkspace
            receiving={m}
            orderNumberMono={poSurface.order_number}
            vendorDisplay={poSurface.vendor_name}
            descriptionLine={poSurface.description ?? ''}
            eligibleOrders={pickerOrdersQ.data?.results ?? []}
            onPickOrder={(nid) => {
              if (nid !== oid) navigate(`/inventory/receiving/${nid}`);
            }}
            onBackToList={() => navigate('/inventory/orders')}
            issuesDraft={issuesDraft}
            palletCountDraftSynced={palletCountInput}
            uploadingKey={uploadingKey}
            onReceivedDateChange={(iso) => sendPatch({ received_date: iso })}
            onStartTimeChange={(hh) => sendPatch({ start_time: hh })}
            onEndTimeChange={(hh) => sendPatch({ end_time: hh })}
            onPalletSet={onPalletSet}
            onConditionChange={(v) => sendPatch({ condition: v })}
            onIssuesDraftChange={setIssuesDraft}
            onIssuesBlur={() => sendPatch({ issues: issuesDraft })}
            onBolTruckPick={onBolTruckPick}
            onBulkPalletPhotos={onBulkPalletPhotos}
            onPalletPick={onPalletPick}
            onDamaged={onDamaged}
            onOpenIntakeDisputeForPallet={(palletNumber, subjectPalletId) => {
              if (subjectPalletId == null) return;
              intakeDisputeMut.mutate({ palletNumber, subjectPalletId });
            }}
            onComplete={() => completeMut.mutate()}
            loadingBar={
              patchMut.isPending || completeMut.isPending || intakeDisputeMut.isPending ? (
                <LinearProgress color="primary" sx={{ flexShrink: 0 }} />
              ) : null
            }
            banners={
              <>
                {pendingUploadsUi > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ px: '24px', pt: 0.5 }}>
                    {pendingUploadsUi} photo(s) pending upload
                  </Typography>
                )}
                {!navigator.onLine && (
                  <Typography variant="caption" color="warning.main" sx={{ px: '24px', pt: 0.5 }}>
                    Offline — edits queue locally; photos sync when you are back online.
                  </Typography>
                )}
              </>
            }
            disabled={patchMut.isPending || completeMut.isPending || intakeDisputeMut.isPending}
        />
        ) : null
      )}
    </Box>
  );
}
