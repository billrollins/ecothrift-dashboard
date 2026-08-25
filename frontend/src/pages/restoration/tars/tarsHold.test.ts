import { describe, expect, it } from 'vitest';
import {
  deriveHoldLabel,
  holdHasSubstance,
  pendingFromLegacyReason,
  purchaseHoldReady,
} from './tarsHold';

describe('hold payload', () => {
  it('names the purchase sections and the wait in the rail label', () => {
    expect(
      deriveHoldLabel({
        needsPurchased: ['parts', 'ffe'],
        waitFor: { space: 'R3' },
        withOtherItems: null,
      }),
    ).toBe('Needs Parts, FFE · Wait: space');
  });

  it('maps a legacy parts hold onto Needs Parts', () => {
    expect(pendingFromLegacyReason('parts_needed').needsPurchased).toEqual(['parts']);
  });

  it('is empty until something is actually set', () => {
    expect(holdHasSubstance({ needsPurchased: [], waitFor: {}, withOtherItems: null })).toBe(false);
    expect(holdHasSubstance({ needsPurchased: ['supplies'], waitFor: {}, withOtherItems: null })).toBe(true);
    expect(holdHasSubstance({ needsPurchased: [], waitFor: { other: 'matching lid' }, withOtherItems: null })).toBe(true);
  });

  it('names other in the rail label', () => {
    expect(
      deriveHoldLabel({
        needsPurchased: [],
        waitFor: { other: 'matching lid' },
        withOtherItems: null,
      }),
    ).toBe('Wait: other');
  });

  it('is ready only when every requested purchase section has arrived', () => {
    expect(
      purchaseHoldReady({
        reason: 'Needs Parts, FFE',
        needsPurchased: ['parts', 'ffe'],
        notes: '',
        storageLocation: '',
        pendingStartedAt: '',
        receivedSections: ['parts'],
      }),
    ).toBe(false);
    expect(
      purchaseHoldReady({
        reason: 'Needs Parts, FFE',
        needsPurchased: ['parts', 'ffe'],
        notes: '',
        storageLocation: '',
        pendingStartedAt: '',
        receivedSections: ['parts', 'ffe'],
      }),
    ).toBe(true);
    expect(
      purchaseHoldReady({
        reason: 'Wait: time',
        needsPurchased: [],
        notes: '',
        storageLocation: '',
        pendingStartedAt: '',
        partsReceived: true,
      }),
    ).toBe(false);
  });
});
