import { describe, expect, it } from 'vitest';
import { pickTrainingRegister, testTerminalDeviceConfig } from './testTerminal';

const reg = (id: number, code: string, extra: { is_training?: boolean; is_active?: boolean } = {}) => ({
  id, code, name: `Register ${code}`, is_active: true, ...extra,
});

describe('pickTrainingRegister (the test terminal, 2026-10-16)', () => {
  it('picks the training register, never a real one', () => {
    const list = [reg(1, 'REG-01'), reg(2, 'REG-02'), reg(9, 'TRAIN', { is_training: true })];
    expect(pickTrainingRegister(list)?.id).toBe(9);
  });

  it('prefers code TRAIN and skips an inactive training register', () => {
    const list = [
      reg(5, 'OLD-TRAIN', { is_training: true, is_active: false }),
      reg(6, 'PRACTICE', { is_training: true }),
      reg(7, 'TRAIN', { is_training: true }),
    ];
    expect(pickTrainingRegister(list)?.id).toBe(7);
    expect(pickTrainingRegister(list.slice(0, 2))?.id).toBe(6);
  });

  it('is null when there is no training register', () => {
    expect(pickTrainingRegister([reg(1, 'REG-01'), reg(2, 'REG-02')])).toBeNull();
    expect(pickTrainingRegister([])).toBeNull();
  });
});

describe('testTerminalDeviceConfig', () => {
  it('is a register config for TRAIN, built in memory', () => {
    expect(testTerminalDeviceConfig({ id: 9, name: 'Training', code: 'TRAIN' })).toMatchObject({
      deviceType: 'register', registerId: 9, registerName: 'Training', registerCode: 'TRAIN',
    });
  });
});
