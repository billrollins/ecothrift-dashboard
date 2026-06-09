import { describe, expect, it } from 'vitest';
import { windowedPageIndices } from './ProcessingQueuePagination';

describe('windowedPageIndices', () => {
  it('shows first three pages on page 1', () => {
    expect(windowedPageIndices(0, 10)).toEqual([0, 1, 2]);
  });

  it('slides window from page 2 onward', () => {
    expect(windowedPageIndices(1, 10)).toEqual([1, 2, 3]);
    expect(windowedPageIndices(2, 10)).toEqual([2, 3, 4]);
    expect(windowedPageIndices(3, 10)).toEqual([3, 4, 5]);
  });

  it('pins to last three pages near the end', () => {
    expect(windowedPageIndices(9, 10)).toEqual([7, 8, 9]);
  });

  it('returns all pages when total is small', () => {
    expect(windowedPageIndices(0, 2)).toEqual([0, 1]);
  });
});
