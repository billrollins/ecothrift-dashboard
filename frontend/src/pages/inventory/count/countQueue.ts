import type { ScanPost, ScanResult, ScanResultKind } from '../../../api/stocktake.api';

/** One scan on the phone. `queued` and `sent` are waiting for the server's answer. */
export type ScanState = 'queued' | 'sent' | ScanResultKind;

export interface QueuedScan {
  clientId: string;
  seq: number;
  code: string;
  scannedAt: string;
  state: ScanState;
  title: string;
  price: string | null;
  location: string;
  itemStatus: string;
}

export interface Problem {
  scan: QueuedScan;
  /** How many scans ago it was, counting the newest scan as 0. */
  ago: number;
}

const STORE_MAX = 3000;

/** What a scanned code looks like: an Eco-Thrift tag (QR text or barcode) or a typed SKU. */
export function codeFromScan(raw: string): string {
  const text = (raw || '').trim();
  const itm = text.match(/ITM\d{4,}/i);
  if (itm) return itm[0].toUpperCase();
  try {
    const sku = new URL(text).searchParams.get('sku');
    if (sku?.trim()) return sku.trim().toUpperCase();
  } catch {
    // not a URL
  }
  return text.slice(0, 64).toUpperCase();
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The phone-side queue. A scan is recorded the instant it is read; the lookup happens afterwards,
 * in batches, so the person never waits. Anything not yet answered is re-sent until it is.
 */
export class CountQueue {
  scans: QueuedScan[] = [];
  private seq = 0;

  constructor(saved?: QueuedScan[]) {
    if (saved?.length) {
      this.scans = saved.map((s) => ({ ...s, state: s.state === 'sent' ? 'queued' : s.state }));
      this.seq = Math.max(...saved.map((s) => s.seq), 0);
    }
  }

  add(raw: string, now: Date = new Date()): QueuedScan {
    const scan: QueuedScan = {
      clientId: newId(),
      seq: ++this.seq,
      code: codeFromScan(raw),
      scannedAt: now.toISOString(),
      state: 'queued',
      title: '',
      price: null,
      location: '',
      itemStatus: '',
    };
    this.scans.push(scan);
    return scan;
  }

  get lastSeq(): number {
    return this.seq;
  }

  get waiting(): number {
    return this.scans.filter((s) => s.state === 'queued' || s.state === 'sent').length;
  }

  /** The next scans to send, oldest first. Marks them `sent`. */
  takeBatch(max = 100): ScanPost[] {
    const batch = this.scans.filter((s) => s.state === 'queued').slice(0, max);
    batch.forEach((s) => {
      s.state = 'sent';
    });
    return batch.map((s) => ({ client_id: s.clientId, code: s.code, seq: s.seq, scanned_at: s.scannedAt }));
  }

  /** The request failed: send them again next time. */
  requeue(clientIds: string[]): void {
    const ids = new Set(clientIds);
    this.scans.forEach((s) => {
      if (ids.has(s.clientId) && s.state === 'sent') s.state = 'queued';
    });
  }

  /** Apply the server's answers. Returns the scans that were answered, in order. */
  apply(results: ScanResult[]): QueuedScan[] {
    const byId = new Map(this.scans.map((s) => [s.clientId, s]));
    const done: QueuedScan[] = [];
    for (const r of results) {
      const s = byId.get(r.client_id);
      if (!s) continue;
      s.state = r.result;
      s.title = r.title;
      s.price = r.price;
      s.location = r.location;
      s.itemStatus = r.item_status;
      done.push(s);
    }
    return done;
  }

  /** Failures and warnings, newest first, with how many scans ago each was. */
  problems(): Problem[] {
    return this.scans
      .filter((s) => s.state === 'unknown' || s.state === 'odd' || s.state === 'already')
      .map((scan) => ({ scan, ago: this.seq - scan.seq }))
      .reverse();
  }

  ago(scan: QueuedScan): number {
    return this.seq - scan.seq;
  }

  /** Newest first. */
  recent(n = 12): QueuedScan[] {
    return this.scans.slice(-n).reverse();
  }

  /** For localStorage: capped, and answered scans keep only what the screen needs. */
  snapshot(): QueuedScan[] {
    return this.scans.slice(-STORE_MAX);
  }
}

/** "just now", "1 scan ago", "5 scans ago". */
export function agoText(n: number): string {
  if (n <= 0) return 'just now';
  return n === 1 ? '1 scan ago' : `${n} scans ago`;
}

/** Which sound a batch of answers should make: failure beats warning beats success. */
export function soundFor(answered: QueuedScan[]): 'fail' | 'warn' | 'ok' | null {
  if (!answered.length) return null;
  if (answered.some((s) => s.state === 'unknown')) return 'fail';
  if (answered.some((s) => s.state === 'odd' || s.state === 'already')) return 'warn';
  return 'ok';
}
