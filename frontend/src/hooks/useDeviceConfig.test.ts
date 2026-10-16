import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDeviceConfig } from './useDeviceConfig';

const SAVED = JSON.stringify({
  deviceType: 'register', registerId: 2, registerName: 'Register 2', registerCode: 'REG-02',
  configuredAt: '2026-10-01T12:00:00Z',
});

describe('useDeviceConfig', () => {
  afterEach(() => localStorage.clear());

  it('/pos/terminal reads this computer\'s saved register, as before', () => {
    localStorage.setItem('pos_device_config', SAVED);
    const { result } = renderHook(() => useDeviceConfig());
    expect(result.current.isRegister).toBe(true);
    expect(result.current.registerId).toBe(2);
  });

  it('the test terminal ignores the saved register and leaves it exactly as it was', () => {
    localStorage.setItem('pos_device_config', SAVED);
    const { result } = renderHook(() => useDeviceConfig({ ignoreSaved: true }));
    expect(result.current.config).toBeNull();
    expect(result.current.registerId).toBeNull();
    expect(localStorage.getItem('pos_device_config')).toBe(SAVED);
  });
});
