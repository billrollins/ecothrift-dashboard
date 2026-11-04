import { afterEach, describe, expect, it } from 'vitest';
import {
  clearIdleSignOut,
  deviceKindHeaders,
  peekIdleSignOut,
  rememberIdleSignOut,
} from './client';

describe('deviceKindHeaders', () => {
  afterEach(() => localStorage.clear());

  it('tells the server a register is a register (the longer idle limit)', () => {
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
