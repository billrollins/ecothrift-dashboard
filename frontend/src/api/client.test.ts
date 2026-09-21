import { describe, expect, it } from 'vitest';
import { isCardRejection, shouldRedirectToLogin } from './client';

describe('shouldRedirectToLogin', () => {
  it('keeps the hosted kiosk on its own screen', () => {
    expect(shouldRedirectToLogin('/kiosk')).toBe(false);
    expect(shouldRedirectToLogin('/kiosk/')).toBe(false);
    expect(shouldRedirectToLogin('/kiosk/anything')).toBe(false);
  });

  it('sends everyone else to login', () => {
    expect(shouldRedirectToLogin('/dashboard')).toBe(true);
    expect(shouldRedirectToLogin('/clock')).toBe(true);
    expect(shouldRedirectToLogin('/kioskish')).toBe(true);
    expect(shouldRedirectToLogin('/')).toBe(true);
  });
});

describe('isCardRejection', () => {
  it('recognizes a bad kiosk card and nothing else', () => {
    expect(isCardRejection({ code: 'card', detail: 'Card not recognized.' })).toBe(true);
    expect(isCardRejection({ code: 'token_not_valid' })).toBe(false);
    expect(isCardRejection(null)).toBe(false);
    expect(isCardRejection('card')).toBe(false);
  });
});
