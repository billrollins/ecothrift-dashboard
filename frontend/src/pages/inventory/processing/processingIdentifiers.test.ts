import { describe, expect, it } from 'vitest';
import {
  draftRowsToIdentifiers,
  identifierLabel,
  identifiersDisplayOrder,
  identifiersToDraftRows,
  normalizeIdentifierKey,
  normalizeIdentifiersObject,
  validateIdentifierDraftRows,
} from './processingIdentifiers';

describe('processingIdentifiers', () => {
  it('normalizes keys to snake_case', () => {
    expect(normalizeIdentifierKey('Vendor Item #')).toBe('vendor_item');
    expect(normalizeIdentifierKey('ASIN')).toBe('asin');
  });

  it('orders common keys first', () => {
    expect(identifiersDisplayOrder(['sku', 'upc', 'asin'])).toEqual(['upc', 'asin', 'sku']);
  });

  it('labels known and custom keys', () => {
    expect(identifierLabel('vendor_item_number')).toBe('Vendor item #');
    expect(identifierLabel('custom_key')).toBe('Custom Key');
  });

  it('round-trips draft rows', () => {
    const raw = { upc: '111', asin: 'B00TEST', custom_ref: 'abc' };
    const rows = identifiersToDraftRows(raw);
    expect(draftRowsToIdentifiers(rows)).toEqual(normalizeIdentifiersObject(raw));
  });

  it('rejects duplicate keys', () => {
    const err = validateIdentifierDraftRows([
      { id: '1', key: 'upc', value: '111' },
      { id: '2', key: 'UPC', value: '222' },
    ]);
    expect(err).toMatch(/Duplicate keys/i);
  });
});
