import { describe, expect, it } from 'vitest';
import type {
  RestorationActionDTO,
  RestorationTimelineEventDTO,
} from '../../../types/inventory.types';
import {
  clearableHistoryLines,
  clearableHistoryTotal,
  filterBenchHistory,
  displayHistoryWho,
  formatHistoryWho,
  historyRowAffordance,
  mergeBenchHistory,
  priceChangeDetail,
  summarizeClearableHistory,
  truncateHistoryWho,
  type HistoryClearContext,
} from './tarsBenchHistory';

function action(overrides: Partial<RestorationActionDTO>): RestorationActionDTO {
  return {
    id: 1,
    grade: 'Working',
    category: 'inspect',
    description: 'opened it up',
    seconds: 120,
    started_at: '2026-08-14T14:00:00Z',
    ended_at: '2026-08-14T14:02:00Z',
    created_by: 1,
    created_by_name: 'Mike',
    is_described: true,
    ...overrides,
  };
}

function defaultEntityId(
  eventType: RestorationTimelineEventDTO['event_type'],
  payload: Record<string, unknown>,
): string {
  const grade = typeof payload.grade === 'string' ? payload.grade : 'Working';
  const field = typeof payload.field === 'string' ? payload.field : '';
  switch (eventType) {
    case 'job.sent':
    case 'job.checked_in':
    case 'job.moved_to_queue':
    case 'hold.resumed':
    case 'job.reopened':
      return 'job:1';
    case 'hold.placed':
      return 'hold:1';
    case 'grade.claimed':
      return field === 'current' ? 'grade:current' : 'grade:original';
    case 'plan.estimate_changed':
      return `estimate:${grade}`;
    case 'note.queue_changed':
      return 'queue-note:1';
    case 'note.added':
      return 'item-note:1';
    case 'valuation.values_changed':
      return 'grade-values:1';
    case 'valuation.requested':
    case 'valuation.fulfilled':
      return 'valuation-request:1';
    case 'parts.order_purchased':
    case 'parts.order_requested':
    case 'parts.order_received':
      return 'parts-order:1';
    case 'disposition.completed':
    case 'disposition.revised':
      return 'disposition:1';
    case 'return.to_processing':
      return 'return:1';
    case 'processing.checked_in':
      return 'processing-check-in:1';
    default:
      return 'hold:1';
  }
}

function event(overrides: Partial<RestorationTimelineEventDTO>): RestorationTimelineEventDTO {
  const eventType = overrides.event_type ?? 'hold.placed';
  const payload = overrides.payload ?? { reason: 'parts_needed', notes: 'waiting on a hinge' };
  return {
    id: 10,
    job_id: 1,
    occurred_at: '2026-08-14T15:00:00Z',
    actor_id: 1,
    actor_name: 'Mike',
    status: 'active',
    supersedes_id: null,
    voided_at: null,
    voided_by_id: null,
    voided_by_name: '',
    void_reason: '',
    correlation_id: 'c',
    schema_version: 1,
    ...overrides,
    event_type: eventType,
    payload,
    entity_id: overrides.entity_id ?? defaultEntityId(eventType, payload),
  };
}

function ctx(
  rows: ReturnType<typeof mergeBenchHistory>,
  actions: RestorationActionDTO[],
  currentUserId: number | null = 1,
): HistoryClearContext {
  return { rows, actions, currentUserId };
}

