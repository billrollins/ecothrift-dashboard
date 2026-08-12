import { describe, expect, it } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import {
  DESTINATION_IDS,
  QUEUE_LISTS,
  destinationLabel,
  formatWaiting,
  handoffSummary,
  hoursWaiting,
  isReadyForBench,
  isStale,
  missingGrades,
  queueListAccent,
  sortQueue,
  valuePotential,
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

  it('survives an unparseable date', () => {
    expect(hoursWaiting(job({ created_at: 'not a date' }), NOW)).toBeNull();
    expect(formatWaiting(job({ created_at: 'not a date' }), NOW)).toBe('—');
  });
});

describe('sortQueue', () => {
  const scales = { Functional: ['Working', 'Repairable', 'Parts-only'] };

  it('puts items anyone can unblock above items ready to work', () => {
    const ready = job({ id: 1 });
    const needsGrades = job({ id: 2, grade_values: { Working: 20 } });
    expect(sortQueue([ready, needsGrades], scales).map((j) => j.id)).toEqual([2, 1]);
  });

  it('ranks the most money on the table first', () => {
    const small = job({ id: 1, grade_values: { Working: 12, 'Parts-only': 10 } });
    const large = job({ id: 2, grade_values: { Working: 90, 'Parts-only': 5 } });
    expect(sortQueue([small, large], scales).map((j) => j.id)).toEqual([2, 1]);
  });

  it('breaks a tie with age so nothing sits forever', () => {
    const newer = job({ id: 1, created_at: '2026-08-12T11:00:00Z' });
    const older = job({ id: 2, created_at: '2026-08-01T11:00:00Z' });
    expect(sortQueue([newer, older], scales).map((j) => j.id)).toEqual([2, 1]);
  });

  it('does not mutate the list it was given', () => {
    const input = [job({ id: 1 }), job({ id: 2, grade_values: { Working: 99 } })];
    const before = input.map((j) => j.id);
    sortQueue(input, scales);
    expect(input.map((j) => j.id)).toEqual(before);
  });
});

describe('the three lists', () => {
  it('covers every stage an unfinished item can be in, once each', () => {
    const stages = QUEUE_LISTS.flatMap((l) => l.stages);
    expect([...stages].sort()).toEqual(['bench', 'pending', 'queued', 'sent']);
    expect(new Set(stages).size).toBe(stages.length);
  });

  it('gives each list a colour of its own, so a glance tells you where you are', () => {
    const accents = QUEUE_LISTS.map((l) => l.accent);
    expect(new Set(accents).size).toBe(QUEUE_LISTS.length);
  });

  it('opens on the queue', () => {
    expect(QUEUE_LISTS[0].id).toBe('queue');
  });

  it('looks up an accent, and falls back rather than rendering nothing', () => {
    expect(queueListAccent('bench')).toBe('#4f46e5');
    expect(queueListAccent('nonsense' as QueueListId)).toBe('#0f8a7e');
  });
});

describe('presentation helpers', () => {
  it('prefers what Processing actually wrote', () => {
    const withNotes = job({
      processing_handoff: { tested_status: 'untested', condition_evidence: 'Rattles when shaken' },
    } as Partial<RestorationJobDTO>);
    expect(handoffSummary(withNotes)).toBe('Rattles when shaken');
  });

  it('falls back to what the item is rather than saying nothing', () => {
    expect(handoffSummary(job())).toBe('Microsoft · Controllers');
  });

  it('admits when there is nothing to say', () => {
    expect(handoffSummary(job({ brand: '', category: '' }))).toBe('No handoff notes');
  });

  it('names destinations and shrugs at unknown ones', () => {
    expect(destinationLabel('online_sales')).toBe('Online Sales');
    expect(destinationLabel('nowhere')).toBe('');
  });

  it('offers every destination as a pickable id', () => {
    expect(DESTINATION_IDS).toEqual(['shelf', 'online_sales', 'storage', 'staff_pick']);
    for (const id of DESTINATION_IDS) expect(destinationLabel(id)).not.toBe('');
  });
});
