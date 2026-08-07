import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteQueuedDeliveryPhoto,
  drainDeliveryUploadQueue,
  enqueueDeliveryPhoto,
  pendingCountForRun,
} from './deliveryMediaClient';

type StoreRecord = Record<string, unknown> & { id: string };

type StoreMap = Map<string, StoreRecord>;
type DatabaseMap = Map<string, StoreMap>;

/** Minimal in-memory IndexedDB for delivery outbox tests. */
function installMemoryIndexedDb() {
  const databases = new Map<string, DatabaseMap>();

  class MemoryRequest<T> {
    result: T | undefined;
    error: DOMException | null = null;
    onsuccess: ((ev: Event) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    onupgradeneeded: ((ev: IDBVersionChangeEvent) => void) | null = null;

    succeed(value: T) {
      this.result = value;
      queueMicrotask(() => this.onsuccess?.(new Event('success')));
    }

    fail(error: DOMException) {
      this.error = error;
      queueMicrotask(() => this.onerror?.(new Event('error')));
    }
  }

  class MemoryObjectStore {
    constructor(private readonly store: StoreMap) {}

    put(rec: StoreRecord) {
      const req = new MemoryRequest<string>();
      this.store.set(String(rec.id), { ...rec });
      req.succeed(String(rec.id));
      return req as unknown as IDBRequest;
    }

    delete(id: IDBValidKey) {
      const req = new MemoryRequest<undefined>();
      this.store.delete(String(id));
      req.succeed(undefined);
      return req as unknown as IDBRequest;
    }

    getAll() {
      const req = new MemoryRequest<StoreRecord[]>();
      req.succeed([...this.store.values()]);
      return req as unknown as IDBRequest;
    }
  }

  class MemoryTransaction {
    oncomplete: ((ev: Event) => void) | null = null;
    onerror: ((ev: Event) => void) | null = null;
    error: DOMException | null = null;

    constructor(private readonly store: StoreMap) {
      queueMicrotask(() => this.oncomplete?.(new Event('complete')));
    }

    objectStore() {
      return new MemoryObjectStore(this.store);
    }
  }

  function ensureStore(dbName: string, storeName: string): StoreMap {
    let dbStores = databases.get(dbName);
    if (!dbStores) {
      dbStores = new Map<string, StoreMap>();
      databases.set(dbName, dbStores);
    }
    let store = dbStores.get(storeName);
    if (!store) {
      store = new Map<string, StoreRecord>();
      dbStores.set(storeName, store);
    }
    return store;
  }

  class MemoryDatabase {
    objectStoreNames = {
      contains: (name: string) => databases.get(this.name)?.has(name) ?? false,
    };

    constructor(readonly name: string) {}

    createObjectStore(name: string) {
      return new MemoryObjectStore(ensureStore(this.name, name));
    }

    transaction(storeNames: string | string[]) {
      const name = Array.isArray(storeNames) ? storeNames[0] : storeNames;
      return new MemoryTransaction(ensureStore(this.name, name));
    }

    close() {
      /* no-op */
    }
  }

  const open = (name: string, _version?: number) => {
    const req = new MemoryRequest<MemoryDatabase>();
    const existed = databases.has(name);
    if (!existed) databases.set(name, new Map<string, StoreMap>());
    const db = new MemoryDatabase(name);
    queueMicrotask(() => {
      if (!existed) {
        req.result = db;
        req.onupgradeneeded?.(
          { target: req, oldVersion: 0, newVersion: 1 } as unknown as IDBVersionChangeEvent,
        );
      }
      req.succeed(db);
    });
    return req as unknown as IDBOpenDBRequest;
  };

  const previous = globalThis.indexedDB;
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: { open },
  });

  return {
    reset() {
      databases.clear();
    },
    restore() {
      Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: previous,
      });
    },
  };
}

describe('deliveryMediaClient outbox', () => {
  const memory = installMemoryIndexedDb();
  const blob = new Blob(['photo'], { type: 'image/jpeg' });

  beforeEach(() => {
    memory.reset();
  });

  afterEach(() => {
    memory.reset();
  });

  it('clears the queue after a successful drain so pendingCount returns 0', async () => {
    await enqueueDeliveryPhoto({
      runId: 20,
      clientPhotoId: 'proof-1',
      kind: 'delivery_proof',
      blob,
      stopId: 40,
    });
    expect(await pendingCountForRun(20)).toBe(1);

    const uploadFn = vi.fn<
      (
        blob: Blob,
        meta: {
          clientPhotoId: string;
          kind: 'truck' | 'load_item' | 'delivery_proof' | 'signature' | 'issue';
          stopId?: number;
          stopItemId?: number;
        },
      ) => Promise<void>
    >(async () => undefined);
    await drainDeliveryUploadQueue(20, uploadFn);

    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(uploadFn.mock.calls[0]?.[1]).toMatchObject({
      clientPhotoId: 'proof-1',
      kind: 'delivery_proof',
      stopId: 40,
    });
    expect(await pendingCountForRun(20)).toBe(0);
  });

  it('leaves a failed upload queued and retries it on the next drain', async () => {
    await enqueueDeliveryPhoto({
      runId: 20,
      clientPhotoId: 'proof-fail',
      kind: 'delivery_proof',
      blob,
    });

    const failing = vi.fn(async () => {
      throw new Error('network');
    });
    await drainDeliveryUploadQueue(20, failing);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(await pendingCountForRun(20)).toBe(1);

    const succeeding = vi.fn(async () => undefined);
    await drainDeliveryUploadQueue(20, succeeding);
    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(await pendingCountForRun(20)).toBe(0);
  });

  it('treats the same client_photo_id as one queue row (idempotent enqueue)', async () => {
    await enqueueDeliveryPhoto({
      runId: 20,
      clientPhotoId: 'same-id',
      kind: 'delivery_proof',
      blob,
    });
    await enqueueDeliveryPhoto({
      runId: 20,
      clientPhotoId: 'same-id',
      kind: 'delivery_proof',
      blob,
    });
    expect(await pendingCountForRun(20)).toBe(1);

    await deleteQueuedDeliveryPhoto(20, 'same-id');
    expect(await pendingCountForRun(20)).toBe(0);

    // Re-enqueue after direct-upload clear, then drain once - still a single upload.
    await enqueueDeliveryPhoto({
      runId: 20,
      clientPhotoId: 'same-id',
      kind: 'signature',
      blob,
    });
    const uploadFn = vi.fn(async () => undefined);
    await drainDeliveryUploadQueue(20, uploadFn);
    expect(uploadFn).toHaveBeenCalledTimes(1);
    expect(await pendingCountForRun(20)).toBe(0);
  });
});
