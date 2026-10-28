import { describe, expect, it } from 'vitest';
import {
  asIsPrices,
  DEFAULT_REQUEST_SETTINGS,
  EMPTY_REQUEST,
  requestFromSaved,
  requestPayload,
  requestProblems,
  toggleNeed,
  valueAtStake,
} from './restorationRequest';

const S = DEFAULT_REQUEST_SETTINGS;

describe('restoration request', () => {
  it('names what is missing, in field order', () => {
    expect(requestProblems(EMPTY_REQUEST)).toEqual(['Pick what it needs.', 'Give the done price.']);
  });

  it('one done price fills every as-is price from the settings', () => {
    let form = { ...EMPTY_REQUEST, donePrice: '110' };
    for (const need of ['test', 'clean', 'assemble', 'repair', 'check_parts'] as const) form = toggleNeed(form, need);
    expect(requestProblems(form)).toEqual([]);
    expect(asIsPrices(form, S).map((p) => [p.ending, p.price])).toEqual([
      ['untested', 55], ['dirty', 77], ['flat_packed', 100], ['broken', 33], ['parts_unchecked', 66],
    ]);
    expect(valueAtStake(form, S)).toBe(77);
    // Untouched prices are left to the server, which fills them with the same settings.
    expect(requestPayload(form)).toEqual({ needs: form.needs, done_price: '110' });
  });

  it('typed and scrap prices win, and an as-is over done is refused', () => {
    const form = { ...toggleNeed(toggleNeed(EMPTY_REQUEST, 'test'), 'repair'), donePrice: '80', asIs: { untested: '30' } };
    expect(asIsPrices(form, S).map((p) => p.price)).toEqual([30, 24]);
    const scrap = { ...form, brokenScrap: true };
    expect(valueAtStake(scrap, S)).toBe(80);
    expect(requestPayload(scrap)).toEqual({ needs: ['test', 'repair'], done_price: '80', as_is: { untested: '30' }, broken_scrap: true });
    expect(requestProblems({ ...form, asIs: { untested: '90' } })).toEqual(["An as-is price can't be more than the done price."]);
  });

  it('toggles a need and reads a saved request back', () => {
    expect(toggleNeed(toggleNeed(EMPTY_REQUEST, 'test'), 'test').needs).toEqual([]);
    expect(requestFromSaved({ needs: ['repair', 'test'], done_price: '50.00', as_is: { broken: '0.00' }, broken_scrap: true }))
      .toEqual({ needs: ['test', 'repair'], donePrice: '50.00', asIs: { broken: '0.00' }, brokenScrap: true });
    expect(requestFromSaved(null)).toEqual(EMPTY_REQUEST);
  });
});
