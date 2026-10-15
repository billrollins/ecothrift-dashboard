import { beforeEach, describe, expect, it } from 'vitest';
import {
  DIGITAL_RANGE,
  activeLevel,
  chipText,
  clampZoom,
  onLevel,
  pickTele,
  pinchZoom,
  saveTele,
  saveZoom,
  savedTele,
  savedZoom,
  wantsTele,
  zoomLevels,
  zoomText,
} from './cameraZoom';

describe('zoom levels are the phone\'s own (owner 2026-10-15, APP D13)', () => {
  it('shows 1× plus each whole step up to 3×, and .5× only below 1', () => {
    expect(zoomLevels({ min: 1, max: 8 })).toEqual([1, 2, 3]);
    expect(zoomLevels({ min: 0.5, max: 10 })).toEqual([0.5, 1, 2, 3]);
    expect(zoomLevels({ min: 0.6, max: 2.5 })).toEqual([0.6, 1, 2]);
    expect(zoomLevels({ min: 1, max: 1.8 })).toEqual([1]); // nothing to choose: the pill hides
    expect(zoomLevels({ min: 0.3, max: 4 })).toEqual([0.5, 1, 2, 3]);
    expect(zoomLevels(DIGITAL_RANGE)).toEqual([1, 2, 3]);
  });

  it('labels the chips like a phone camera, and the lit chip shows a pinch between levels', () => {
    expect([0.5, 0.6, 1, 2, 3].map(chipText)).toEqual(['.5×', '.5×', '1×', '2×', '3×']);
    expect(zoomText(1.43)).toBe('1.4×');
    expect(zoomText(0.7)).toBe('.7×');
    expect(zoomText(2)).toBe('2×');
    const levels = [0.5, 1, 2, 3];
    expect(activeLevel(levels, 0.5)).toBe(0.5);
    expect(activeLevel(levels, 0.8)).toBe(0.5);
    expect(activeLevel(levels, 0.98)).toBe(1);
    expect(activeLevel(levels, 1.6)).toBe(1);
    expect(activeLevel(levels, 5.2)).toBe(3);
    expect(onLevel(2, 2.02)).toBe(true);
    expect(onLevel(2, 2.3)).toBe(false);
  });

  it('pinches within the range', () => {
    const range = { min: 0.5, max: 8 };
    expect(pinchZoom(1, 100, 150, range)).toBeCloseTo(1.5);
    expect(pinchZoom(2, 100, 10, range)).toBe(0.5);
    expect(pinchZoom(4, 100, 400, range)).toBe(8);
    expect(pinchZoom(2, 0, 100, range)).toBe(2);
    expect(clampZoom(Number.NaN, DIGITAL_RANGE)).toBe(1);
    expect(wantsTele(2.97)).toBe(true);
    expect(wantsTele(2.5)).toBe(false);
  });
});

describe('the last level and the telephoto, remembered on the phone', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps the level', () => {
    expect(savedZoom()).toBeNull();
    saveZoom(2.345);
    expect(savedZoom()).toBe(2.35);
  });

  it('finds the back telephoto by name (iPhone Pro), never a front camera', () => {
    expect(pickTele([
      { kind: 'videoinput', label: 'Front Camera', deviceId: 'f' },
      { kind: 'videoinput', label: 'Back Camera', deviceId: 'b' },
      { kind: 'videoinput', label: 'Back Ultra Wide Camera', deviceId: 'uw' },
      { kind: 'videoinput', label: 'Back Telephoto Camera', deviceId: 't' },
    ])).toBe('t');
    expect(pickTele([{ kind: 'videoinput', label: 'camera2 0, facing back', deviceId: 'a' }])).toBeNull();
    expect(pickTele([{ kind: 'audioinput', label: 'Telephone mic', deviceId: 'm' }])).toBeNull();
    saveTele('t');
    expect(savedTele()).toBe('t');
    saveTele(null);
    expect(savedTele()).toBeNull();
  });
});
