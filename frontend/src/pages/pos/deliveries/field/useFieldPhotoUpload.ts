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
  type DeliveryPendingKind,
} from '../../../../services/delivery/deliveryMediaClient';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;

export function useFieldPhotoUpload(run: DeliveryRun | null | undefined, mutations: Mutations) {
  const { enqueueSnackbar } = useSnackbar();
  const [pendingUploads, setPendingUploads] = useState(0);

  const refreshPending = useCallback(async () => {
    if (!run) {
      setPendingUploads(0);
      return;
    }
    setPendingUploads(await pendingCountForRun(run.id));
  }, [run]);

  useEffect(() => {
    void refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    if (!run || run.status === 'completed') return;
    const drain = async () => {
      await drainDeliveryUploadQueue(run.id, async (blob, meta) => {
        const form = new FormData();
        form.append('file', blob, `${meta.kind}.jpg`);
        form.append('kind', meta.kind);
        form.append('client_photo_id', meta.clientPhotoId);
        if (meta.stopId) form.append('stop_id', String(meta.stopId));
        if (meta.stopItemId) form.append('stop_item_id', String(meta.stopItemId));
        await mutations.upload.mutateAsync({ runId: run.id, form });
      });
      await refreshPending();
    };
    void drain();
    const onOnline = () => void drain();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [run?.id, run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadPhoto = async (
    file: File,
    kind: DeliveryPendingKind,
    opts?: { stopId?: number; stopItemId?: number },
  ) => {
    if (!run) return;
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

  return { pendingUploads, uploadPhoto, pickPhoto, onFilePicked, fileInputRef, refreshPending };
}
