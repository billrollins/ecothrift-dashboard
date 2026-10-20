import { afterEach, describe, expect, it } from 'vitest';
import {
  clearIdleSignOut,
  deviceKindHeaders,
  isCardRejection,
  peekIdleSignOut,
  rememberIdleSignOut,
  shouldRedirectToLogin,
} from './client';

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

describe('deviceKindHeaders', () => {
  afterEach(() => localStorage.clear());

  it('tells the server a register or the kiosk is a register (the longer idle limit)', () => {
    expect(deviceKindHeaders('/kiosk')).toEqual({ 'X-Device-Kind': 'register' });
    localStorage.setItem('pos_device_config', JSON.stringify({ deviceType: 'register', configuredAt: 'x' }));
    expect(deviceKindHeaders('/pos/terminal')).toEqual({ 'X-Device-Kind': 'register' });
  });

  it('sends nothing for any other screen, so the 4-hour staff limit applies', () => {
    expect(deviceKindHeaders('/dashboard')).toEqual({});
    localStorage.setItem('pos_device_config', JSON.stringify({ deviceType: 'manager', configuredAt: 'x' }));
    expect(deviceKindHeaders('/dashboard')).toEqual({});
    localStorage.setItem('pos_device_config', 'not json');
    expect(deviceKindHeaders('/dashboard')).toEqual({});
  });
});

describe('idle sign-out notice', () => {
  afterEach(() => clearIdleSignOut());

  it('keeps the server message when the refresh was refused for idleness', () => {
    rememberIdleSignOut({ code: 'IDLE', detail: 'Signed out after 4 hours idle.' });
    expect(peekIdleSignOut()).toBe('Signed out after 4 hours idle.');
    clearIdleSignOut();
    expect(peekIdleSignOut()).toBeNull();
  });

  it('ignores any other failed refresh', () => {
    rememberIdleSignOut({ detail: 'Invalid or expired refresh token.' });
    rememberIdleSignOut(null);
    expect(peekIdleSignOut()).toBeNull();
  });
});