describe('mergeBenchHistory', () => {
  it('drops the open action and noisy timeline types', () => {
    const rows = mergeBenchHistory(
      [
        action({ id: 1, description: 'current look' }),
        action({
          id: 2,
          category: 'repair',
          started_at: '2026-08-14T13:00:00Z',
          created_by_name: 'Ashley Smith',
        }),
      ],
      [
        event({ id: 10 }),
        event({ id: 11, event_type: 'action.described', occurred_at: '2026-08-14T14:01:00Z' }),
        event({ id: 12, event_type: 'action.started', occurred_at: '2026-08-14T14:30:00Z' }),
        event({
          id: 13,
          event_type: 'grade.claimed',
          occurred_at: '2026-08-14T12:00:00Z',
          payload: { field: 'original', grade: 'Repairable', previous: '' },
        }),
      ],
      1,
    );
    expect(rows.map((row) => row.id)).toEqual(['event:10', 'action:2', 'event:13']);
    expect(rows[0].filter).toBe('progress');
    expect(rows[0].actor).toBe('Mike');
    expect(rows[1].filter).toBe('repair');
    expect(rows[1].actor).toBe('Smith, Ashley');
    expect(rows[2].filter).toBe('progress');
    expect(rows[2].title).toBe('Original set to Repairable');
  });

  it('filters to one kind', () => {
    const rows = mergeBenchHistory(
      [action({ id: 2, category: 'test' })],
      [event({ event_type: 'valuation.values_changed', payload: { values: { Working: 100 } } })],
      null,
    );
    expect(filterBenchHistory(rows, 'test')).toHaveLength(1);
    expect(filterBenchHistory(rows, 'grades')).toHaveLength(1);
    expect(filterBenchHistory(rows, 'all')).toHaveLength(2);
  });

  it('Actions keeps inspect-salvage and Non-actions keeps the desk map', () => {
    const rows = mergeBenchHistory(
      [
        action({ id: 1, category: 'inspect', started_at: '2026-08-14T13:00:00Z' }),
        action({ id: 2, category: 'salvage', started_at: '2026-08-14T13:10:00Z' }),
      ],
      [
        event({ id: 20, event_type: 'hold.placed' }),
        event({
          id: 21,
          event_type: 'note.queue_changed',
          occurred_at: '2026-08-14T15:01:00Z',
          payload: { previous: '', next: 'check the cable' },
        }),
      ],
      null,
    );
    const filtered = filterBenchHistory(rows, 'actions');
    expect(filtered.map((row) => row.filter)).toEqual(['salvage', 'inspect']);
    expect(filterBenchHistory(rows, 'all')).toHaveLength(4);
    expect(filterBenchHistory(rows, 'non_actions').map((row) => row.filter)).toEqual([
      'notes',
      'progress',
    ]);
  });

  it('groups desk events onto Notes, Grades, Estimates, Parts, and Progress', () => {
    const rows = mergeBenchHistory(
      [],
      [
        event({ id: 1, event_type: 'note.queue_changed', payload: { previous: '', next: 'check the cable' } }),
        event({ id: 2, event_type: 'valuation.requested', payload: {} }),
        event({ id: 3, event_type: 'parts.order_received', payload: {} }),
        event({ id: 4, event_type: 'plan.estimate_changed', payload: { grade: 'Working', parts_from: 10, parts_to: 20 } }),
        event({
          id: 5,
          event_type: 'grade.claimed',
          payload: { field: 'current', grade: 'Working', previous: 'Repairable' },
        }),
        event({ id: 6, event_type: 'action.started', payload: {} }),
      ],
      null,
    );
    expect(filterBenchHistory(rows, 'notes').map((row) => row.filter)).toEqual(['notes']);
    expect(filterBenchHistory(rows, 'grades')).toHaveLength(1);
    expect(filterBenchHistory(rows, 'parts')).toHaveLength(1);
    expect(filterBenchHistory(rows, 'estimates')[0].title).toBe('Working estimate');
    expect(filterBenchHistory(rows, 'progress')[0].title).toBe('Current set to Working');
    expect(rows.some((row) => row.id === 'event:6')).toBe(false);
  });
});

describe('formatHistoryWho', () => {
  it('writes Last, First and shortens a long first name to an initial', () => {
    expect(formatHistoryWho('Mike')).toBe('Mike');
    expect(formatHistoryWho('Ashley Smith')).toBe('Smith, Ashley');
    expect(formatHistoryWho('Mary Ann Washington')).toBe('Washington, Mary Ann');
    expect(formatHistoryWho('Smith, Ashley')).toBe('Smith, Ashley');
    expect(truncateHistoryWho('Washington, Mary Ann')).toBe('Washington, M');
    expect(displayHistoryWho('Mary Ann Washington')).toBe('Washington, M');
    expect(formatHistoryWho('')).toBe('Staff');
  });
});

