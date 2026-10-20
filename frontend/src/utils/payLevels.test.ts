import { describe, expect, it } from 'vitest';
import { DEFAULT_PAY_LEVELS, levelForPay, levelLabel, payWarning } from './payLevels';

describe('pay levels', () => {
  it('puts pay in the level it falls in, and between ranges in the lower one', () => {
    const expected: Record<string, string> = {
      '': 'entry',
      '0': 'entry',
      '14': 'entry',
      '15': 'entry',
      '17': 'entry',
      '17.50': 'entry',
      '17.99': 'entry',
      '18': 'senior',
      '19.50': 'senior',
      '20': 'manager',
      '$27.25': 'manager',
    };
    for (const [pay, level] of Object.entries(expected)) expect(levelForPay(pay)).toBe(level);
  });

  it('warns for a pay outside the level range and not for one inside or not set', () => {
    expect(payWarning('16.50', 'entry')).toBe('');
    expect(payWarning('', 'entry')).toBe('');
    expect(payWarning('18.5', 'entry')).toBe(
      '$18.50 an hour is outside the Entry range ($15 to $17). You can still save it.',
    );
    expect(payWarning('15', 'manager')).toContain('outside the Manager range ($20+)');
    expect(payWarning('17.50', 'entry')).not.toBe(''); // between the ranges is outside both
  });

  it('reads the ranges it is given', () => {
    const levels = DEFAULT_PAY_LEVELS.map((l) => (l.key === 'manager' ? { ...l, min: 22, text: '$22+' } : l));
    expect(levelForPay('21', levels)).toBe('senior');
    expect(levelLabel('manager', levels)).toBe('Manager');
  });
});
