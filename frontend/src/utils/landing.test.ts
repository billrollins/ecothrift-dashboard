import { afterEach, describe, expect, it } from 'vitest';
import { landingPath } from './landing';

const REGISTER = JSON.stringify({ deviceType: 'register', registerId: 1, configuredAt: '2026-10-21T12:00:00Z' });

describe('landingPath', () => {
  afterEach(() => localStorage.clear());

  it('a cashier on a register starts at the Terminal', () => {
    localStorage.setItem('pos_device_config', REGISTER);
    expect(landingPath({ role: 'Employee', is_superuser: false })).toBe('/pos/terminal');
  });

  it('managers, the owner and cashiers on other computers start at the Dashboard', () => {
    localStorage.setItem('pos_device_config', REGISTER);
    expect(landingPath({ role: 'Manager', is_superuser: false })).toBe('/dashboard');
    expect(landingPath({ role: 'Employee', is_superuser: true })).toBe('/dashboard');
    localStorage.clear();
    expect(landingPath({ role: 'Employee', is_superuser: false })).toBe('/dashboard');
    expect(landingPath(null)).toBe('/dashboard');
  });
});
