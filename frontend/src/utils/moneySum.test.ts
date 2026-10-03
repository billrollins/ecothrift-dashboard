import { describe, expect, it } from 'vitest';
import { moneySumDisplay, parseMoneySum, sanitizeMoneySumPaste } from './moneySum';

describe('parseMoneySum', () => {
  it('adds the parts', () => {
    expect(parseMoneySum('412.50+38')).toEqual({ value: 450.5, error: null });
    expect(parseMoneySum('0.1+0.2')).toEqual({ value: 0.3, error: null });
  });
  it('ignores spaces, $ and commas', () => {
    expect(parseMoneySum(' $1,200.00 + 38 ')).toEqual({ value: 1238, error: null });
  });
  it('reads one number', () => {
    expect(parseMoneySum('25')).toEqual({ value: 25, error: null });
    expect(parseMoneySum('.5')).toEqual({ value: 0.5, error: null });
  });
  it('is empty when blank', () => {
    expect(parseMoneySum('')).toEqual({ value: null, error: null });
    expect(parseMoneySum('   ')).toEqual({ value: null, error: null });
  });
  it('names a bad part', () => {
    expect(parseMoneySum('412+abc')).toEqual({ value: null, error: '"abc" is not a number' });
    expect(parseMoneySum('412+')).toEqual({ value: null, error: 'Each part of a sum needs a number' });
    expect(parseMoneySum('-5')).toEqual({ value: null, error: '"-5" is not a number' });
  });
});

describe('moneySumDisplay', () => {
  it('shows the sum when you leave the field', () => {
    expect(moneySumDisplay('412.50+38')).toBe('450.50');
    expect(moneySumDisplay('412+abc')).toBe('412+abc');
    expect(moneySumDisplay('')).toBe('');
  });
});

describe('sanitizeMoneySumPaste', () => {
  it('keeps the plus', () => {
    expect(sanitizeMoneySumPaste('$412.50 + $38')).toBe('412.50+38');
  });
});
