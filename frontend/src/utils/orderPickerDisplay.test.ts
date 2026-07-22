import { describe, expect, it } from 'vitest';
import {
  formatRelevantOrderDateLine,
  orderPickerVendorGlyph,
  pickMostRelevantOrderDate,
} from './orderPickerDisplay';

describe('pickMostRelevantOrderDate', () => {
  it('prefers delivered over earlier milestones', () => {
    const hit = pickMostRelevantOrderDate({
      delivered_date: '2026-11-22',
      shipped_date: '2026-11-10',
      paid_date: '2026-11-01',
      ordered_date: '2026-10-20',
    });
    expect(hit?.shortLabel).toBe('DEL');
    expect(hit?.value).toBe('2026-11-22');
  });

  it('falls back through shipped → paid → ordered', () => {
    expect(
      pickMostRelevantOrderDate({
        shipped_date: '2026-11-10',
        paid_date: '2026-11-01',
        ordered_date: '2026-10-20',
      })?.shortLabel,
    ).toBe('SHIP');
    expect(
      pickMostRelevantOrderDate({
        paid_date: '2026-11-01',
        ordered_date: '2026-10-20',
      })?.shortLabel,
    ).toBe('PAID');
    expect(pickMostRelevantOrderDate({ ordered_date: '2026-10-20' })?.shortLabel).toBe('ORD');
  });

  it('formats a compact line', () => {
    const line = formatRelevantOrderDateLine({ delivered_date: '2026-11-22' });
    expect(line.startsWith('DEL · ')).toBe(true);
    expect(line).toContain('2026');
  });

  it('vendor glyph uses first two chars', () => {
    expect(orderPickerVendorGlyph('amazon')).toBe('AM');
    expect(orderPickerVendorGlyph('')).toBe('?');
  });
});
