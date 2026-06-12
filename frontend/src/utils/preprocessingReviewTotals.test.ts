import { describe, expect, it } from 'vitest';
import type { PreprocessingReviewRow } from '../api/inventory.api';
import {
  aiBaseOrderTotal,
  exactTargetPrices,
  factorForTargetTotal,
  priceFromRetail,
  scaleFromAiBase,
} from './preprocessingReviewTotals';

function row(partial: Partial<PreprocessingReviewRow> & Pick<PreprocessingReviewRow, 'id' | 'row_number'>): PreprocessingReviewRow {
  return {
    quantity: 1,
    unit_retail: null,
    proposed_price: null,
    final_price: null,
    match_candidates: [],
    final_matched_product: null,
    match_source: '',
    matched_product_detail: null,
    same_product_row_numbers: [],
    ...partial,
  } as PreprocessingReviewRow;
}

describe('preprocessingReviewTotals pricing helpers', () => {
  it('scaleFromAiBase skips null and zero proposed prices', () => {
    expect(scaleFromAiBase(null, 0.85)).toBeNull();
    expect(scaleFromAiBase('', 0.85)).toBeNull();
    expect(scaleFromAiBase('0', 0.85)).toBeNull();
    expect(scaleFromAiBase('10.00', 0.85)).toBe('8.50');
  });

  it('scaleFromAiBase rejects zero and negative factors', () => {
    expect(scaleFromAiBase('10.00', 0)).toBeNull();
    expect(scaleFromAiBase('10.00', -0.5)).toBeNull();
    expect(scaleFromAiBase('10.00', 1.1)).toBe('11.00');
  });

  it('scaleFromAiBase is idempotent for the same factor', () => {
    const first = scaleFromAiBase('12.34', 0.85);
    const second = scaleFromAiBase('12.34', 0.85);
    expect(first).toBe(second);
    expect(first).toBe('10.49');
  });

  it('priceFromRetail computes pct of retail', () => {
    expect(priceFromRetail(null, 30)).toBeNull();
    expect(priceFromRetail('100.00', 30)).toBe('30.00');
  });

  it('priceFromRetail rejects zero and negative pct', () => {
    expect(priceFromRetail('100.00', 0)).toBeNull();
    expect(priceFromRetail('100.00', -50)).toBeNull();
    expect(priceFromRetail('100.00', 25)).toBe('25.00');
  });

  it('exactTargetPrices lands exactly on target with qty-1 rows', () => {
    const rows = [
      row({ id: 1, row_number: 1, final_price: '10.01', quantity: 3 }),
      row({ id: 2, row_number: 2, final_price: '7.77', quantity: 1 }),
      row({ id: 3, row_number: 3, proposed_price: '3.33', quantity: 5 }),
    ];
    const result = exactTargetPrices(rows, {}, 100);
    expect(result).not.toBeNull();
    expect(result!.achieved).toBe(100);
    expect(result!.priced).toBe(3);
    // verify the per-row prices actually sum (price × qty) to the target
    const total =
      Number(result!.prices[1]) * 3 + Number(result!.prices[2]) * 1 + Number(result!.prices[3]) * 5;
    expect(Math.round(total * 100)).toBe(10000);
  });

  it('exactTargetPrices scales current effective prices and skips unpriced rows', () => {
    const rows = [
      row({ id: 1, row_number: 1, final_price: '20.00', quantity: 1 }),
      row({ id: 2, row_number: 2, proposed_price: '30.00', quantity: 1 }),
      row({ id: 3, row_number: 3, quantity: 4 }), // no price at all → skipped
    ];
    const result = exactTargetPrices(rows, {}, 25);
    expect(result).not.toBeNull();
    expect(result!.achieved).toBe(25);
    expect(result!.skipped).toBe(1);
    // 20/50 and 30/50 of $25
    expect(result!.prices[1]).toBe('10.00');
    expect(result!.prices[2]).toBe('15.00');
    expect(result!.prices[3]).toBeUndefined();
  });

  it('exactTargetPrices respects draft overlays as the current price', () => {
    const rows = [row({ id: 1, row_number: 1, final_price: '10.00', quantity: 1 })];
    const result = exactTargetPrices(rows, { 1: { final_price: '50.00' } }, 100);
    expect(result).not.toBeNull();
    expect(result!.prices[1]).toBe('100.00');
    expect(result!.achieved).toBe(100);
  });

  it('exactTargetPrices returns null when nothing is priced', () => {
    expect(exactTargetPrices([row({ id: 1, row_number: 1 })], {}, 100)).toBeNull();
    expect(exactTargetPrices([], {}, 100)).toBeNull();
  });

  it('factorForTargetTotal divides target by AI base total', () => {
    const rows = [
      row({ id: 1, row_number: 1, proposed_price: '10.00', quantity: 2 }),
      row({ id: 2, row_number: 2, proposed_price: '5.00', quantity: 1 }),
    ];
    expect(aiBaseOrderTotal(rows)).toBe(25);
    const factor = factorForTargetTotal(rows, 20);
    expect(factor).toBeCloseTo(0.8);
    expect(scaleFromAiBase('10.00', factor!)).toBe('8.00');
  });

  it('factorForTargetTotal returns null when no AI bases', () => {
    const rows = [row({ id: 1, row_number: 1, proposed_price: null })];
    expect(factorForTargetTotal(rows, 100)).toBeNull();
  });
});
