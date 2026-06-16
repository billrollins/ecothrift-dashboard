import { describe, expect, it } from 'vitest';
import {
  buildProcessingSearchBlob,
  clickProcessingQueueFilter,
  DEFAULT_QUEUE_FILTER_STATE,
  deriveProcessingRowStatus,
  isSingleScanToken,
  matchesProcessingSearch,
  normalizeUpcToken,
  processingWorkspaceSearchBlob,
  queueFiltersToSegmentsParam,
  rowMatchesStatusSegment,
  rowsMatchingExactUpc,
  rowsMatchingExactSku,
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

  describe('processingWorkspaceSearchBlob (server field)', () => {
    it('uses searchString from API row (lowercased / normalized)', () => {
      const blob = processingWorkspaceSearchBlob({
        searchString: '  Mixer  A  ROW1  ',
      });
      expect(blob).toBe('mixer a row1');
      expect(matchesProcessingSearch(blob, 'mixer row1')).toBe(true);
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
        identifiers: { upc: 'ignored-by-product-wins' },
        product: { upc: '012345678901' as string },
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

  describe('rowsMatchingExactSku (list rows)', () => {
    it('matches list sku without searchString blob', () => {
      const hits = rowsMatchingExactSku([{ sku: 'ET-FOO-001' }, { sku: 'ET-BAR-002' }], 'ET-FOO-001');
      expect(hits).toHaveLength(1);
      expect(hits[0].sku).toBe('ET-FOO-001');
    });

    it('does not fall back to searchString tokens', () => {
      const hits = rowsMatchingExactSku(
        [{ sku: null, searchString: 'foo et-hidden-sku bar' }],
        'et-hidden-sku',
      );
      expect(hits).toHaveLength(0);
    });
  });

  describe('clickProcessingQueueFilter', () => {
    it('defaults to all mode with no active facets', () => {
      expect(DEFAULT_QUEUE_FILTER_STATE).toEqual({ allMode: true, active: [] });
      expect(queueFiltersToSegmentsParam(DEFAULT_QUEUE_FILTER_STATE)).toBeUndefined();
    });

    it('first facet click from all mode selects only that facet', () => {
      const next = clickProcessingQueueFilter(DEFAULT_QUEUE_FILTER_STATE, 'open');
      expect(next).toEqual({ allMode: false, active: ['open'] });
      expect(queueFiltersToSegmentsParam(next)).toBe('open');
    });

    it('adds facets with OR semantics param', () => {
      let state = clickProcessingQueueFilter(DEFAULT_QUEUE_FILTER_STATE, 'open');
      state = clickProcessingQueueFilter(state, 'partial');
      expect(state.active).toEqual(['open', 'partial']);
      expect(queueFiltersToSegmentsParam(state)).toBe('open,partial');
    });

    it('all chip resets to include everything', () => {
      let state = clickProcessingQueueFilter(DEFAULT_QUEUE_FILTER_STATE, 'open');
      state = clickProcessingQueueFilter(state, 'partial');
      state = clickProcessingQueueFilter(state, 'all');
      expect(state).toEqual({ allMode: true, active: [] });
    });

    it('toggling off last facet returns to all mode', () => {
      const onlyOpen = clickProcessingQueueFilter(DEFAULT_QUEUE_FILTER_STATE, 'open');
      const back = clickProcessingQueueFilter(onlyOpen, 'open');
      expect(back).toEqual({ allMode: true, active: [] });
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
          'open',
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
    it('open segment matches any row not fully checked in', () => {
      expect(rowMatchesStatusSegment({ status: 'pending', items: [] }, 'open')).toBe(true);
      expect(rowMatchesStatusSegment({ status: 'partial', items: [] }, 'open')).toBe(true);
      expect(rowMatchesStatusSegment({ status: 'disputed', items: [] }, 'open')).toBe(true);
      expect(rowMatchesStatusSegment({ status: 'checked_in', items: [] }, 'open')).toBe(false);
    });
    it('matches segment via row.status when items[] omitted (lazy list)', () => {
      expect(rowMatchesStatusSegment({ status: 'partial', items: [] }, 'partial')).toBe(true);
      expect(rowMatchesStatusSegment({ status: 'partial', items: [] }, 'open')).toBe(true);
      expect(rowMatchesStatusSegment({ status: 'checked_in', items: [] }, 'open')).toBe(false);
    });
  });
});