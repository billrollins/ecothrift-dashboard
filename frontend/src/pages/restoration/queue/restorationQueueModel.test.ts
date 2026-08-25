import { describe, expect, it } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import {
  DESTINATION_IDS,
  QUEUE_LISTS,
  DEFAULT_QUEUE_SORT,
  destinationLabel,
  destinationPaint,
  dollarsToRetailPercent,
  jobRetail,
  retailPercentToDollars,
  formatWaiting,
  hoursWaiting,
  isReadyForBench,
  isStale,
  itemKindLine,
  benchOwnerGivenName,
  benchOwnerLine,
  missingGrades,
  nextQueueSort,
  queueListAccent,
  queueListForStage,
  sortQueue,
  valuePotential,
  benchDispositionLabel,
  type QueueListId,
} from './restorationQueueModel';

const NOW = new Date('2026-08-12T12:00:00Z');

function job(overrides: Partial<RestorationJobDTO> = {}): RestorationJobDTO {
  return {
    id: 1,
    scale: 'Functional',
    grade_values: { Working: 20, Repairable: 12, 'Parts-only': 5 },
    created_at: '2026-08-12T11:00:00Z',
    sent_at: null,
    brand: 'Microsoft',
    category: 'Controllers',
    processing_handoff: null,
    ...overrides,
  } as RestorationJobDTO;
}

describe('valuePotential', () => {
  it('is the spread between the best and worst grade', () => {
    expect(valuePotential(job())).toBe(15);
  });

  it('is unknown when only one grade is priced', () => {
    expect(valuePotential(job({ grade_values: { Working: 20 } }))).toBeNull();
  });

  it('is unknown when nothing is priced', () => {
    expect(valuePotential(job({ grade_values: {} }))).toBeNull();
  });

  it('ignores values that are not numbers', () => {
    const values = { Working: 20, Repairable: null, 'Parts-only': 5 } as unknown as Record<string, number>;
    expect(valuePotential(job({ grade_values: values }))).toBe(15);
  });

  it('is zero when every grade is worth the same', () => {
    expect(valuePotential(job({ grade_values: { A: 10, B: 10 } }))).toBe(0);
  });
});

describe('missingGrades and readiness', () => {
  const scale = ['Working', 'Repairable', 'Parts-only'];

  it('finds nothing missing on a fully priced item', () => {
    expect(missingGrades(job(), scale)).toEqual([]);
    expect(isReadyForBench(job(), scale)).toBe(true);
  });

  it('names the grades still without a price', () => {
    const partial = job({ grade_values: { Working: 20 } });
    expect(missingGrades(partial, scale)).toEqual(['Repairable', 'Parts-only']);
    expect(isReadyForBench(partial, scale)).toBe(false);
  });

  it('treats zero as a real price, not a blank', () => {
    const withZero = job({ grade_values: { Working: 20, Repairable: 0, 'Parts-only': 5 } });
    expect(missingGrades(withZero, scale)).toEqual([]);
    expect(isReadyForBench(withZero, scale)).toBe(true);
  });

  it('still treats a missing key as unpriced when a sibling is zero', () => {
    const partialZero = job({ grade_values: { Working: 20, Repairable: 0 } });
    expect(missingGrades(partialZero, scale)).toEqual(['Parts-only']);
  });

  it('is not ready without a scale at all', () => {
    expect(isReadyForBench(job({ scale: '' }), scale)).toBe(false);
  });

  it('falls back to whatever grades are recorded when the scale is unknown', () => {
    expect(missingGrades(job(), [])).toEqual([]);
  });
});

describe('waiting time', () => {
  it('counts from when the item was sent, not when it was created', () => {
    const sent = job({ created_at: '2026-08-01T12:00:00Z', sent_at: '2026-08-11T12:00:00Z' });
    expect(hoursWaiting(sent, NOW)).toBe(24);
  });

  it('falls back to creation for items never sent', () => {
    expect(hoursWaiting(job(), NOW)).toBe(1);
  });

  it('reads as hours below a day and days above it', () => {
    expect(formatWaiting(job({ created_at: '2026-08-12T11:59:00Z' }), NOW)).toBe('just in');
    expect(formatWaiting(job({ created_at: '2026-08-12T07:00:00Z' }), NOW)).toBe('5h');
    expect(formatWaiting(job({ created_at: '2026-08-09T12:00:00Z' }), NOW)).toBe('3d');
  });

  it('never reports negative waiting for a clock that is slightly ahead', () => {
    expect(hoursWaiting(job({ created_at: '2026-08-12T12:05:00Z' }), NOW)).toBe(0);
  });

  it('flags anything sitting three days or more', () => {
    expect(isStale(job({ created_at: '2026-08-09T12:00:00Z' }), NOW)).toBe(true);
    expect(isStale(job({ created_at: '2026-08-11T12:00:00Z' }), NOW)).toBe(false);
  });

  it('counts done items from when they were finished', () => {
    const done = job({
      stage: 'done',
      created_at: '2026-08-01T12:00:00Z',
      sent_at: '2026-08-02T12:00:00Z',
      dispositioned_at: '2026-08-12T06:00:00Z',
    });
    expect(hoursWaiting(done, NOW)).toBe(6);
  });

  it('survives an unparseable date', () => {
    expect(hoursWaiting(job({ created_at: 'not a date' }), NOW)).toBeNull();
    expect(formatWaiting(job({ created_at: 'not a date' }), NOW)).toBe('—');
  });
});

