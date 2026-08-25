import { describe, expect, it } from 'vitest';
import type { EnhancementRequestDTO } from '../../types/enhancementRequests.types';
import {
  areaWord,
  formatRequestWhen,
  priorityWord,
  requestsForFilter,
  sortEnhancementRequests,
  statusWord,
  targetDateLabel,
  whoWhenLine,
} from './enhancementRequestsTable';

function request(over: Partial<EnhancementRequestDTO> = {}): EnhancementRequestDTO {
  return {
    id: 1,
    area: 'restoration',
    body: 'Need a parts bin.',
    submitted_by: 4,
    submitted_by_name: 'Mike Tars',
    status: 'open',
    priority: 'unset',
    target_date: null,
    reviewed_by: null,
    reviewed_by_name: null,
    reviewed_at: null,
    notes: [],
    can_edit: true,
    can_note: true,
    created_at: '2026-08-25T14:30:00Z',
    updated_at: '2026-08-25T14:30:00Z',
    ...over,
  };
}

describe('enhancement request labels', () => {
  it('names area, status, and priority', () => {
    expect(areaWord('restoration')).toBe('Restoration');
    expect(areaWord('processing')).toBe('Processing');
    expect(statusWord('planned')).toBe('Planned');
    expect(priorityWord('high')).toBe('High');
    expect(priorityWord('unset')).toBe('—');
  });

  it('keeps a who and when line, and a reserved target date', () => {
    expect(formatRequestWhen('2026-08-25T14:30:00Z')).toBe('2026-08-25 14:30');
    expect(whoWhenLine(request())).toBe('Mike Tars · 2026-08-25 14:30');
    expect(targetDateLabel(request())).toBe('—');
    expect(targetDateLabel(request({ target_date: '2026-09-01' }))).toBe('2026-09-01');
  });
});

describe('sortEnhancementRequests', () => {
  it('puts high priority first, then newest', () => {
    const rows = [
      request({ id: 1, priority: 'low', created_at: '2026-08-25T12:00:00Z' }),
      request({ id: 2, priority: 'high', created_at: '2026-08-24T12:00:00Z' }),
      request({ id: 3, priority: 'high', created_at: '2026-08-25T18:00:00Z' }),
    ];
    expect(sortEnhancementRequests(rows).map((row) => row.id)).toEqual([3, 2, 1]);
  });
});

describe('requestsForFilter', () => {
  it('filters by area and status', () => {
    const rows = [
      request({ id: 1, area: 'restoration', status: 'open' }),
      request({ id: 2, area: 'processing', status: 'planned' }),
      request({ id: 3, area: 'restoration', status: 'done' }),
    ];
    expect(requestsForFilter(rows, 'restoration', 'all').map((row) => row.id)).toEqual([1, 3]);
    expect(requestsForFilter(rows, 'all', 'planned').map((row) => row.id)).toEqual([2]);
  });
});
