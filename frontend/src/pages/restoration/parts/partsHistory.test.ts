import { describe, expect, it } from 'vitest';
import { filterHistoryGroups, groupHistoryByItem, sinceForWindow, summarizeHistory } from './partsHistory';
import { partsOrderFixture } from './partsOrderFixture';

describe('sinceForWindow', () => {
  it('names a date for 90 days and year start, and none for all', () => {
    const now = new Date(2026, 7, 25);
    expect(sinceForWindow('all', now)).toBeUndefined();
    expect(sinceForWindow('year', now)).toBe('2026-01-01');
    expect(sinceForWindow('90d', now)).toBe('2026-05-27');
  });
});

describe('groupHistoryByItem', () => {
  it('uses the job value added once when several orders share an item', () => {
    const groups = groupHistoryByItem([
      partsOrderFixture({
        id: 1,
        job: 9,
        status: 'received',
        job_stage: 'done',
        job_starting_grade: 'Parts-only',
        job_final_grade: 'Working',
        job_value_added: '40.00',
        job_spent_parts_cost: '18.00',
        job_dispositioned_at: '2026-08-21T00:00:00Z',
        parts_cost: '12.00',
        attention: '',
      }),
      partsOrderFixture({
        id: 2,
        job: 9,
        name: 'Second hinge',
        status: 'cancelled',
        job_stage: 'done',
        job_starting_grade: 'Parts-only',
        job_final_grade: 'Working',
        job_value_added: '40.00',
        job_spent_parts_cost: '18.00',
        purchased_at: '2026-08-20T00:00:00Z',
        refunded: false,
        parts_cost: '6.00',
        attention: '',
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].valueAdded).toBe(40);
    expect(groups[0].spent).toBe(18);
    expect(groups[0].orderCount).toBe(2);
    expect(groups[0].startingGrade).toBe('Parts-only');
    expect(groups[0].finalGrade).toBe('Working');
  });

  it('keeps unfinished cancelled items without inventing a grade change', () => {
    const groups = groupHistoryByItem([
      partsOrderFixture({
        id: 4,
        job: 11,
        status: 'cancelled',
        job_stage: 'bench',
        job_value_added: null,
        job_spent_parts_cost: null,
        purchased_at: '2026-08-20T00:00:00Z',
        refunded: true,
        parts_cost: '12.00',
        attention: '',
      }),
    ]);
    expect(groups[0].finished).toBe(false);
    expect(groups[0].startingGrade).toBe('');
    expect(groups[0].finalGrade).toBe('');
    expect(groups[0].valueAdded).toBeNull();
    expect(groups[0].spent).toBe(0);
  });
});

describe('summarizeHistory and filterHistoryGroups', () => {
  it('rolls up and splits finished from not finished', () => {
    const groups = groupHistoryByItem([
      partsOrderFixture({
        id: 1,
        job: 9,
        status: 'received',
        job_stage: 'done',
        job_value_added: '40.00',
        job_spent_parts_cost: '12.00',
        job_dispositioned_at: '2026-08-21T00:00:00Z',
        attention: '',
      }),
      partsOrderFixture({
        id: 2,
        job: 11,
        job_sku: 'SKU-2',
        job_name: 'Washer',
        status: 'denied',
        job_stage: 'sent',
        attention: '',
      }),
    ]);
    expect(summarizeHistory(groups)).toEqual({ items: 2, spent: 12, valueAdded: 40, finished: 1 });
    expect(filterHistoryGroups(groups, 'completed', '').map((row) => row.job)).toEqual([9]);
    expect(filterHistoryGroups(groups, 'cancelled', '').map((row) => row.job)).toEqual([11]);
    expect(filterHistoryGroups(groups, 'all', 'washer').map((row) => row.job)).toEqual([11]);
  });
});
