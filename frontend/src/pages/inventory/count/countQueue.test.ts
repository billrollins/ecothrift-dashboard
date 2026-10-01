import { describe, expect, it } from 'vitest';
import type { ScanResult } from '../../../api/stocktake.api';
import { CountQueue, agoText, codeFromScan, looksLikeCode, soundFor } from './countQueue';

const result = (clientId: string, code: string, kind: ScanResult['result'], issueId: number | null = null): ScanResult => ({
  id: Number(clientId.length) + 100,
  client_id: clientId,
  seq: 0,
  code,
  result: kind,
  item_status: kind === 'odd' ? 'sold' : 'on_shelf',
  title: kind === 'unknown' ? '' : 'Lamp',
  price: kind === 'unknown' ? null : '9.00',
  retail: null,
  location: '',
  scanned_at: '2026-10-01T15:00:00Z',
  removed: false,
  issue_id: issueId,
  issue_kind: issueId ? 'not_recognized' : '',
  issue_action: issueId ? 'pending' : '',
  first_seen: null,
});

describe('codeFromScan', () => {
  it('reads the SKU out of a tag payload, a link or a typed code', () => {
    expect(codeFromScan('  itm0001234 ')).toBe('ITM0001234');
    expect(codeFromScan('https://shop.example/x?sku=itm0000077')).toBe('ITM0000077');
    expect(codeFromScan('abc123')).toBe('ABC123');
  });

  it('tells a code from words to search for', () => {
    expect(looksLikeCode('ITM0001234')).toBe(true);
    expect(looksLikeCode('012345678905')).toBe(true);
    expect(looksLikeCode('blue lamp')).toBe(false);
    expect(looksLikeCode('lamp')).toBe(false);
    expect(looksLikeCode('lamp 2')).toBe(false);
  });
});

describe('CountQueue', () => {
  it('records scans instantly and numbers them', () => {
    const q = new CountQueue();
    const a = q.add('ITM0000001');
    const b = q.add('ITM0000002');
    expect([a.seq, b.seq]).toEqual([1, 2]);
    expect(q.waiting).toBe(2);
  });

  it('sends oldest first, marks them sent, and requeues on failure', () => {
    const q = new CountQueue();
    q.add('ITM0000001');
    q.add('ITM0000002');
    const batch = q.takeBatch(1);
    expect(batch.map((b) => b.code)).toEqual(['ITM0000001']);
    expect(q.takeBatch().map((b) => b.code)).toEqual(['ITM0000002']);
    q.requeue(batch.map((b) => b.client_id));
    expect(q.takeBatch().map((b) => b.code)).toEqual(['ITM0000001']);
  });

  it('applies answers and reports problems with rows-ago', () => {
    const q = new CountQueue();
    const a = q.add('ITM0000001');
    const bad = q.add('NOPE');
    q.add('ITM0000003');
    q.add('ITM0000004');
    const sent = q.takeBatch();
    q.apply([
      result(a.clientId, 'ITM0000001', 'ok'),
      result(bad.clientId, 'NOPE', 'unknown', 7),
      result(sent[2].client_id, 'ITM0000003', 'ok'),
      result(sent[3].client_id, 'ITM0000004', 'ok'),
    ]);
    const problems = q.problems();
    expect(problems).toHaveLength(1);
    expect(problems[0].scan.code).toBe('NOPE');
    expect(problems[0].ago).toBe(2);
    expect(q.waiting).toBe(0);
    // answering the problem takes it off the list
    q.answer(7, 'pr_cart');
    expect(q.problems()).toHaveLength(0);
    expect(bad.issueAction).toBe('pr_cart');
  });

  it('removes a scan, puts it back, and forgets one the server never saw', () => {
    const q = new CountQueue();
    const a = q.add('ITM0000001');
    const b = q.add('ITM0000002');
    q.takeBatch(1);
    q.apply([result(a.clientId, 'ITM0000001', 'unknown', 9)]);
    q.setRemoved(a.clientId, true);
    expect([q.kept, q.problems().length]).toEqual([1, 0]);
    q.setRemoved(a.clientId, false);
    expect(q.kept).toBe(2);
    q.drop(b.clientId);
    expect(q.scans.map((s) => s.code)).toEqual(['ITM0000001']);
  });

  it('restores from storage and resends anything that was in flight', () => {
    const q = new CountQueue();
    q.add('ITM0000001');
    q.takeBatch();
    const restored = new CountQueue(q.snapshot());
    expect(restored.waiting).toBe(1);
    expect(restored.takeBatch()).toHaveLength(1);
    expect(restored.add('ITM0000002').seq).toBe(2);
  });
});

describe('agoText and soundFor', () => {
  it('words rows ago', () => {
    expect(agoText(0)).toBe('just now');
    expect(agoText(1)).toBe('1 scan ago');
    expect(agoText(7)).toBe('7 scans ago');
  });

  it('picks failure over warning over success', () => {
    const q = new CountQueue();
    const ids = ['a', 'b', 'c'].map((c) => q.add(c));
    q.takeBatch();
    const done = q.apply([
      result(ids[0].clientId, 'A', 'ok'),
      result(ids[1].clientId, 'B', 'already'),
      result(ids[2].clientId, 'C', 'unknown'),
    ]);
    expect(soundFor(done)).toBe('fail');
    expect(soundFor(done.slice(0, 2))).toBe('warn');
    expect(soundFor(done.slice(0, 1))).toBe('ok');
    expect(soundFor([])).toBeNull();
  });
});
