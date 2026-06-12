import { describe, expect, it } from 'vitest';
import type { ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import {
  computeProcessingQueueColumnWidths,
  createProcessingQueueMeasureFonts,
  type MeasureTextWidthFn,
} from './processingQueueColumnLayout';
import {
  PROCESSING_QUEUE_ADDED_CHIP_PX,
  PROCESSING_QUEUE_COL_DEFAULTS,
  PROCESSING_QUEUE_COL_MIN,
  PROCESSING_QUEUE_DUP_CHIP_PX,
} from './processingQueueLayout';

const fonts = createProcessingQueueMeasureFonts('Inter, sans-serif');

/** Stub: width = string length * 8 for predictable tests */
const stubMeasure: MeasureTextWidthFn = (text) => text.length * 8;

function sampleRow(overrides: Partial<ProcessingWorkspaceRowDTO> = {}): ProcessingWorkspaceRowDTO {
  return {
    processing_row_id: 1,
    manifest_row_id: 1,
    rowNum: 1,
    productId: null,
    product: null,
    title: 'Short title',
    brand: 'Acme',
    category: 'Tools',
    qty: 2,
    qtyDispositioned: 1,
    unitRetail: '99.00',
    price: '49.00',
    identifiers: {},
    status: 'pending',
    likelyDuplicateOf: [],
    condition: 'Good',
    dispatch: 'on_shelf',
    sku: null,
    ...overrides,
  };
}

describe('computeProcessingQueueColumnWidths', () => {
  it('returns scaled defaults when rows are empty', () => {
    const layout = computeProcessingQueueColumnWidths([], 900, fonts, stubMeasure);
    const sum = Object.values(layout.cols).reduce((a, b) => a + b, 0);
    expect(sum).toBe(900);
    expect(layout.tableWidth).toBe(900);
  });

  it('returns static defaults when container width is zero', () => {
    const layout = computeProcessingQueueColumnWidths([sampleRow()], 0, fonts, stubMeasure);
    expect(layout.cols).toEqual(PROCESSING_QUEUE_COL_DEFAULTS);
  });

  it('title column is wider than brand', () => {
    const rows = [
      sampleRow({ title: 'A moderately long product title for testing', brand: 'Sony' }),
    ];
    const layout = computeProcessingQueueColumnWidths(rows, 1000, fonts, stubMeasure);
    expect(layout.cols.title).toBeGreaterThan(layout.cols.brand);
  });

  it('expands brand to fit content when viewport has room', () => {
    const longBrand = 'VeryLongBrandNameHereThatShouldExpandTheColumn';
    const rows = [sampleRow({ brand: longBrand })];
    const layout = computeProcessingQueueColumnWidths(rows, 1400, fonts, stubMeasure);
    const expectedMin = Math.ceil(stubMeasure(longBrand, fonts.bodyBrand) + 18);
    expect(layout.cols.brand).toBeGreaterThanOrEqual(expectedMin);
  });

  it('sizes brand from longest row content', () => {
    const rows = [
      sampleRow({ brand: 'A' }),
      sampleRow({ processing_row_id: 2, brand: 'VeryLongBrandNameHere' }),
    ];
    const layout = computeProcessingQueueColumnWidths(rows, 1200, fonts, stubMeasure);
    expect(layout.cols.brand).toBeGreaterThan(PROCESSING_QUEUE_COL_MIN.brand);
  });

  it('title column fills viewport remainder after fixed columns', () => {
    const rows = [sampleRow()];
    const containerWidth = 1000;
    const layout = computeProcessingQueueColumnWidths(rows, containerWidth, fonts, stubMeasure);
    const sum = Object.values(layout.cols).reduce((a, b) => a + b, 0);
    expect(sum).toBe(containerWidth);
  });

  it('never exceeds container width even on narrow viewports', () => {
    const rows = [sampleRow({ brand: 'VeryLongBrandNameHere', category: 'Long Category Name' })];
    const containerWidth = 480;
    const layout = computeProcessingQueueColumnWidths(rows, containerWidth, fonts, stubMeasure);
    const sum = Object.values(layout.cols).reduce((a, b) => a + b, 0);
    expect(sum).toBe(containerWidth);
  });

  it('shrinks title when viewport narrows', () => {
    const rows = [sampleRow({ title: 'A moderately long product title for testing' })];
    const wide = computeProcessingQueueColumnWidths(rows, 1200, fonts, stubMeasure);
    const narrow = computeProcessingQueueColumnWidths(rows, 700, fonts, stubMeasure);
    expect(narrow.cols.title).toBeLessThan(wide.cols.title);
  });

  it('bumps rowNum width when any row is added kind', () => {
    const manifestOnly = computeProcessingQueueColumnWidths(
      [sampleRow()],
      1000,
      fonts,
      stubMeasure,
    );
    const withAdded = computeProcessingQueueColumnWidths(
      [sampleRow({ rowKind: 'added' })],
      1000,
      fonts,
      stubMeasure,
    );
    expect(withAdded.cols.rowNum).toBeGreaterThanOrEqual(
      Math.max(manifestOnly.cols.rowNum, PROCESSING_QUEUE_ADDED_CHIP_PX),
    );
  });

  it('expands category to fit content when viewport has room', () => {
    const longCategory = 'ARTS_AND_CRAFTS_SUPPLIES';
    const rows = [sampleRow({ category: longCategory })];
    const layout = computeProcessingQueueColumnWidths(rows, 1200, fonts, stubMeasure);
    const expectedMin = Math.ceil(stubMeasure(longCategory, fonts.body) + 18);
    expect(layout.cols.category).toBeGreaterThanOrEqual(expectedMin);
  });

  it('includes header labels in column width (category wider than short data)', () => {
    const rows = [sampleRow({ category: 'A' })];
    const layout = computeProcessingQueueColumnWidths(rows, 1000, fonts, stubMeasure);
    const categoryHeaderWidth = stubMeasure('Category', fonts.header) + 18;
    expect(layout.cols.category).toBeGreaterThanOrEqual(Math.ceil(categoryHeaderWidth));
  });

  it('accounts for dup chip slack in title ideal measurement path', () => {
    const withoutDup = computeProcessingQueueColumnWidths(
      [sampleRow({ title: 'Same' })],
      1000,
      fonts,
      stubMeasure,
    );
    const withDup = computeProcessingQueueColumnWidths(
      [sampleRow({ title: 'Same', likelyDuplicateOf: [2] })],
      1000,
      fonts,
      stubMeasure,
    );
    expect(withDup.cols.title).toBeGreaterThanOrEqual(withoutDup.cols.title);
    expect(withDup.cols.title - withoutDup.cols.title).toBeLessThanOrEqual(PROCESSING_QUEUE_DUP_CHIP_PX + 2);
  });

  it('sizes extRetail from unit retail times qty', () => {
    const rows = [sampleRow({ unitRetail: '99.00', qty: 100 })];
    const layout = computeProcessingQueueColumnWidths(rows, 1200, fonts, stubMeasure);
    expect(layout.cols.extRetail).toBeGreaterThanOrEqual(PROCESSING_QUEUE_COL_MIN.extRetail);
    expect(layout.cols.retail).toBeGreaterThanOrEqual(PROCESSING_QUEUE_COL_MIN.retail);
    expect(layout.cols.price).toBeGreaterThanOrEqual(PROCESSING_QUEUE_COL_MIN.price);
  });
});
