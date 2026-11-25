import { describe, expect, it } from 'vitest';
import { packLabel, plural, retitle, scaleAmount, singular, totalPieces, wholeCount } from './packWords';

describe('the pack standard on screen (#224)', () => {
  it('writes units first, then count per unit; a single unit is "100 ct"', () => {
    expect(packLabel(100, 'box', 3)).toBe('3 boxes × 100');
    expect(packLabel(100, '', 1)).toBe('100 ct');
    expect(packLabel(48, 'case', 2)).toBe('2 cases × 48');
    expect(packLabel(null, '', 1)).toBe('');
    expect(plural('pouch', 2)).toBe('pouches');
    expect(singular('Boxes')).toBe('box');
    expect(singular('rolls')).toBe('roll');
  });

  it('scales price from the base: 100 for $1, so 3 boxes of 200 is $6', () => {
    expect(scaleAmount('1.00', 100, totalPieces(200, 3))).toBe('6.00');
    expect(scaleAmount('', 100, 600)).toBe('');
    expect(scaleAmount('$4', 0, 600)).toBe('');
  });

  it('names a new pack from the base title', () => {
    expect(retitle('Tampons Regular Pack of 100', '3 boxes × 200')).toBe('Tampons Regular - 3 boxes × 200');
    expect(retitle('Kleenex Tissues 100 ct', '2 boxes × 100')).toBe('Kleenex Tissues - 2 boxes × 100');
    expect(retitle('Bar stool', '2 ct')).toBe('Bar stool - 2 ct');
  });

  it('reads whole counts only', () => {
    expect(wholeCount('12')).toBe(12);
    expect(wholeCount('0')).toBeNull();
    expect(wholeCount('')).toBeNull();
  });
});
