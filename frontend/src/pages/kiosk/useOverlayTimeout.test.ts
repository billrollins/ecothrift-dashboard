// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MS, PICKER_MS, SUCCESS_MS, overlayTimeoutMs, useOverlayTimeout } from './useOverlayTimeout';

describe('useOverlayTimeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('has the agreed durations', () => {
    expect(IDLE_MS).toBe(15_000);
    expect(PICKER_MS).toBe(45_000);
    expect(SUCCESS_MS).toBe(4_000);
  });

  it('fires after the idle window and a tap resets it', () => {
    const onExpire = vi.fn();
    renderHook(() => useOverlayTimeout(true, IDLE_MS, onExpire));
    act(() => vi.advanceTimersByTime(10_000));
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    act(() => vi.advanceTimersByTime(10_000));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(5_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does nothing when inactive or disabled', () => {
    const onExpire = vi.fn();
    const { rerender } = renderHook(
      ({ active, ms }: { active: boolean; ms: number | null }) => useOverlayTimeout(active, ms, onExpire),
      { initialProps: { active: false, ms: IDLE_MS as number | null } },
    );
    act(() => vi.advanceTimersByTime(60_000));
    rerender({ active: true, ms: null });
    act(() => vi.advanceTimersByTime(60_000));
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('switching to the longer picker window restarts the clock', () => {
    const onExpire = vi.fn();
    const { rerender } = renderHook(({ ms }: { ms: number }) => useOverlayTimeout(true, ms, onExpire), {
      initialProps: { ms: IDLE_MS },
    });
    act(() => vi.advanceTimersByTime(14_000));
    rerender({ ms: PICKER_MS });
    act(() => vi.advanceTimersByTime(30_000));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(15_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not stretch the success window when the screen is tapped', () => {
    const onExpire = vi.fn();
    renderHook(() => useOverlayTimeout(true, SUCCESS_MS, onExpire));
    act(() => vi.advanceTimersByTime(3_000));
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    act(() => vi.advanceTimersByTime(1_000));
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

describe('overlayTimeoutMs', () => {
  it('uses 45s while the picker, gate, or wrong sheet is open, and 4s on success', () => {
    expect(overlayTimeoutMs('out', true)).toBe(PICKER_MS);
    expect(overlayTimeoutMs('out', false)).toBe(IDLE_MS);
    expect(overlayTimeoutMs('gate', false)).toBe(PICKER_MS);
    expect(overlayTimeoutMs('wrong', false)).toBe(PICKER_MS);
    expect(overlayTimeoutMs('in', false)).toBe(IDLE_MS);
    expect(overlayTimeoutMs('stale', false)).toBe(IDLE_MS);
    expect(overlayTimeoutMs('success', true)).toBe(SUCCESS_MS);
  });
});
