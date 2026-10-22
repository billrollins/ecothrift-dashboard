import { describe, expect, it } from 'vitest';
import type { AddItemProduct, TaxonomyCategory } from '../../../api/addItem.api';
import {
  buildCheckInPayload, checkInProblems, emptySpec, initialCheckIn, newProductProblems, pctOfRetail, specFromDraft,
  specFromProduct, type PickedProduct,
} from './addItemModel';

const product: AddItemProduct = {
  product_id: 7, product_number: 'PRD-7', title: 'Ninja Professional Blender 1000W', short_name: 'Ninja Blender',
  brand: 'Ninja', model: 'BL610', category: 'Kitchen & dining', subcategory: 'Small appliances', photo_url: null,
  typical_price: '35.00', typical_price_from: 'sold', typical_retail: '99.99', sold: 3, on_shelf: 1, items: 4,
  match: 'text', matched_sku: '',
};
const taxonomy: TaxonomyCategory[] = [
  { name: 'Kitchen & dining', subcategories: ['Small appliances', 'Cookware & bakeware'] },
  { name: 'Mixed lots & uncategorized', subcategories: [] },
];
const existing: PickedProduct = { kind: 'existing', product };

describe('check-in form', () => {
  it('starts on the floor with the product’s usual retail, which is not an estimate', () => {
    const form = initialCheckIn(existing);
    expect([form.destination, form.retail, form.retailFrom, form.quantity]).toEqual(['floor', '99.99', 'product', '1']);
    const payload = buildCheckInPayload(existing, { ...form, price: '35.00' });
    expect(payload).toMatchObject({ product_id: 7, quantity: 1, price: '35.00', retail: '99.99', retail_source: 'typed' });
    expect(payload.new_product).toBeUndefined();
  });

  it('marks a copied or AI retail as an estimate until the person types one', () => {
    const copied: PickedProduct = { kind: 'new', spec: specFromProduct(product), photo: null };
    const form = initialCheckIn(copied);
    expect(form.retailFrom).toBe('estimate');
    expect(buildCheckInPayload(copied, { ...form, price: '30' }).retail_source).toBe('estimate');
    expect(buildCheckInPayload(copied, { ...form, price: '30', retail: '80', retailFrom: 'typed' }).retail_source).toBe('typed');
  });

  it('needs a price, and restoration needs its estimates and one item', () => {
    const form = { ...initialCheckIn(existing), price: '' };
    expect(checkInProblems(form)).toEqual(['Enter the price.']);
    const resto = { ...form, price: '30', destination: 'restoration' as const, quantity: '2' };
    expect(checkInProblems(resto)).toEqual([
      'Restoration takes one item at a time.', 'Pick the work it needs.', 'Give the hours or the parts cost.',
      'Give what it is worth after the work.',
    ]);
    const ready = { ...resto, quantity: '1', work: ['repair' as const], partsCost: '15', valueAfter: '60' };
    expect(checkInProblems(ready)).toEqual([]);
    expect(buildCheckInPayload(existing, ready).restoration).toEqual({
      work: ['repair'], hours: undefined, parts_cost: '15', value_after: '60',
    });
    expect(buildCheckInPayload(existing, { ...ready, quantity: '5' }).quantity).toBe(1);
  });

  it('shows the price as a share of retail', () => {
    expect(pctOfRetail('25', '100')).toBe(25);
    expect(pctOfRetail('25', '')).toBeNull();
  });
});

describe('new product', () => {
  it('copies the near match to edit, keeping where it came from', () => {
    const spec = specFromProduct(product);
    expect(spec).toMatchObject({ title: product.title, brand: 'Ninja', how: 'copy', copied_from: 7, retail_estimate: '99.99' });
    expect(newProductProblems(spec, taxonomy)).toEqual([]);
  });

  it('keeps the AI draft beside the confirmed fields', () => {
    const draft = { title: 'Keurig K-Mini', short_name: 'Keurig K-Mini', brand: 'Keurig', model: 'K-Mini',
      category: 'Kitchen & dining', subcategory: 'Small appliances', retail_estimate: '89.99', confidence: 'high' as const };
    const spec = specFromDraft(draft, 'claude-test');
    expect(spec.ai).toEqual({ model: 'claude-test', draft });
    expect(spec.how).toBe('ai');
  });

  it('uses the taxonomy’s exact names only', () => {
    expect(newProductProblems(emptySpec('typed'), taxonomy)).toEqual(['Give it a title.', 'Pick a category.']);
    const spec = { ...emptySpec('typed', 'Lamp'), category: 'Kitchen & dining', subcategory: 'Blenders' };
    expect(newProductProblems(spec, taxonomy)).toEqual(['Pick a subcategory.']);
    expect(newProductProblems({ ...spec, category: 'Mixed lots & uncategorized', subcategory: '' }, taxonomy)).toEqual([]);
    expect(newProductProblems({ ...spec, subcategory: 'Small appliances', short_name: 'x'.repeat(29) }, taxonomy))
      .toEqual(['The tag name is at most 28 characters.']);
  });
});
