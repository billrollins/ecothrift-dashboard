import { describe, expect, it } from 'vitest';
import type { ScanResult } from '../../../api/stocktake.api';
import { CountQueue, agoText, codeFromScan, soundFor } from './countQueue';

const result = (clientId: string, code: string, kind: ScanResult['result']): ScanResult => ({
  client_id: clientId,
  code,
  result: kind,
  item_status: kind === 'odd' ? 'sold' : 'on_shelf',
  title: kind === 'unknown' ? '' : 'Lamp',
  price: kind === 'unknown' ? null : '9.00',
  location: '',
});

describe('codeFromScan', () => {
  it('reads the SKU out of a tag payload, a link or a typed code', () => {
    expect(codeFromScan('  itm0001234 ')).toBe('ITM0001234');
    expect(codeFromScan('https://shop.example/x?sku=itm0000077')).toBe('ITM0000077');
    expect(codeFromScan('abc123')).toBe('ABC123');
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
      result(bad.clientId, 'NOPE', 'unknown'),
      result(sent[2].client_id, 'ITM0000003', 'ok'),
      result(sent[3].client_id, 'ITM0000004', 'ok'),
    ]);
    const problems = q.problems();
    expect(problems).toHaveLength(1);
    expect(problems[0].scan.code).toBe('NOPE');
    expect(problems[0].ago).toBe(2);
    expect(q.waiting).toBe(0);
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
