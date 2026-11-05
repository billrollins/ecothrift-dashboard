import { describe, expect, it } from 'vitest';
import { buyNowText, listedText } from './AuctionDetailsInfoCard';

const now = new Date('2026-11-05T18:00:00Z');

describe('Dash #75 detail words', () => {
  it('shows Buy Now only while its window is open', () => {
    expect(buyNowText('10750.00', '2026-11-05T21:00:00Z', now)).toMatch(/^\$10,750\.00 until /);
    expect(buyNowText('10750.00', '2026-11-05T17:00:00Z', now)).toBe('Ended');
    expect(buyNowText(null, '2026-11-05T21:00:00Z', now)).toBe('-');
    expect(buyNowText('500.00', null, now)).toBe('-');
  });

  it('says how long ago B-Stock listed the lot, and when it stopped', () => {
    expect(listedText('2026-11-05T17:52:00Z', now)).toBe('8 min ago');
    expect(listedText('2026-11-05T16:30:00Z', now)).toBe('1 h 30 min ago');
    expect(listedText('2026-11-05T14:00:00Z', now)).toBe('No longer listed');
    expect(listedText(null, now)).toBe('Not seen yet');
  });
});