describe('sortQueue', () => {
  const scales = { Functional: ['Working', 'Repairable', 'Parts-only'] };

  it('defaults to oldest at the top, even when a newer item is worth more', () => {
    const newer = job({
      id: 1,
      created_at: '2026-08-12T11:00:00Z',
      grade_values: { Working: 90, 'Parts-only': 5 },
    });
    const older = job({
      id: 2,
      created_at: '2026-08-01T11:00:00Z',
      grade_values: { Working: 12, 'Parts-only': 10 },
    });
    expect(sortQueue([newer, older], scales).map((j) => j.id)).toEqual([2, 1]);
  });

  it('defaults to oldest at the top, even when a newer item still needs prices', () => {
    const ready = job({ id: 1, created_at: '2026-08-12T11:00:00Z' });
    const needsGrades = job({
      id: 2,
      created_at: '2026-08-01T11:00:00Z',
      grade_values: { Working: 20 },
    });
    expect(sortQueue([ready, needsGrades], scales).map((j) => j.id)).toEqual([2, 1]);
  });

  it('flips to newest first when Waiting is reversed', () => {
    const newer = job({ id: 1, created_at: '2026-08-12T11:00:00Z' });
    const older = job({ id: 2, created_at: '2026-08-01T11:00:00Z' });
    expect(sortQueue([newer, older], scales, { field: 'waiting', dir: 'asc' }).map((j) => j.id)).toEqual([
      1, 2,
    ]);
  });

  it('sorts At stake high-to-low, then oldest first when the spread is equal', () => {
    const small = job({ id: 1, created_at: '2026-08-01T11:00:00Z', grade_values: { Working: 12, 'Parts-only': 10 } });
    const largeOlder = job({
      id: 2,
      created_at: '2026-08-01T10:00:00Z',
      grade_values: { Working: 90, 'Parts-only': 5 },
    });
    const largeNewer = job({
      id: 3,
      created_at: '2026-08-12T11:00:00Z',
      grade_values: { Working: 90, 'Parts-only': 5 },
    });
    expect(sortQueue([small, largeNewer, largeOlder], scales, { field: 'stake', dir: 'desc' }).map((j) => j.id)).toEqual(
      [2, 3, 1],
    );
  });

  it('sorts Item A-to-Z by SKU', () => {
    const zebra = job({ id: 1, sku: 'Z-9', created_at: '2026-08-01T11:00:00Z' });
    const apple = job({ id: 2, sku: 'A-1', created_at: '2026-08-12T11:00:00Z' });
    expect(sortQueue([zebra, apple], scales, { field: 'item', dir: 'asc' }).map((j) => j.id)).toEqual([2, 1]);
  });

  it('keeps blank notes under notes that have something to say', () => {
    const blank = job({ id: 1, queue_note: '', created_at: '2026-08-01T11:00:00Z' });
    const written = job({ id: 2, queue_note: 'hinge', created_at: '2026-08-12T11:00:00Z' });
    expect(sortQueue([blank, written], scales, { field: 'note', dir: 'asc' }).map((j) => j.id)).toEqual([2, 1]);
    expect(sortQueue([blank, written], scales, { field: 'note', dir: 'desc' }).map((j) => j.id)).toEqual([2, 1]);
  });

  it('does not mutate the list it was given', () => {
    const input = [job({ id: 1 }), job({ id: 2, created_at: '2026-08-01T11:00:00Z' })];
    const before = input.map((j) => j.id);
    sortQueue(input, scales);
    expect(input.map((j) => j.id)).toEqual(before);
  });
});

describe('nextQueueSort', () => {
  it('starts a new column in its default direction', () => {
    expect(nextQueueSort(DEFAULT_QUEUE_SORT, 'item')).toEqual({ field: 'item', dir: 'asc' });
    expect(nextQueueSort(DEFAULT_QUEUE_SORT, 'stake')).toEqual({ field: 'stake', dir: 'desc' });
  });

  it('flips the active column', () => {
    expect(nextQueueSort(DEFAULT_QUEUE_SORT, 'waiting')).toEqual({ field: 'waiting', dir: 'asc' });
    expect(nextQueueSort({ field: 'waiting', dir: 'asc' }, 'waiting')).toEqual(DEFAULT_QUEUE_SORT);
  });
});

