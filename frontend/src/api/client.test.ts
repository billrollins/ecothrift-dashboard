import { describe, expect, it } from 'vitest';
import { shouldRedirectToLogin } from './client';

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
