import { useCallback, useEffect, useRef, useState } from 'react';
import { useSnackbar } from 'notistack';
import type { DeliveryRun } from '../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../hooks/useFieldDeliveryRun';
import {
  compressImageToJpeg,
  deleteQueuedDeliveryPhoto,
  drainDeliveryUploadQueue,
  enqueueDeliveryPhoto,
  pendingCountForRun,
  pendingKindsForStop,
  type DeliveryPendingKind,
} from '../../../../services/delivery/deliveryMediaClient';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;

export type FieldPhotoUploadBusy = {
  kind: DeliveryPendingKind;
  label: string;
} | null;

function uploadLabel(kind: DeliveryPendingKind): string {
  switch (kind) {
    case 'truck':
      return 'Uploading truck photo…';
    case 'load_item':
      return 'Uploading load photo…';
    case 'delivery_proof':
      return 'Uploading proof photo…';
    case 'issue':
      return 'Uploading issue photo…';
    case 'signature':
      return 'Saving signature…';
    default:
      return 'Uploading…';
  }
}

export function useFieldPhotoUpload(run: DeliveryRun | null | undefined, mutations: Mutations) {
  const { enqueueSnackbar } = useSnackbar();
  const [pendingUploads, setPendingUploads] = useState(0);
  const [uploading, setUploading] = useState<FieldPhotoUploadBusy>(null);
  const [pendingKindsByStop, setPendingKindsByStop] = useState<
    Record<number, DeliveryPendingKind[]>
  >({});
  const uploadDepthRef = useRef(0);
  const drainingRef = useRef(false);

  const beginUpload = (kind: DeliveryPendingKind) => {
    uploadDepthRef.current += 1;
    setUploading({ kind, label: uploadLabel(kind) });
  };

  const endUpload = () => {
    uploadDepthRef.current = Math.max(0, uploadDepthRef.current - 1);
    if (uploadDepthRef.current === 0) setUploading(null);
  };

  const refreshPending = useCallback(async () => {
    if (!run) {
      setPendingUploads(0);
      setPendingKindsByStop({});
      return;
    }
    setPendingUploads(await pendingCountForRun(run.id));
    const stopIds = [...new Set((run.stops ?? []).map((s) => s.id))];
    const next: Record<number, DeliveryPendingKind[]> = {};
    await Promise.all(
      stopIds.map(async (stopId) => {
        const kinds = await pendingKindsForStop(run.id, stopId);
        if (kinds.length) next[stopId] = kinds;
      }),
    );
    setPendingKindsByStop(next);
  }, [run]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    if (!run || run.status === 'completed') return;
    const drain = async () => {
      if (drainingRef.current) return;
      drainingRef.current = true;
      let started = false;
      try {
        await drainDeliveryUploadQueue(run.id, async (blob, meta) => {
          if (!started) {
            beginUpload(meta.kind);
            started = true;
          } else {
            setUploading({ kind: meta.kind, label: uploadLabel(meta.kind) });
          }
          const form = new FormData();
          form.append('file', blob, `${meta.kind}.jpg`);
          form.append('kind', meta.kind);
          form.append('client_photo_id', meta.clientPhotoId);
          if (meta.stopId) form.append('stop_id', String(meta.stopId));
          if (meta.stopItemId) form.append('stop_item_id', String(meta.stopItemId));
          await mutations.upload.mutateAsync({ runId: run.id, form });
        });
        await refreshPending();
      } finally {
        if (started) endUpload();
        drainingRef.current = false;
      }
    };
    void drain();
    const onOnline = () => void drain();
    const onFocus = () => void drain();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void drain();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const markLocalPending = (stopId: number | undefined, kind: DeliveryPendingKind) => {
    if (stopId == null) return;
    setPendingKindsByStop((prev) => {
      const existing = prev[stopId] ?? [];
      if (existing.includes(kind)) return prev;
      return { ...prev, [stopId]: [...existing, kind] };
    });
  };

  const uploadPhoto = async (
    file: File,
    kind: DeliveryPendingKind,
    opts?: { stopId?: number; stopItemId?: number },
  ) => {
    if (!run) return;
    beginUpload(kind);
    try {
      const clientPhotoId = crypto.randomUUID();
      const blob = await compressImageToJpeg(file);
      await enqueueDeliveryPhoto({
        runId: run.id,
        stopId: opts?.stopId,
        stopItemId: opts?.stopItemId,
        clientPhotoId,
        kind,
        blob,
      });
      markLocalPending(opts?.stopId, kind);
      await refreshPending();
      try {
        const form = new FormData();
        form.append('file', blob, `${kind}.jpg`);
        form.append('kind', kind);
        form.append('client_photo_id', clientPhotoId);
        if (opts?.stopId) form.append('stop_id', String(opts.stopId));
        if (opts?.stopItemId) form.append('stop_item_id', String(opts.stopItemId));
        await mutations.upload.mutateAsync({ runId: run.id, form });
        await deleteQueuedDeliveryPhoto(run.id, clientPhotoId);
        await refreshPending();
        enqueueSnackbar('Photo uploaded', { variant: 'success' });
      } catch {
        enqueueSnackbar('Photo queued — will retry when online', { variant: 'warning' });
      }
    } finally {
      endUpload();
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingKindRef = useRef<{ kind: DeliveryPendingKind; stopId?: number; stopItemId?: number } | null>(
    null,
  );

  const pickPhoto = (kind: DeliveryPendingKind, opts?: { stopId?: number; stopItemId?: number }) => {
    pendingKindRef.current = { kind, ...opts };
    fileInputRef.current?.click();
  };

  const onFilePicked = async (file: File | null) => {
    if (!file || !pendingKindRef.current) return;
    const { kind, stopId, stopItemId } = pendingKindRef.current;
    pendingKindRef.current = null;
    await uploadPhoto(file, kind, { stopId, stopItemId });
  };

  /** Upload a pre-encoded blob (e.g. signature PNG) through the same outbox path. */
  const uploadBlob = async (
    blob: Blob,
    kind: DeliveryPendingKind,
    opts?: { stopId?: number; stopItemId?: number; filename?: string },
  ) => {
    if (!run) return;
    beginUpload(kind);
    try {
      const clientPhotoId = crypto.randomUUID();
      await enqueueDeliveryPhoto({
        runId: run.id,
        stopId: opts?.stopId,
        stopItemId: opts?.stopItemId,
        clientPhotoId,
        kind,
        blob,
      });
      markLocalPending(opts?.stopId, kind);
      await refreshPending();
      const filename = opts?.filename || `${kind}.png`;
      try {
        const form = new FormData();
        form.append('file', blob, filename);
        form.append('kind', kind);
        form.append('client_photo_id', clientPhotoId);
        if (opts?.stopId) form.append('stop_id', String(opts.stopId));
        if (opts?.stopItemId) form.append('stop_item_id', String(opts.stopItemId));
        await mutations.upload.mutateAsync({ runId: run.id, form });
        await deleteQueuedDeliveryPhoto(run.id, clientPhotoId);
        await refreshPending();
        enqueueSnackbar(kind === 'signature' ? 'Signature saved' : 'Uploaded', {
          variant: 'success',
        });
      } catch {
        enqueueSnackbar('Queued — will retry when online', { variant: 'warning' });
      }
    } finally {
      endUpload();
    }
  };

  return {
    pendingUploads,
    pendingKindsByStop,
    uploading,
    uploadPhoto,
    uploadBlob,
    pickPhoto,
    onFilePicked,
    fileInputRef,
    refreshPending,
  };
}
