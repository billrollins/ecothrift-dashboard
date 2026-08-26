import { describe, expect, it } from 'vitest';
import { parseStoreHours, setDayOpen } from './storeHours';

describe('parseStoreHours', () => {
  it('fills Canfield defaults when the value is missing', () => {
    expect(parseStoreHours(null)).toEqual({
      timezone: 'America/Chicago',
      open: '09:00',
      close: '18:00',
      closed_weekdays: [0, 6],
    });
  });

  it('keeps a stored Tuesday-Saturday clock', () => {
    expect(
      parseStoreHours({
        timezone: 'America/Chicago',
        open: '9:00',
        close: '18:00',
        closed_weekdays: [0, 6],
      }),
    ).toEqual({
      timezone: 'America/Chicago',
      open: '09:00',
      close: '18:00',
      closed_weekdays: [0, 6],
    });
  });
});

describe('setDayOpen', () => {
  it('opens Monday by removing 0 from the closed list', () => {
    const next = setDayOpen(parseStoreHours(null), 0, true);
    expect(next.closed_weekdays).toEqual([6]);
  });

  it('closes Wednesday without changing row count of the week', () => {
    const next = setDayOpen(parseStoreHours(null), 2, false);
    expect(next.closed_weekdays).toEqual([0, 2, 6]);
  });
});
