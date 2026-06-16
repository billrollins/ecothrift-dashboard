import { afterEach, describe, expect, it } from 'vitest';

import {
  PROCESSING_RECENT_ROWS_MAX,
  pushProcessingRecentRow,
  readProcessingRecentRows,
} from './processingRecentRows';

describe('processingRecentRows', () => {
  afterEach(() => {
    sessionStorage.clear();
  });

  it('keeps newest first and caps at max entries', () => {
    for (let i = 1; i <= PROCESSING_RECENT_ROWS_MAX + 3; i += 1) {
      pushProcessingRecentRow(7, {
        processingRowId: i,
        rowNum: i,
        title: `Row ${i}`,
      });
    }
    const rows = readProcessingRecentRows(7);
    expect(rows).toHaveLength(PROCESSING_RECENT_ROWS_MAX);
    expect(rows[0]?.processingRowId).toBe(PROCESSING_RECENT_ROWS_MAX + 3);
  });

  it('moves reopened rows to the front', () => {
    pushProcessingRecentRow(1, { processingRowId: 10, rowNum: 10, title: 'Ten' });
    pushProcessingRecentRow(1, { processingRowId: 20, rowNum: 20, title: 'Twenty' });
    pushProcessingRecentRow(1, { processingRowId: 10, rowNum: 10, title: 'Ten again' });
    expect(readProcessingRecentRows(1).map((r) => r.processingRowId)).toEqual([10, 20]);
    expect(readProcessingRecentRows(1)[0]?.title).toBe('Ten again');
  });
});
