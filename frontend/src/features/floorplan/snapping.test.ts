import { describe, expect, it } from 'vitest';
import { snapPoint, snapSize, snapValue } from './snapping';

describe('snapValue', () => {
  it('snaps to the nearest multiple', () => {
    expect(snapValue(13.4, 1)).toBe(13);
    expect(snapValue(13.6, 1)).toBe(14);
    expect(snapValue(13, 6)).toBe(12);
    expect(snapValue(16, 6)).toBe(18);
    expect(snapValue(17, 12)).toBe(12);
    expect(snapValue(19, 12)).toBe(24);
  });

  it('is a no-op when snapping is off', () => {
    expect(snapValue(13.37, 0)).toBe(13.37);
    expect(snapValue(13.37, -1)).toBe(13.37);
  });

  it('handles negatives', () => {
    expect(snapValue(-13.4, 1)).toBe(-13);
    expect(snapValue(-16, 6)).toBe(-18);
  });
});

describe('snapPoint', () => {
  it('snaps both axes', () => {
    expect(snapPoint({ x: 13.4, y: 16.9 }, 1)).toEqual({ x: 13, y: 17 });
  });
});

describe('snapSize', () => {
  it('enforces a minimum size', () => {
    expect(snapSize(0.3, 1, 2)).toBe(2);
    expect(snapSize(0, 6, 2)).toBe(6);
    expect(snapSize(47.7, 6, 2)).toBe(48);
  });
});