describe('priceChangeDetail', () => {
  it('lists only grades whose price moved', () => {
    expect(
      priceChangeDetail(
        { Working: 20, Repairable: 12, 'Parts-only': 5 },
        { Working: 25, Repairable: 12, 'Parts-only': 5 },
      ),
    ).toBe('Working $20 → $25');
  });

  it('treats a new price and a dropped price as changes', () => {
    expect(priceChangeDetail({}, { Working: 25 })).toBe('Working - → $25');
    expect(priceChangeDetail({ Custom: 10 }, {})).toBe('Custom $10 → -');
  });
});

describe('historyRowAffordance', () => {
  it('never clears actions, a lone hold, the latest sell-as, or a lone check-in', () => {
    const actions = [action({ id: 1 }), action({ id: 2 })];
    const rows = mergeBenchHistory(
      actions,
      [
        event({ id: 1, event_type: 'note.queue_changed', payload: { previous: 'oops', next: 'fine' } }),
        event({ id: 2, event_type: 'hold.placed', payload: { notes: 'a slur' } }),
        event({ id: 3, event_type: 'job.checked_in', payload: {} }),
        event({ id: 4, event_type: 'valuation.values_changed', payload: { values: { Working: 25 } } }),
        event({ id: 5, event_type: 'job.sent', occurred_at: '2026-08-14T11:00:00Z', payload: {} }),
      ],
      1,
    );
    const clear = ctx(rows, actions);
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(historyRowAffordance(byId['action:2'], clear)).toBe('none');
    expect(historyRowAffordance(byId['event:1'], clear)).toBe('reset-note');
    expect(historyRowAffordance(byId['event:2'], clear)).toBe('none');
    expect(historyRowAffordance(byId['event:3'], clear)).toBe('none');
    expect(historyRowAffordance(byId['event:4'], clear)).toBe('none');
    expect(historyRowAffordance(byId['event:5'], clear)).toBe('none');
  });

  it('keeps the current note as a reset after later work', () => {
    const note = event({
      id: 1,
      event_type: 'note.queue_changed',
      occurred_at: '2026-08-14T15:00:00Z',
      actor_id: 1,
      payload: { previous: '', next: 'check the cable' },
    });
    const ownSitting = [
      action({ id: 1, created_by: 1, started_at: '2026-08-14T14:00:00Z' }),
      action({ id: 2, created_by: 1, started_at: '2026-08-14T16:00:00Z' }),
    ];
    const ownRows = mergeBenchHistory(ownSitting, [note], 1);
    expect(historyRowAffordance(ownRows.find((row) => row.id === 'event:1')!, ctx(ownRows, ownSitting, 1))).toBe(
      'reset-note',
    );

    const bobActions = [action({ id: 1, started_at: '2026-08-14T14:00:00Z' })];
    const bobEstimate = mergeBenchHistory(
      bobActions,
      [
        note,
        event({
          id: 2,
          event_type: 'plan.estimate_changed',
          occurred_at: '2026-08-14T15:30:00Z',
          actor_id: 2,
          actor_name: 'Bob',
          payload: { grade: 'Working', minutes_from: 10, minutes_to: 20 },
        }),
      ],
      1,
    );
    expect(
      historyRowAffordance(
        bobEstimate.find((row) => row.id === 'event:1')!,
        ctx(bobEstimate, bobActions, 1),
      ),
    ).toBe('reset-note');
  });

  it('lets you clear an earlier note; the current note is a reset, not a clear', () => {
    const actions = [action({ id: 1, started_at: '2026-08-14T14:00:00Z' })];
    const rows = mergeBenchHistory(
      actions,
      [
        event({
          id: 1,
          event_type: 'note.queue_changed',
          occurred_at: '2026-08-14T15:00:00Z',
          payload: { previous: '', next: 'first' },
        }),
        event({
          id: 2,
          event_type: 'note.queue_changed',
          occurred_at: '2026-08-14T15:10:00Z',
          payload: { previous: 'first', next: 'second' },
        }),
      ],
      1,
    );
    const clear = ctx(rows, actions);
    expect(historyRowAffordance(rows.find((row) => row.id === 'event:1')!, clear)).toBe('clear-note');
    expect(historyRowAffordance(rows.find((row) => row.id === 'event:2')!, clear)).toBe('reset-note');

    const afterOwnWork = [
      action({ id: 1, started_at: '2026-08-14T14:00:00Z' }),
      action({ id: 2, started_at: '2026-08-14T16:00:00Z' }),
    ];
    const ownLater = mergeBenchHistory(
      afterOwnWork,
      [
        event({
          id: 1,
          event_type: 'note.queue_changed',
          occurred_at: '2026-08-14T15:00:00Z',
          payload: { previous: '', next: 'first' },
        }),
        event({
          id: 2,
          event_type: 'note.queue_changed',
          occurred_at: '2026-08-14T15:10:00Z',
          payload: { previous: 'first', next: 'second' },
        }),
      ],
      1,
    );
    const ownLaterCtx = ctx(ownLater, afterOwnWork);
    expect(historyRowAffordance(ownLater.find((row) => row.id === 'event:1')!, ownLaterCtx)).toBe('clear-note');
    expect(historyRowAffordance(ownLater.find((row) => row.id === 'event:2')!, ownLaterCtx)).toBe('reset-note');
  });

  it('later sitting by you does not lock; later sitting or comment by someone else does', () => {
    const note = event({
      id: 1,
      event_type: 'note.queue_changed',
      occurred_at: '2026-08-14T15:00:00Z',
      actor_id: 1,
      payload: { previous: '', next: 'check the cable' },
    });

    const ownSitting = [
      action({ id: 1, created_by: 1, started_at: '2026-08-14T14:00:00Z' }),
      action({ id: 2, created_by: 1, started_at: '2026-08-14T16:00:00Z' }),
    ];
    const ownRows = mergeBenchHistory(ownSitting, [note], 1);
    expect(historyRowAffordance(ownRows.find((row) => row.id === 'event:1')!, ctx(ownRows, ownSitting, 1))).toBe(
      'reset-note',
    );

    const bobSitting = [
      action({ id: 1, created_by: 1, started_at: '2026-08-14T14:00:00Z' }),
      action({ id: 2, created_by: 2, created_by_name: 'Bob', started_at: '2026-08-14T16:00:00Z' }),
    ];
    const bobRows = mergeBenchHistory(bobSitting, [note], 1);
    expect(historyRowAffordance(bobRows.find((row) => row.id === 'event:1')!, ctx(bobRows, bobSitting, 1))).toBe(
      'none',
    );

    const bobComment = mergeBenchHistory(
      [action({ id: 1, started_at: '2026-08-14T14:00:00Z' })],
      [
        note,
        event({
          id: 2,
          event_type: 'note.added',
          occurred_at: '2026-08-14T15:30:00Z',
          actor_id: 2,
          actor_name: 'Bob',
          payload: { body: 'Bob was here', item_note_id: 9 },
          entity_id: 'item-note:9',
        }),
      ],
      1,
    );
    expect(
      historyRowAffordance(
        bobComment.find((row) => row.id === 'event:1')!,
        ctx(bobComment, [action({ id: 1, started_at: '2026-08-14T14:00:00Z' })], 1),
      ),
    ).toBe('none');
    expect(
      historyRowAffordance(
        bobComment.find((row) => row.id === 'event:2')!,
        ctx(bobComment, [action({ id: 1, started_at: '2026-08-14T14:00:00Z' })], 1),
      ),
    ).toBe('none');
  });

  it('never offers trash on someone else\'s note', () => {
    const rows = mergeBenchHistory(
      [action({ id: 1 })],
      [
        event({
          id: 1,
          event_type: 'note.added',
          actor_id: 2,
          actor_name: 'Bob',
          payload: { body: 'Bob wrote this', item_note_id: 9 },
        }),
      ],
      1,
    );
    expect(historyRowAffordance(rows.find((row) => row.id === 'event:1')!, ctx(rows, [action({ id: 1 })], 1))).toBe(
      'none',
    );
  });

  it('voids earlier job moves with no sitting between them; newest and origin stay', () => {
    const bounceEvents = [
      event({ id: 1, event_type: 'job.sent', occurred_at: '2026-08-14T11:00:00Z', payload: {} }),
      event({ id: 2, event_type: 'job.checked_in', occurred_at: '2026-08-14T12:00:00Z', payload: {} }),
      event({ id: 3, event_type: 'job.moved_to_queue', occurred_at: '2026-08-14T13:00:00Z', payload: {} }),
    ];
    const canned = [
      action({
        id: 1,
        description: 'Initial item inspection',
        started_at: '2026-08-14T12:00:01Z',
      }),
    ];
    const emptyWork = mergeBenchHistory(canned, bounceEvents, null);
    const emptyCtx = ctx(emptyWork, canned);
    const byId = Object.fromEntries(emptyWork.map((row) => [row.id, row]));
    expect(historyRowAffordance(byId['event:1'], emptyCtx)).toBe('none');
    expect(historyRowAffordance(byId['event:2'], emptyCtx)).toBe('clear-event');
    expect(historyRowAffordance(byId['event:3'], emptyCtx)).toBe('none');

    const worked = [action({ id: 1, started_at: '2026-08-14T12:30:00Z' })];
    const blocked = mergeBenchHistory(worked, bounceEvents, null);
    const blockedCtx = ctx(blocked, worked);
    expect(historyRowAffordance(blocked.find((row) => row.id === 'event:2')!, blockedCtx)).toBe('none');
    expect(historyRowAffordance(blocked.find((row) => row.id === 'event:3')!, blockedCtx)).toBe('none');
  });

  it('voids earlier minutes on the same estimate; parts then minutes both stay', () => {
    const actions = [action({ id: 1, started_at: '2026-08-14T10:00:00Z' })];
    const minutes = mergeBenchHistory(
      actions,
      [
        event({
          id: 1,
          event_type: 'plan.estimate_changed',
          occurred_at: '2026-08-14T12:00:00Z',
          payload: { grade: 'Working', minutes_from: 10, minutes_to: 20 },
        }),
        event({
          id: 2,
          event_type: 'plan.estimate_changed',
          occurred_at: '2026-08-14T12:10:00Z',
          payload: { grade: 'Working', minutes_from: 20, minutes_to: 45 },
        }),
        event({
          id: 3,
          event_type: 'plan.estimate_changed',
          occurred_at: '2026-08-14T12:20:00Z',
          payload: { grade: 'Working', minutes_from: 45, minutes_to: 60 },
        }),
      ],
      1,
    );
    const minutesCtx = ctx(minutes, actions);
    const minutesById = Object.fromEntries(minutes.map((row) => [row.id, row]));
    expect(historyRowAffordance(minutesById['event:1'], minutesCtx)).toBe('clear-event');
    expect(historyRowAffordance(minutesById['event:2'], minutesCtx)).toBe('clear-event');
    expect(historyRowAffordance(minutesById['event:3'], minutesCtx)).toBe('none');

    const mixed = mergeBenchHistory(
      actions,
      [
        event({
          id: 4,
          event_type: 'plan.estimate_changed',
          occurred_at: '2026-08-14T13:00:00Z',
          payload: { grade: 'Working', parts_from: 10, parts_to: 20 },
        }),
        event({
          id: 5,
          event_type: 'plan.estimate_changed',
          occurred_at: '2026-08-14T13:10:00Z',
          payload: { grade: 'Working', minutes_from: null, minutes_to: 45 },
        }),
      ],
      1,
    );
    const mixedCtx = ctx(mixed, actions);
    expect(historyRowAffordance(mixed.find((row) => row.id === 'event:4')!, mixedCtx)).toBe('none');
    expect(historyRowAffordance(mixed.find((row) => row.id === 'event:5')!, mixedCtx)).toBe('none');
  });

  it('voids an earlier Working sell-as; Working then Repairable both stay', () => {
    const actions = [action({ id: 1, started_at: '2026-08-14T10:00:00Z' })];
    const sameGrade = mergeBenchHistory(
      actions,
      [
        event({
          id: 1,
          event_type: 'valuation.values_changed',
          occurred_at: '2026-08-14T13:00:00Z',
          payload: { values: { Working: 20 }, previous_values: { Working: 19.99 } },
        }),
        event({
          id: 2,
          event_type: 'valuation.values_changed',
          occurred_at: '2026-08-14T14:00:00Z',
          payload: { values: { Working: 25 }, previous_values: { Working: 20 } },
        }),
      ],
      1,
    );
    const sameCtx = ctx(sameGrade, actions);
    expect(historyRowAffordance(sameGrade.find((row) => row.id === 'event:1')!, sameCtx)).toBe('clear-event');
    expect(historyRowAffordance(sameGrade.find((row) => row.id === 'event:2')!, sameCtx)).toBe('none');
    expect(
      historyRowAffordance(sameGrade.find((row) => row.id === 'event:1')!, { ...sameCtx, closed: true }),
    ).toBe('none');

    const different = mergeBenchHistory(
      actions,
      [
        event({
          id: 3,
          event_type: 'valuation.values_changed',
          occurred_at: '2026-08-14T13:00:00Z',
          payload: { values: { Working: 25 }, previous_values: { Working: 19.99 } },
        }),
        event({
          id: 4,
          event_type: 'valuation.values_changed',
          occurred_at: '2026-08-14T14:00:00Z',
          payload: {
            values: { Working: 25, Repairable: 15 },
            previous_values: { Working: 25, Repairable: 12 },
          },
        }),
      ],
      1,
    );
    const differentCtx = ctx(different, actions);
    expect(historyRowAffordance(different.find((row) => row.id === 'event:3')!, differentCtx)).toBe('none');
    expect(historyRowAffordance(different.find((row) => row.id === 'event:4')!, differentCtx)).toBe('none');
  });

  it('still offers comment trash on a finished job', () => {
    const actions = [action({ id: 1 })];
    const rows = mergeBenchHistory(
      actions,
      [
        event({
          id: 1,
          event_type: 'note.added',
          payload: { body: 'leave this', item_note_id: 9 },
        }),
      ],
      1,
    );
    const closed = { ...ctx(rows, actions), closed: true };
    expect(historyRowAffordance(rows.find((row) => row.id === 'event:1')!, closed)).toBe('clear-note');
  });

  it('never clears parts ordered or a valuation request', () => {
    const rows = mergeBenchHistory(
      [],
      [
        event({ id: 1, event_type: 'parts.order_purchased', payload: { name: 'McMaster', total: '12.00' } }),
        event({ id: 2, event_type: 'valuation.requested', payload: { notes: 'need Working' } }),
      ],
      null,
    );
    const clear = ctx(rows, []);
    expect(historyRowAffordance(rows[0], clear)).toBe('none');
    expect(historyRowAffordance(rows[1], clear)).toBe('none');
  });
});

