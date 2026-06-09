import { describe, expect, it } from 'vitest';
import {
  PROCESSING_QUEUE_TABLE_ROW_HEIGHT,
  processingQueueVirtualTotalHeight,
} from './processingQueueLayout';

describe('processingQueueLayout', () => {
  it('virtual total height scales by fixed row height', () => {
    expect(processingQueueVirtualTotalHeight(0)).toBe(0);
    expect(processingQueueVirtualTotalHeight(100)).toBe(100 * PROCESSING_QUEUE_TABLE_ROW_HEIGHT);
  });
});
