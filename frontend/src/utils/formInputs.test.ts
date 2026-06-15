import { describe, expect, it } from 'vitest';
import { formatMoneyInput, normalizeMoneyInput, sanitizeDecimalPaste } from './formInputs';

describe('sanitizeDecimalPaste', () => {
  it('preserves trailing decimal while typing', () => {
    expect(sanitizeDecimalPaste('10.')).toBe('10.');
    expect(sanitizeDecimalPaste('1,234.')).toBe('1234.');
  });

  it('allows leading decimal cents', () => {
    expect(sanitizeDecimalPaste('.5')).toBe('.5');
    expect(sanitizeDecimalPaste('.')).toBe('.');
  });

  it('limits fractional digits to two', () => {
    expect(sanitizeDecimalPaste('12.345')).toBe('12.34');
  });
});

describe('formatMoneyInput', () => {
  it('shows trailing decimal during entry', () => {
    expect(formatMoneyInput('10.')).toBe('10.');
  });
});

describe('normalizeMoneyInput', () => {
  it('formats on blur', () => {
    expect(normalizeMoneyInput('10.')).toBe('10.00');
    expect(normalizeMoneyInput('.5')).toBe('0.50');
  });
});
