/**
 * Mandatory client-side JPEG compression + IndexedDB outbox + upload drain (Receiving v1).
 */

const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_QUALITY = 0.8;
const PARALLEL_UPLOADS = 4;
const DB_NAME = 'ecothrift-receiving-v1';
const STORE_QUEUE = 'photoQueue';
const STORE_META = 'sessionMeta';

export const PALLET_SIDES = ['front', 'right', 'back', 'left'] as const;

export type PendingPhotoKind = 'bol' | 'truck' | 'pallet_side';

export interface PendingPhotoRecord {
  id: string;
  orderId: number;
  createdAt: number;
  clientPhotoId: string;
  kind: PendingPhotoKind;
  palletNumber?: number;
  side?: string;
  /** Compressed JPEG blob */
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
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function queuePut(rec: PendingPhotoRecord): Promise<void> {
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

async function queueGetAll(): Promise<PendingPhotoRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_QUEUE], 'readonly');
    const r = t.objectStore(STORE_QUEUE).getAll();
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      db.close();
      resolve((r.result ?? []) as PendingPhotoRecord[]);
    };
  });
}

export async function saveWizardStep(orderId: number, step: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_META], 'readwrite');
    t.objectStore(STORE_META).put(step, `wizardStep:${orderId}`);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => reject(t.error);
  });
}

export async function loadWizardStep(orderId: number): Promise<number | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction([STORE_META], 'readonly');
    const r = t.objectStore(STORE_META).get(`wizardStep:${orderId}`);
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      db.close();
      const v = r.result as number | undefined;
      resolve(v === undefined ? null : v);
    };
  });
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode_failed'));
    };
    img.src = url;
  });
}

/** Resize longest edge ~maxEdge, JPEG quality ~0.8 (runs before IndexedDB upload). */
export async function compressImageToJpeg(
  input: Blob | File,
  maxEdge = DEFAULT_MAX_EDGE,
  quality = DEFAULT_QUALITY,
): Promise<Blob> {
  const img = await loadImage(input);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const longest = Math.max(w, h);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  const nw = Math.max(1, Math.round(w * scale));
  const nh = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  ctx.drawImage(img, 0, 0, nw, nh);

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

export async function enqueuePendingPhoto(params: Omit<PendingPhotoRecord, 'id' | 'createdAt'>): Promise<void> {
  const rec: PendingPhotoRecord = {
    ...params,
    id: `${params.orderId}:${params.clientPhotoId}`,
    createdAt: Date.now(),
  };
  await queuePut(rec);
}

export async function pendingCountForOrder(orderId: number): Promise<number> {
  const rows = await queueGetAll();
  return rows.filter((r) => r.orderId === orderId).length;
}

export type UploadFn = (
  blob: Blob,
  meta: { clientPhotoId: string; kind: PendingPhotoKind; palletNumber?: number; side?: string },
) => Promise<void>;

export async function drainPhotoUploadQueue(orderId: number, uploadFn: UploadFn): Promise<void> {
  const rows = (await queueGetAll()).filter((r) => r.orderId === orderId);
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
          palletNumber: rec.palletNumber,
          side: rec.side,
        });
        await queueDelete(rec.id);
      } catch {
        /* Leave in queue for next drain */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, rows.length) }, () => worker()));
}
