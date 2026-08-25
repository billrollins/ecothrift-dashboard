import { describe, expect, it, vi } from 'vitest';
import type { RestorationJobDTO } from '../../types/inventory.types';
import {
  decideBenchScan,
  isOccupiedBenchError,
  resolveRestorationScan,
  shouldPickupOnScan,
} from './restorationScanFind';

function job(overrides: Partial<RestorationJobDTO> = {}): RestorationJobDTO {
  return {
    id: 11,
    stage: 'queued',
    sku: 'ET-11',
    name: 'Lamp',
    items: [{ id: 1, sku: 'ET-11', status: 'in_stock', condition: '', location: '' }],
    ...overrides,
  } as RestorationJobDTO;
}

describe('resolveRestorationScan', () => {
  it('uses a local restoration job and never asks lookup', async () => {
    const lookup = vi.fn();
    const result = await resolveRestorationScan('et-11', [job()], lookup);
    expect(result).toEqual({ kind: 'job', job: expect.objectContaining({ id: 11 }) });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('finds a catalog item when there is no restoration job', async () => {
    const item = { id: 9, sku: 'SHELF-1', name: 'Radio', location: 'A3', status: 'in_stock', condition: '' };
    const lookup = vi.fn().mockResolvedValue({ found: 'item', item });
    const result = await resolveRestorationScan('SHELF-1', [], lookup);
    expect(result).toEqual({ kind: 'item', item });
  });

  it('says none when lookup finds nothing', async () => {
    const lookup = vi.fn().mockResolvedValue({ found: 'none' });
    const result = await resolveRestorationScan('NOPE', [], lookup);
    expect(result).toEqual({ kind: 'none', query: 'NOPE' });
  });
});

describe('shouldPickupOnScan', () => {
  it('picks up a queue item when the bench is empty', () => {
    expect(shouldPickupOnScan(job({ stage: 'queued' }), true)).toBe(true);
    expect(shouldPickupOnScan(job({ stage: 'sent' }), true)).toBe(true);
  });

  it('does not pick up when the bench already has work', () => {
    expect(shouldPickupOnScan(job({ stage: 'queued' }), false)).toBe(false);
  });

  it('does not pick up holding or done items', () => {
    expect(shouldPickupOnScan(job({ stage: 'pending' }), true)).toBe(false);
    expect(shouldPickupOnScan(job({ stage: 'done' }), true)).toBe(false);
    expect(shouldPickupOnScan(job({ stage: 'bench' }), true)).toBe(false);
  });
});

describe('decideBenchScan', () => {
  it('picks up a queued item when the bench is empty', () => {
    const queued = job({ id: 11, stage: 'queued', sku: 'ET-11' });
    expect(decideBenchScan('ET-11', null, [queued])).toEqual({ action: 'pickup', job: queued });
  });

  it('stays on the bench when the scan is already yours', () => {
    const mine = job({
      id: 4,
      stage: 'bench',
      sku: 'ET-4',
      items: [{ id: 4, sku: 'ET-4', status: 'in_stock', condition: '', location: '' }],
    });
    expect(decideBenchScan('ET-4', mine, [mine])).toEqual({ action: 'stay', job: mine });
  });

  it('opens someone else\'s bench item instead of sending it to Overview', () => {
    const mine = job({
      id: 4,
      stage: 'bench',
      sku: 'ET-4',
      items: [{ id: 4, sku: 'ET-4', status: 'in_stock', condition: '', location: '' }],
    });
    const theirs = job({
      id: 8,
      stage: 'bench',
      sku: 'ET-8',
      bench_owner_id: 99,
      items: [{ id: 8, sku: 'ET-8', status: 'in_stock', condition: '', location: '' }],
    });
    expect(decideBenchScan('ET-8', mine, [mine, theirs])).toEqual({ action: 'stay', job: theirs });
  });

  it('sends any other restoration job to Overview instead of check-in', () => {
    const mine = job({
      id: 4,
      stage: 'bench',
      sku: 'ET-4',
      items: [{ id: 4, sku: 'ET-4', status: 'in_stock', condition: '', location: '' }],
    });
    const queued = job({ id: 11, stage: 'queued', sku: 'ET-11' });
    expect(decideBenchScan('ET-11', mine, [mine, queued])).toEqual({
      action: 'overview',
      jobId: 11,
    });
  });

  it('looks up when the SKU is not in the loaded jobs', () => {
    const mine = job({
      id: 4,
      stage: 'bench',
      sku: 'ET-4',
      items: [{ id: 4, sku: 'ET-4', status: 'in_stock', condition: '', location: '' }],
    });
    expect(decideBenchScan('SHELF-1', mine, [mine])).toEqual({
      action: 'lookup',
      query: 'SHELF-1',
    });
  });
});

describe('isOccupiedBenchError', () => {
  it('treats a 409 as an occupied bench', () => {
    expect(isOccupiedBenchError({ response: { status: 409 } })).toBe(true);
    expect(isOccupiedBenchError({ response: { status: 400 } })).toBe(false);
    expect(isOccupiedBenchError(new Error('busy'))).toBe(false);
  });
});
