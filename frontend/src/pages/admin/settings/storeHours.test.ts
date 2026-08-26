import { describe, expect, it } from 'vitest';
import { formatHoursLabel, parseStoreHours, setDayOpen } from './storeHours';

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

describe('formatHoursLabel', () => {
  it('writes the Canfield public sentence', () => {
    expect(formatHoursLabel(parseStoreHours(null))).toBe(
      '9 AM - 6 PM, Tuesday - Saturday · Closed Sunday & Monday',
    );
  });

  it('rebuilds the sentence when Wednesday is closed', () => {
    expect(
      formatHoursLabel({
        timezone: 'America/Chicago',
        open: '09:00',
        close: '18:00',
        closed_weekdays: [2, 6],
      }),
    ).toBe('9 AM - 6 PM, Monday & Tuesday, Thursday - Saturday · Closed Wednesday & Sunday');
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
