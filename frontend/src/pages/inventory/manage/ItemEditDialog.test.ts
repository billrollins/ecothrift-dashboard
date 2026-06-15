import { describe, expect, it } from 'vitest';
import type { Item } from '../../../types/inventory.types';
import { isItemEditLocked } from './ItemEditDialog';

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    sku: 'ITM0000001',
    product: 10,
    product_title: 'Test',
    title: 'Test',
    brand: 'Generic',
    product_number: 'PRD-10',
    purchase_order: null,
    manifest_row: null,
    price: '9.99',
    cost: null,
    source: 'purchased',
    status: 'on_shelf',
    condition: 'good',
    specifications: {},
    location: '',
    listed_at: null,
    checked_in_at: null,
    checked_in_by: null,
    sold_at: null,
    sold_for: null,
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('isItemEditLocked', () => {
  it('allows on_shelf items', () => {
    expect(isItemEditLocked(item({ status: 'on_shelf' }))).toBe(false);
  });

  it('blocks sold status', () => {
    expect(isItemEditLocked(item({ status: 'sold' }))).toBe(true);
  });

  it('blocks sold_at even when status is not sold', () => {
    expect(isItemEditLocked(item({ status: 'on_shelf', sold_at: '2026-06-01T00:00:00Z' }))).toBe(true);
  });

  it('blocks scrapped and lost', () => {
    expect(isItemEditLocked(item({ status: 'scrapped' }))).toBe(true);
    expect(isItemEditLocked(item({ status: 'lost' }))).toBe(true);
  });
});
