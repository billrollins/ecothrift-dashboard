/**
 * Delivery wizard photo/signature compression + IndexedDB outbox.
 */

import { compressImageToJpeg } from '../receiving/receivingClient';

const DB_NAME = 'ecothrift-delivery-v1';
const STORE_QUEUE = 'photoQueue';
const PARALLEL_UPLOADS = 3;

export type DeliveryPendingKind = 'truck' | 'delivery_proof' | 'signature' | 'issue';

export interface DeliveryPendingPhoto {
  id: string;
  runId: number;
  stopId?: number;
  createdAt: number;
  clientPhotoId: string;
  kind: DeliveryPendingKind;
  blob: Blob;
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error ?? new Error('idb'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function queuePut(rec: DeliveryPendingPhoto): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_QUEUE], 'readwrite');
    t.objectStore(STORE_QUEUE).put(rec);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error ?? new Error('idb_put'));
  });
}

async function queueDelete(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_QUEUE], 'readwrite');
    t.objectStore(STORE_QUEUE).delete(id);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error ?? new Error('idb_del'));
  });
}

async function queueGetAll(): Promise<DeliveryPendingPhoto[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_QUEUE], 'readonly');
    const r = t.objectStore(STORE_QUEUE).getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      db.close();
      resolve((r.result ?? []) as DeliveryPendingPhoto[]);
    };
  });
}

export { compressImageToJpeg };

export async function enqueueDeliveryPhoto(
  params: Omit<DeliveryPendingPhoto, 'id' | 'createdAt'>,
): Promise<void> {
  const rec: DeliveryPendingPhoto = {
    ...params,
    id: `${params.runId}:${params.clientPhotoId}`,
    createdAt: Date.now(),
  };
  await queuePut(rec);
}

export async function pendingCountForRun(runId: number): Promise<number> {
  const rows = await queueGetAll();
  return rows.filter((r) => r.runId === runId).length;
}

export type DeliveryUploadFn = (
  blob: Blob,
  meta: { clientPhotoId: string; kind: DeliveryPendingKind; stopId?: number },
) => Promise<void>;

export async function drainDeliveryUploadQueue(
  runId: number,
  uploadFn: DeliveryUploadFn,
): Promise<void> {
  const rows = (await queueGetAll()).filter((r) => r.runId === runId);
  rows.sort((a, b) => a.createdAt - b.createdAt);
  if (!rows.length) return;
  let next = 0;
  async function worker(): Promise<void> {
    while (next < rows.length) {
      const i = next++;
      const rec = rows[i];
      try {
        await uploadFn(rec.blob, {
          clientPhotoId: rec.clientPhotoId,
          kind: rec.kind,
          stopId: rec.stopId,
        });
        await queueDelete(rec.id);
      } catch {
        /* leave queued */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, rows.length) }, () => worker()));
}

export async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('encode_failed'));
        else resolve(b);
      },
      'image/jpeg',
      quality,
    );
  });
}
