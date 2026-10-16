import type { POSDeviceConfig, Register } from '../types/pos.types';

/**
 * The test terminal (/pos/test, owner 2026-10-16): any computer, any time, always on the training register.
 * It never reads or changes the computer's saved device config, so /pos/terminal there keeps its own register.
 */
export const TEST_TERMINAL_TITLE = 'Test terminal — practice only, nothing is real';

/** The training register: the active is_training one (code TRAIN first if there were ever two). */
export function pickTrainingRegister<T extends Pick<Register, 'is_training' | 'is_active' | 'code'>>(
  registers: T[],
): T | null {
  const training = registers.filter((r) => r.is_training && r.is_active !== false);
  return training.find((r) => r.code === 'TRAIN') ?? training[0] ?? null;
}

/** The device config this page uses in memory only. Never saved. */
export function testTerminalDeviceConfig(register: Pick<Register, 'id' | 'name' | 'code'>): POSDeviceConfig {
  return {
    deviceType: 'register',
    registerId: register.id,
    registerName: register.name,
    registerCode: register.code,
    configuredAt: '',
  };
}
