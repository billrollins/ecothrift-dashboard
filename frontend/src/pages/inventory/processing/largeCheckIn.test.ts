import { describe, expect, it } from 'vitest';

import {
  clampCheckInQuantity,
  isLargeCheckIn,
  LARGE_CHECK_IN_THRESHOLD,
  MAX_CHECK_IN_QUANTITY,
  printPhraseMatches,
  requiredPrintPhrase,
} from './largeCheckIn';

describe('large check-in guard', () => {
  it('threshold gates only big quantities', () => {
    expect(isLargeCheckIn(1)).toBe(false);
    expect(isLargeCheckIn(LARGE_CHECK_IN_THRESHOLD)).toBe(false);
    expect(isLargeCheckIn(LARGE_CHECK_IN_THRESHOLD + 1)).toBe(true);
    expect(isLargeCheckIn(5000)).toBe(true);
  });

  it('print phrase requires the exact quantity', () => {
    expect(requiredPrintPhrase(5000)).toBe('PRINT 5000');
    expect(printPhraseMatches('PRINT 5000', 5000)).toBe(true);
    expect(printPhraseMatches('print 5000', 5000)).toBe(true); // case-insensitive
    expect(printPhraseMatches('  print   5000  ', 5000)).toBe(true); // whitespace-tolerant
    expect(printPhraseMatches('PRINT 500', 5000)).toBe(false); // wrong qty
    expect(printPhraseMatches('PRINT', 5000)).toBe(false);
    expect(printPhraseMatches('', 5000)).toBe(false);
  });

  it('clamp keeps quantities inside [1, backstop] without a low cap', () => {
    expect(clampCheckInQuantity(5000)).toBe(5000); // 500 cap is gone
    expect(clampCheckInQuantity(0)).toBe(1);
    expect(clampCheckInQuantity(Number.NaN)).toBe(1);
    expect(clampCheckInQuantity(MAX_CHECK_IN_QUANTITY + 1)).toBe(MAX_CHECK_IN_QUANTITY);
  });
});
