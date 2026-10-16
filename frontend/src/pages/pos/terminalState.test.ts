import { describe, expect, it } from 'vitest';
import type { Drawer, POSDeviceConfig } from '../../types/pos.types';
import { deriveTerminalState } from './terminalState';

const config: POSDeviceConfig = { deviceType: 'register', registerId: 3, configuredAt: '2026-10-16T00:00:00Z' };
const drawer = (status: 'open' | 'closed', cashier: number) =>
  ({ id: 1, status, current_cashier: cashier } as unknown as Drawer);
const base = { config, isRegister: true, loading: false, cart: null, userId: 7 };

describe('deriveTerminalState', () => {
  it('a real register is unchanged: someone else holding the drawer means take it over', () => {
    expect(deriveTerminalState({ ...base, todayDrawer: drawer('open', 8) })).toBe('drawer_open_other');
    expect(deriveTerminalState({ ...base, todayDrawer: drawer('open', 7) })).toBe('ready');
    expect(deriveTerminalState({ ...base, todayDrawer: null })).toBe('no_drawer');
    expect(deriveTerminalState({ ...base, todayDrawer: drawer('closed', 7) })).toBe('drawer_closed');
    expect(deriveTerminalState({ ...base, config: null, todayDrawer: null })).toBe('unconfigured');
  });

  it('the test terminal shares one practice drawer: anyone is ready on it', () => {
    expect(deriveTerminalState({ ...base, todayDrawer: drawer('open', 8), sharedDrawer: true })).toBe('ready');
    // No drawer or a closed one still shows as such (the page then opens the practice drawer itself).
    expect(deriveTerminalState({ ...base, todayDrawer: null, sharedDrawer: true })).toBe('no_drawer');
    expect(deriveTerminalState({ ...base, todayDrawer: drawer('closed', 8), sharedDrawer: true })).toBe('drawer_closed');
  });
});
