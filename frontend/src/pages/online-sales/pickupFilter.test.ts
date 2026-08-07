import { describe, expect, it } from 'vitest';
import { isTodaysPickupRow } from './pickupFilter';

// Local calendar dates - helper compares via toDateString().
const today = new Date(2026, 6, 31, 15, 0, 0);
const todayIso = new Date(2026, 6, 31, 18, 0, 0).toISOString();
const yesterdayIso = new Date(2026, 6, 30, 18, 0, 0).toISOString();

describe('isTodaysPickupRow', () => {
  it('includes ready_for_pickup regardless of dates', () => {
    expect(
      isTodaysPickupRow(
        { status: 'ready_for_pickup', expires_at: yesterdayIso, confirmed_at: yesterdayIso },
        today,
      ),
    ).toBe(true);
  });

  it('includes confirmed with expires_at today', () => {
    expect(
      isTodaysPickupRow(
        { status: 'confirmed', expires_at: todayIso, confirmed_at: yesterdayIso },
        today,
      ),
    ).toBe(true);
  });

  it('includes confirmed with confirmed_at today when expires_at is null', () => {
    expect(
      isTodaysPickupRow(
        { status: 'confirmed', expires_at: null, confirmed_at: todayIso },
        today,
      ),
    ).toBe(true);
  });

  it('excludes confirmed from yesterday with null expires_at', () => {
    expect(
      isTodaysPickupRow(
        { status: 'confirmed', expires_at: null, confirmed_at: yesterdayIso },
        today,
      ),
    ).toBe(false);
  });

  it('excludes confirmed that expires yesterday', () => {
    expect(
      isTodaysPickupRow(
        { status: 'confirmed', expires_at: yesterdayIso, confirmed_at: yesterdayIso },
        today,
      ),
    ).toBe(false);
  });

  it('excludes requested and other statuses', () => {
    expect(
      isTodaysPickupRow(
        { status: 'requested', expires_at: todayIso, confirmed_at: todayIso },
        today,
      ),
    ).toBe(false);
  });
});
