import { describe, expect, it } from 'vitest';

import {
  defaultTransformShelfPrice,
  parseRowShelfPrice,
  transformPriceHelperText,
} from './processingTransformPrice';

describe('defaultTransformShelfPrice', () => {
  it('break apart divides row price by subitems per unit', () => {
    expect(defaultTransformShelfPrice('break_apart', 20, 500, null)).toBe('0.04');
  });

  it('make set multiplies row price by set size', () => {
    expect(defaultTransformShelfPrice('make_set', 0.05, null, 500)).toBe('25.00');
  });

  it('returns empty until factor or set size is valid', () => {
    expect(defaultTransformShelfPrice('break_apart', 20, 1, null)).toBe('');
    expect(defaultTransformShelfPrice('make_set', 0.5, null, 1)).toBe('');
  });
});

describe('transformPriceHelperText', () => {
  it('shows divide formula for break apart', () => {
    expect(transformPriceHelperText('break_apart', 20, 500, null)).toContain('÷ 500');
    expect(transformPriceHelperText('break_apart', 20, 500, null)).toContain('$0.04');
  });

  it('shows multiply formula for make set', () => {
    expect(transformPriceHelperText('make_set', 0.05, null, 500)).toContain('× 500');
    expect(transformPriceHelperText('make_set', 0.05, null, 500)).toContain('$25.00');
  });
});

describe('parseRowShelfPrice', () => {
  it('parses numeric strings', () => {
    expect(parseRowShelfPrice('20.00')).toBe(20);
  });

  it('returns null for empty', () => {
    expect(parseRowShelfPrice('')).toBeNull();
  });
});
