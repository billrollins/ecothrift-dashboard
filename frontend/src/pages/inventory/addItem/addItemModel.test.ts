import { describe, expect, it } from 'vitest';
import type { AddItemProduct, CleanUpResponse, TaxonomyCategory } from '../../../api/addItem.api';
import {
  applyCleanUp, editBox, emptyForm, flipMark, hasSomethingToGoOn, specFromForm, textToPairs, typedBoxes, viewAll,
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
    const copied: PickedProduct = { kind: 'new', spec: specFromProduct(product), photos: [] };
    const form = initialCheckIn(copied);
    expect(form.retailFrom).toBe('estimate');
    expect(buildCheckInPayload(copied, { ...form, price: '30' }).retail_source).toBe('estimate');
    expect(buildCheckInPayload(copied, { ...form, price: '30', retail: '80', retailFrom: 'typed' }).retail_source).toBe('typed');
  });

  it('needs a price, and restoration needs its request (a stack is fine)', () => {
    const form = { ...initialCheckIn(existing), price: '' };
    expect(checkInProblems(form)).toEqual(['Enter the price.']);
    const resto = { ...form, price: '30', destination: 'restoration' as const, quantity: '2' };
    expect(checkInProblems(resto)).toEqual(['Pick what it needs.', 'Give the done price.']);
    const ready = { ...resto, needs: ['repair' as const], donePrice: '60' };
    expect(checkInProblems(ready)).toEqual([]);
    expect(buildCheckInPayload(existing, ready).restoration).toEqual({ needs: ['repair'], done_price: '60' });
    expect(buildCheckInPayload(existing, ready).quantity).toBe(2);
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


// Clean up with AI (Dash Updates #96).
const answer = (over: Partial<CleanUpResponse> = {}): CleanUpResponse => ({
  values: {
    title: 'Keurig K-Mini Coffee Maker', short_name: 'Keurig K-Mini', brand: 'Keurig', model: 'K-Mini',
    category: 'Kitchen & dining', subcategory: 'Small appliances', upc: '', condition: 'like_new', price: '18.00',
    retail_estimate: '89.99', tags: ['coffee', 'pod'], identifiers: { mpn: '5000200237' },
    specifications: { Capacity: '6-12 oz', Color: 'Black' },
  },
  filled: ['title', 'short_name', 'brand', 'model', 'category', 'subcategory', 'condition', 'price', 'retail_estimate',
    'tags', 'identifiers', 'specifications'],
  problems: [], confidence: 'high', price_from: 'the AI', model: 'muse-spark-1.3-contributor',
  ...over,
});

describe('Clean up with AI', () => {
  it('needs something to go on: words, a photo, or a filled box', () => {
    expect(hasSomethingToGoOn(emptyForm('ai'), [])).toBe(false);
    expect(hasSomethingToGoOn(emptyForm('ai', '  '), [])).toBe(false);
    expect(hasSomethingToGoOn(emptyForm('ai', 'keurig mini'), [])).toBe(true);
    expect(hasSomethingToGoOn(emptyForm('ai'), [new File(['x'], 'a.jpg', { type: 'image/jpeg' })])).toBe(true);
    expect(hasSomethingToGoOn({ ...emptyForm('ai'), brand: 'Keurig' }, [])).toBe(true);
  });

  it('fills only empty boxes, marks each one, and a typed box always wins', () => {
    const form = { ...emptyForm('typed', 'keurig'), title: 'My Coffee Thing', specifications: 'color: Red' };
    expect(typedBoxes(form, {})).toEqual({ title: 'My Coffee Thing', specifications: { color: 'Red' } });
    const { form: out, marks } = applyCleanUp(form, {}, answer());
    expect(out.title).toBe('My Coffee Thing');                    // even if the server had sent it as filled
    expect(marks.title).toBeUndefined();
    expect([out.brand, out.condition, out.price, out.retail, out.tags]).toEqual(['Keurig', 'like_new', '18.00', '89.99', 'coffee, pod']);
    expect(textToPairs(out.specifications)).toEqual({ color: 'Red', Capacity: '6-12 oz' });   // only the names left out
    expect(marks.brand).toEqual({ ai: 'Keurig', before: '', viewing: 'ai' });
    expect(marks.specifications?.before).toBe('color: Red');
    expect(out.how).toBe('ai');
    expect(out.ai?.draft).toMatchObject({ brand: 'Keurig', retail_estimate: '89.99', confidence: 'high' });
  });

  it('a mark is a way back: flip one, or all; typing in a box makes it yours', () => {
    const start = applyCleanUp(emptyForm('ai', 'keurig'), {}, answer());
    const back = flipMark(start.form, start.marks, 'brand');
    expect([back.form.brand, back.marks.brand?.viewing]).toEqual(['', 'before']);
    const again = flipMark(back.form, back.marks, 'brand');
    expect(again.form.brand).toBe('Keurig');
    const original = viewAll(start.form, start.marks, 'before');
    expect([original.form.title, original.form.price]).toEqual(['', '']);
    expect(viewAll(original.form, original.marks, 'ai').form.title).toBe('Keurig K-Mini Coffee Maker');
    const mine = editBox(start.form, start.marks, 'brand', 'Keurig Dr Pepper');
    expect(mine.marks.brand).toBeUndefined();
    expect(typedBoxes(mine.form, mine.marks)).toEqual({ brand: 'Keurig Dr Pepper' });   // AI values are not "typed"
  });

  it('a second clean-up may change AI boxes but keeps what was there first', () => {
    const first = applyCleanUp(emptyForm('ai', 'keurig'), {}, answer());
    const second = applyCleanUp(first.form, first.marks, answer({
      values: { ...answer().values, title: 'Keurig K-Mini Plus' }, filled: ['title'],
    }));
    expect(second.form.title).toBe('Keurig K-Mini Plus');
    expect(second.marks.title?.before).toBe('');
    expect(second.form.brand).toBe('Keurig');                     // not in this answer: left as it was
  });

  it('the boxes become the product, with the big box kept as its source text', () => {
    const { form } = applyCleanUp(emptyForm('ai', 'Keurig K-Mini, open box'), {}, answer());
    const spec = specFromForm(form);
    expect(spec).toMatchObject({
      title: 'Keurig K-Mini Coffee Maker', retail_estimate: '89.99', tags: ['coffee', 'pod'],
      identifiers: { mpn: '5000200237' }, specifications: { Capacity: '6-12 oz', Color: 'Black' },
      source_text: 'Keurig K-Mini, open box', how: 'ai',
    });
    const picked: PickedProduct = { kind: 'new', spec, photos: [], start: { condition: form.condition, price: form.price } };
    const checkIn = initialCheckIn(picked);
    expect([checkIn.condition, checkIn.price, checkIn.retail, checkIn.retailFrom]).toEqual(['like_new', '18.00', '89.99', 'estimate']);
    expect(newProductProblems(spec, taxonomy)).toEqual([]);
  });
});
