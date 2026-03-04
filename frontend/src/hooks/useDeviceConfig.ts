import { useCallback, useSyncExternalStore } from 'react';
import type { POSDeviceConfig, POSDeviceType } from '../types/pos.types';

const STORAGE_KEY = 'pos_device_config';

let lastRaw: string | null = null;
let lastSnapshot: POSDeviceConfig | null = null;

function getSnapshot(): POSDeviceConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === lastRaw) return lastSnapshot;
    lastRaw = raw;
    if (!raw) {
      lastSnapshot = null;
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'deviceType' in parsed &&
      'configuredAt' in parsed
    ) {
      lastSnapshot = parsed as POSDeviceConfig;
      return lastSnapshot;
    }
    lastSnapshot = null;
    return null;
  } catch {
    lastRaw = null;
    lastSnapshot = null;
    return null;
  }
}

const CUSTOM_EVENT = 'pos_device_config_change';

function subscribe(callback: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback();
  };
  const onLocalChange = () => callback();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CUSTOM_EVENT, onLocalChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CUSTOM_EVENT, onLocalChange);
  };
}

export function useDeviceConfig(): {
  config: POSDeviceConfig | null;
  setConfig: (config: POSDeviceConfig | null) => void;
  isRegister: boolean;
  registerId: number | null;
} {
  const config = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setConfig = useCallback((value: POSDeviceConfig | null) => {
    if (value === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }
    window.dispatchEvent(new Event(CUSTOM_EVENT));
  }, []);

  const isRegister = config?.deviceType === 'register';
  const registerId = config?.deviceType === 'register' && config?.registerId != null
    ? config.registerId
    : null;

  return { config, setConfig, isRegister, registerId };
}

export function saveDeviceConfig(
  deviceType: POSDeviceType,
  register?: { id: number; name: string; code: string },
): POSDeviceConfig {
  const configuredAt = new Date().toISOString();
  const config: POSDeviceConfig = {
    deviceType,
    configuredAt,
  };
  if (deviceType === 'register' && register) {
    config.registerId = register.id;
    config.registerName = register.name;
    config.registerCode = register.code;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new Event(CUSTOM_EVENT));
  return config;
}
