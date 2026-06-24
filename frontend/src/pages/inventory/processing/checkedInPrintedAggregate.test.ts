import { describe, expect, it } from 'vitest';
import {
  checkInAllLabelsPrinted,
  checkInPrintActionLabel,
  checkInPrintedCount,
  checkInPrintedDisplay,
} from './checkedInPrintedAggregate';

describe('checkedInPrintedAggregate', () => {
  const items = [
    { sku: 'A-1', label_printed: true },
    { sku: 'A-2', label_printed: false },
    { sku: 'A-3', label_printed: false },
  ];

  it('counts printed items', () => {
    expect(checkInPrintedCount(items)).toBe(1);
  });

  it('shows partial ratio', () => {
    expect(checkInPrintedDisplay(items, 3)).toEqual({
      text: '1/3',
      allPrinted: false,
      unprintedSkus: ['A-2', 'A-3'],
    });
  });

  it('shows checkmark when all printed', () => {
    const all = items.map((item) => ({ ...item, label_printed: true }));
    expect(checkInPrintedDisplay(all, 3).text).toBe('✓');
    expect(checkInAllLabelsPrinted(all, 3)).toBe(true);
  });

  it('chooses Print vs Reprint action label', () => {
    expect(checkInPrintActionLabel(items, 3)).toBe('Print');
    const all = items.map((item) => ({ ...item, label_printed: true }));
    expect(checkInPrintActionLabel(all, 3)).toBe('Reprint');
  });
});
