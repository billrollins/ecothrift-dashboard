import { describe, expect, it } from 'vitest';
import { localPoint, turnFor } from './portraitLock';

describe('the scanner stays upright on a sideways phone (owner 2026-10-15)', () => {
  it('turns the page back by the screen angle on phones only', () => {
    expect(turnFor(0, true)).toBe(0);
    expect(turnFor(180, true)).toBe(0);
    expect(turnFor(90, true)).toBe(-90);
    expect(turnFor(270, true)).toBe(90);
    expect(turnFor(-90, true)).toBe(90); // older iPhones say -90
    expect(turnFor(90, false)).toBe(0); // tablets and computers are left alone
  });

  it("measures swipes in the phone's own left and right while turned", () => {
    // Turned -90: the phone's "right" is the screen's "up".
    const a = localPoint({ clientX: 100, clientY: 300 }, -90);
    const b = localPoint({ clientX: 100, clientY: 200 }, -90);
    expect(b.x - a.x).toBe(100);
    expect(b.y - a.y).toBe(0);
    // Turned 90: the phone's "right" is the screen's "down".
    const c = localPoint({ clientX: 100, clientY: 200 }, 90);
    const d = localPoint({ clientX: 100, clientY: 300 }, 90);
    expect(d.x - c.x).toBe(100);
    // Upright: unchanged.
    expect(localPoint({ clientX: 5, clientY: 7 }, 0)).toEqual({ x: 5, y: 7 });
  });
});