describe('summarizeClearableHistory', () => {
  it('counts notes and superseded answers, never actions', () => {
    const actions = [action({ id: 1 }), action({ id: 2 })];
    const rows = mergeBenchHistory(
      actions,
      [
        event({
          id: 1,
          event_type: 'note.queue_changed',
          occurred_at: '2026-08-14T14:50:00Z',
          payload: { previous: 'oops', next: 'fine' },
        }),
        event({
          id: 6,
          event_type: 'note.queue_changed',
          occurred_at: '2026-08-14T15:00:00Z',
          payload: { previous: 'fine', next: 'current' },
        }),
        event({ id: 2, event_type: 'job.checked_in', occurred_at: '2026-08-14T12:00:00Z', payload: {} }),
        event({ id: 3, event_type: 'job.moved_to_queue', occurred_at: '2026-08-14T12:05:00Z', payload: {} }),
        event({
          id: 4,
          event_type: 'plan.estimate_changed',
          occurred_at: '2026-08-14T12:10:00Z',
          payload: { grade: 'Working', minutes_from: 10, minutes_to: 20 },
        }),
        event({
          id: 5,
          event_type: 'plan.estimate_changed',
          occurred_at: '2026-08-14T12:15:00Z',
          payload: { grade: 'Working', minutes_from: 20, minutes_to: 45 },
        }),
      ],
      1,
    );
    const summary = summarizeClearableHistory(ctx(rows, actions));
    expect(summary).toEqual({ notes: 1, superseded: 2 });
    expect(clearableHistoryTotal(summary)).toBe(3);
    expect(clearableHistoryLines(summary)).toEqual([
      '1 of your earlier notes - the current note stays',
      '2 earlier answers - the latest of each kind since the last sitting stays',
    ]);
  });
});