describe('the four lists', () => {
  it('covers every stage an item can sit in, once each', () => {
    const stages = QUEUE_LISTS.flatMap((l) => l.stages);
    expect([...stages].sort()).toEqual(['bench', 'done', 'pending', 'queued', 'sent']);
    expect(new Set(stages).size).toBe(stages.length);
  });

  it('gives each list a colour of its own, so a glance tells you where you are', () => {
    const accents = QUEUE_LISTS.map((l) => l.accent);
    expect(new Set(accents).size).toBe(QUEUE_LISTS.length);
  });

  it('opens on the queue', () => {
    expect(QUEUE_LISTS[0].id).toBe('queue');
  });

  it('ends on done, which stays until Processing takes the item', () => {
    expect(QUEUE_LISTS[QUEUE_LISTS.length - 1].id).toBe('done');
  });

  it('looks up an accent, and falls back rather than rendering nothing', () => {
    expect(queueListAccent('queue')).toBe('#2e7d32');
    expect(queueListAccent('bench')).toBe('#1565c0');
    expect(queueListAccent('holding')).toBe('#c2410c');
    expect(queueListAccent('done')).toBe('#6d4c41');
    expect(queueListAccent('nonsense' as QueueListId)).toBe('#2e7d32');
  });

  it('opens the list that holds that stage', () => {
    expect(queueListForStage('queued')).toBe('queue');
    expect(queueListForStage('sent')).toBe('queue');
    expect(queueListForStage('bench')).toBe('bench');
    expect(queueListForStage('pending')).toBe('holding');
    expect(queueListForStage('done')).toBe('done');
    expect(queueListForStage('unknown')).toBe('queue');
  });
});

describe('presentation helpers', () => {
  it('names the item as category, then brand', () => {
    expect(itemKindLine(job())).toBe('Controllers · Microsoft');
  });

  it('keeps the line when category or brand is missing', () => {
    expect(itemKindLine(job({ brand: '' }))).toBe('Controllers');
    expect(itemKindLine(job({ category: '' }))).toBe('Microsoft');
    expect(itemKindLine(job({ brand: '', category: '' }))).toBe('—');
  });

  it('names whose bench an item is on, and reserves a dash when it is not', () => {
    expect(benchOwnerGivenName('Mike Chen')).toBe('Mike');
    expect(benchOwnerLine(job({ stage: 'queued' }))).toEqual({
      kind: 'none',
      label: '—',
      aria: 'Not on a bench',
    });
    expect(benchOwnerLine(job({
      stage: 'bench',
      bench_owner_id: 7,
      bench_owner_name: 'Mike Chen',
    }))).toEqual({
      kind: 'owner',
      label: 'Mike',
      aria: "On Mike's bench",
    });
    expect(benchOwnerLine(job({
      stage: 'bench',
      bench_owner_id: null,
      bench_ownership_ambiguous: true,
    }))).toEqual({
      kind: 'unclaimed',
      label: 'Unclaimed',
      aria: 'Unclaimed bench',
    });
  });

  it('converts grade dollars to percent of retail and back', () => {
    expect(jobRetail({ retail: '40' })).toBe(40);
    expect(jobRetail({ retail: '0' })).toBeNull();
    expect(dollarsToRetailPercent(20, 50)).toBe(40);
    expect(retailPercentToDollars(40, 49.99)).toBe(20);
  });

  it('names destinations and shrugs at unknown ones', () => {
    expect(destinationLabel('online_sales')).toBe('Online Sales');
    expect(destinationLabel('nowhere')).toBe('');
  });

  it('names where a finished item actually went', () => {
    expect(benchDispositionLabel('processing')).toBe('Processing');
    expect(benchDispositionLabel('salvage')).toBe('Salvage');
    expect(benchDispositionLabel('storage')).toBe('Storage');
  });

  it('offers every destination as a pickable id', () => {
    expect(DESTINATION_IDS).toEqual(['shelf', 'online_sales', 'storage', 'staff_pick']);
    for (const id of DESTINATION_IDS) expect(destinationLabel(id)).not.toBe('');
  });

  it('gives each destination a colour of its own, including where a finished item went', () => {
    const paints = [
      ...DESTINATION_IDS,
      'processing',
      'salvage',
    ].map((id) => destinationPaint(id));
    expect(paints.every(Boolean)).toBe(true);
    const fills = new Set(paints.map((p) => p?.strong));
    expect(fills.size).toBe(paints.length);
    expect(destinationPaint('nowhere')).toBeUndefined();
  });
});
