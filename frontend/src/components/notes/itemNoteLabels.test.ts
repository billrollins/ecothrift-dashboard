import { describe, expect, it } from 'vitest';
import type { ItemNoteDTO } from '../../types/inventory.types';
import { formatNoteWhoWhen, latestActiveNote, recentVisibleNotes } from './itemNoteLabels';

function note(partial: Partial<ItemNoteDTO>): ItemNoteDTO {
  return {
    id: 1,
    item: 9,
    item_sku: 'ET-1',
    body: 'keep the wheels',
    surface: 'queue',
    source_key: 'queue',
    restoration_job_id: 16,
    check_in: 2,
    author: 1,
    author_name: 'Rollins, Bill',
    occurred_at: '2026-08-21T19:59:00Z',
    status: 'active',
    supersedes: null,
    voided_at: null,
    voided_by: null,
    void_reason: '',
    created_at: '2026-08-21T19:59:00Z',
    ...partial,
  };
}

describe('latestActiveNote', () => {
  it('picks the newest active note and skips revised or voided', () => {
    expect(
      latestActiveNote([
        note({ id: 1, body: 'first', occurred_at: '2026-08-21T18:00:00Z' }),
        note({ id: 2, status: 'voided', body: 'voided' }),
        note({ id: 3, status: 'revised', body: 'old draft' }),
        note({ id: 4, body: 'keep the wheels', occurred_at: '2026-08-21T19:59:00Z' }),
      ])?.body,
    ).toBe('keep the wheels');
    expect(latestActiveNote([])).toBeNull();
  });
});

describe('recentVisibleNotes', () => {
  it('puts the newest active notes first and drops older ones past the slot', () => {
    const rows = recentVisibleNotes(
      [
        note({ id: 1, body: 'oldest' }),
        note({ id: 2, status: 'voided', body: 'gone' }),
        note({ id: 3, body: 'middle' }),
        note({ id: 4, body: 'newer' }),
        note({ id: 5, body: 'newest' }),
      ],
      2,
    );
    expect(rows.map((row) => row.body)).toEqual(['newest', 'newer']);
  });
});

describe('formatNoteWhoWhen', () => {
  it('puts the author in front of the date and time', () => {
    expect(formatNoteWhoWhen(note({}))).toMatch(/^Rollins, Bill · /);
    expect(formatNoteWhoWhen(note({ author_name: '  ' }))).not.toMatch(/Rollins/);
  });
});
