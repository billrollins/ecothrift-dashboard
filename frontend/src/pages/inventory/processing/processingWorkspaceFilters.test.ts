import { describe, expect, it } from 'vitest';
import {
  buildProcessingSearchBlob,
  deriveProcessingRowStatus,
  isSingleScanToken,
  matchesProcessingSearch,
  normalizeUpcToken,
  rowMatchesStatusSegment,
  rowsMatchingExactUpc,
} from './processingWorkspaceFilters';

/** Validation matrix V-07, V-08, V-12 */

describe('processingWorkspaceFilters', () => {
  describe('matchesProcessingSearch (V-07)', () => {
    it('matches when every token appears anywhere in blob', () => {
      const blob = 'kitchenaid 5-speed mixer row4'.toLowerCase();
      expect(matchesProcessingSearch(blob, 'kitchenaid mixer')).toBe(true);
    });

    it('fails when any token missing', () => {
      const blob = 'kitchenaid blender'.toLowerCase();
      expect(matchesProcessingSearch(blob, 'kitchenaid toaster')).toBe(false);
    });

    it('empty query matches', () => {
      expect(matchesProcessingSearch('anything', '   ')).toBe(true);
    });
  });

  describe('buildProcessingSearchBlob (V-08)', () => {
    it('includes title brand model sku rowNum upc for token discovery', () => {
      const blob = buildProcessingSearchBlob({
        rowNum: 12,
        title: 'Foo Blender',
        brand: 'FooCo',
        model: 'X100',
        sku: 'ET-FOO-001',
        identifiers: { upc: '123456789012' },
      });
      expect(matchesProcessingSearch(blob, 'row12')).toBe(true);
      expect(matchesProcessingSearch(blob, 'ET-FOO')).toBe(true);
      expect(matchesProcessingSearch(blob, '123456789012')).toBe(true);
      expect(matchesProcessingSearch(blob, 'FooCo X100')).toBe(true);
    });
  });

  describe('UPC exact match helpers (V-09 / V-10)', () => {
    const rows = [
      {
        manifest_row_id: 1,
        identifiers: { upc: ' 012345678901 ' },
        product: { upc: 'ignored' as string },
      },
      {
        manifest_row_id: 2,
        identifiers: {},
        product: { upc: '012345678901' },
      },
      {
        manifest_row_id: 3,
        identifiers: { upc: '999' },
        product: null as null,
      },
    ];

    it('normalizeUpcToken lowercases and strips spaces', () => {
      expect(normalizeUpcToken('  Hello World ')).toBe('helloworld');
    });

    it('rowsMatchingExactUpc returns every row sharing the normalized UPC', () => {
      const hits = rowsMatchingExactUpc(rows, '012345678901');
      expect(hits.map((h) => h.manifest_row_id).sort()).toEqual([1, 2]);
    });

    it('isSingleScanToken rejects spaced queries', () => {
      expect(isSingleScanToken('012 345')).toBe(false);
      expect(isSingleScanToken('012345')).toBe(true);
    });
  });

  describe('deriveProcessingRowStatus / rowMatchesStatusSegment (V-12)', () => {
    it('pending when all items intake/processing', () => {
      expect(
        deriveProcessingRowStatus([{ status: 'intake' }, { status: 'processing' }]),
      ).toBe('pending');
      expect(
        rowMatchesStatusSegment(
          { items: [{ status: 'intake' }, { status: 'intake' }] },
          'pending',
        ),
      ).toBe(true);
    });

    it('checked_in when all on_shelf', () => {
      expect(deriveProcessingRowStatus([{ status: 'on_shelf' }])).toBe('checked_in');
      expect(
        rowMatchesStatusSegment({ items: [{ status: 'on_shelf' }] }, 'checked_in'),
      ).toBe(true);
    });

    it('partial when mix pending and checked_in', () => {
      expect(
        deriveProcessingRowStatus([{ status: 'intake' }, { status: 'on_shelf' }]),
      ).toBe('partial');
      expect(
        rowMatchesStatusSegment(
          { items: [{ status: 'intake' }, { status: 'on_shelf' }] },
          'partial',
        ),
      ).toBe(true);
    });

    it('disputed when any scrapped or lost', () => {
      expect(
        deriveProcessingRowStatus([{ status: 'intake' }, { status: 'scrapped' }]),
      ).toBe('disputed');
      expect(
        rowMatchesStatusSegment({ items: [{ status: 'lost' }] }, 'disputed'),
      ).toBe(true);
      expect(
        rowMatchesStatusSegment({ items: [{ status: 'intake' }, { status: 'lost' }] }, 'all'),
      ).toBe(true);
    });

    it('disputed segment matches rows with any broken/undelivered item', () => {
      expect(
        rowMatchesStatusSegment(
          { items: [{ status: 'on_shelf' }, { status: 'scrapped' }] },
          'disputed',
        ),
      ).toBe(true);
      expect(
        rowMatchesStatusSegment(
          { items: [{ status: 'on_shelf' }, { status: 'scrapped' }] },
          'checked_in',
        ),
      ).toBe(false);
    });
    it('matches segment via row.status when items[] omitted (lazy list)', () => {
      expect(rowMatchesStatusSegment({ status: 'partial', items: [] }, 'partial')).toBe(true);
      expect(rowMatchesStatusSegment({ status: 'partial', items: [] }, 'pending')).toBe(false);
    });
  });
});