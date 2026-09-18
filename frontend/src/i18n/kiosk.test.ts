import { describe, expect, it } from 'vitest';
import { KIOSK_STRINGS, MISS_REASON_KEYS, missReasonLabel, tk } from './kiosk';

describe('kiosk i18n', () => {
  it('every key has a non-empty English and Spanish value', () => {
    const missing = Object.entries(KIOSK_STRINGS)
      .filter(([, row]) => !row.en?.trim() || !row.es?.trim())
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it('never says Called out', () => {
    const hits = Object.entries(KIOSK_STRINGS).filter(([, row]) => /called out/i.test(row.en));
    expect(hits).toEqual([]);
  });

  it('interpolates variables and falls back to English', () => {
    expect(tk('warnLate', 'en', { minutes: 25, shift: 'Retail Open' })).toBe("You're 25 min late for Retail Open.");
    expect(tk('warnLate', 'es', { minutes: 25, shift: 'Retail Open' })).toBe('Llegas 25 min tarde para Retail Open.');
    expect(tk('clockIn', 'fr')).toBe('Clock in');
    expect(tk('nope', 'en')).toBe('nope');
  });

  it('has a label for every miss reason code in both languages', () => {
    for (const { code } of MISS_REASON_KEYS) {
      expect(missReasonLabel(code, 'en')).not.toBe(code);
      expect(missReasonLabel(code, 'es')).not.toBe(code);
    }
    expect(MISS_REASON_KEYS.map((r) => r.code)).toEqual(['forgot', 'no_time', 'called_in', 'not_my_section', 'other']);
  });
});
