import { describe, expect, it } from 'vitest';
import type { ProductReviewRow } from '../../api/productReview.api';
import { reviewReason } from './ProductReviewPage';

function row(fields: Partial<ProductReviewRow>): ProductReviewRow {
  return {
    product_id: 1,
    title: 't',
    brand: 'b',
    dollars: '10',
    confidence: 'medium',
    proposed: { category: 'Tools & hardware' },
    second_opinion: {},
    current: {},
    ...fields,
  };
}

describe('reviewReason', () => {
  it('says why a product is in the queue', () => {
    expect(reviewReason(row({ second_opinion: { category: 'Storage & organization' } }))).toBe(
      'Models disagree: second opinion says Storage & organization'
    );
    expect(reviewReason(row({ proposed: { category: 'Tools & hardware', flags: ['vague_title'] } }))).toBe(
      'Title too vague to be sure'
    );
    expect(reviewReason(row({ confidence: 'low' }))).toBe('Confidence low');
  });
});
