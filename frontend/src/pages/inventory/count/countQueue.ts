import type { IssueAction, IssueKind, ScanPost, ScanResult, ScanResultKind } from '../../../api/stocktake.api';

/** One scan on the phone. `queued` and `sent` are waiting for the server's answer. */
export type ScanState = 'queued' | 'sent' | ScanResultKind;

export interface QueuedScan {
  clientId: string;
  /** The server's id for the scan, once it has answered. Needed to remove the scan or report a problem on it. */
  serverId: number | null;
  seq: number;
  code: string;
  scannedAt: string;
  state: ScanState;
  title: string;
  price: string | null;
  location: string;
  itemStatus: string;
  removed: boolean;
  issueId: number | null;
  issueKind: IssueKind | '';
  issueAction: IssueAction | '';
  firstSeen: { section: string; by: string; at: string } | null;
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

/**
 * Enter was pressed in the scan box: is this a code to count, or words to search for?
 * A code has no spaces and has a digit in it ("ITM0001234", a UPC, a link). "blue lamp" is a search.
 */
export function looksLikeCode(raw: string): boolean {
  const text = (raw || '').trim();
  return text.length >= 3 && !/\s/.test(text) && /\d/.test(text);
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The phone-side queue for one run. A scan is recorded the instant it is read; the lookup happens
 * afterwards, in batches, so the person never waits. Anything not yet answered is re-sent until it is.
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
      serverId: null,
      seq: ++this.seq,
      code: codeFromScan(raw),
      scannedAt: now.toISOString(),
      state: 'queued',
      title: '',
      price: null,
      location: '',
      itemStatus: '',
      removed: false,
      issueId: null,
      issueKind: '',
      issueAction: '',
      firstSeen: null,
    };
    this.scans.push(scan);
    return scan;
  }

  get lastSeq(): number {
    return this.seq;
  }

  /** Scans in this run that still count (not removed). */
  get kept(): number {
    return this.scans.filter((s) => !s.removed).length;
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
      s.serverId = r.id;
      s.state = r.result;
      s.title = r.title;
      s.price = r.price;
      s.location = r.location;
      s.itemStatus = r.item_status;
      s.removed = r.removed;
      s.issueId = r.issue_id;
      s.issueKind = r.issue_kind;
      s.issueAction = r.issue_action;
      s.firstSeen = r.first_seen;
      done.push(s);
    }
    return done;
  }

  find(clientId: string): QueuedScan | undefined {
    return this.scans.find((s) => s.clientId === clientId);
  }

  /** A scan the server never saw (still waiting to send) is simply forgotten. */
  drop(clientId: string): void {
    this.scans = this.scans.filter((s) => s.clientId !== clientId);
  }

  setRemoved(clientId: string, removed: boolean): void {
    const s = this.find(clientId);
    if (!s) return;
    s.removed = removed;
    if (removed && s.issueAction === 'pending') s.issueAction = 'cleared';
  }

  /** Record a problem (or its answer) on a scan. */
  setIssue(clientId: string, issueId: number, kind: IssueKind, action: IssueAction): void {
    const s = this.find(clientId);
    if (!s) return;
    s.issueId = issueId;
    s.issueKind = kind;
    s.issueAction = action;
  }

  answer(issueId: number, action: IssueAction): void {
    this.scans.forEach((s) => {
      if (s.issueId === issueId) s.issueAction = action;
    });
  }

  /** Scans whose problem still needs an answer, newest first, with how many scans ago each was. */
  problems(): Problem[] {
    return this.scans
      .filter((s) => !s.removed && s.issueId != null && s.issueAction === 'pending')
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

  /** For localStorage: capped. */
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
  if (answered.some((s) => s.state === 'unknown' || s.state === 'bad_format')) return 'fail';
  if (answered.some((s) => s.state === 'odd' || s.state === 'already')) return 'warn';
  return 'ok';
}
