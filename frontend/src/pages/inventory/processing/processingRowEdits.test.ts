import { describe, expect, it } from 'vitest';
import {
  fieldsPhrase,
  patchFor,
  pendingFields,
  revertField,
  sameFieldValue,
  savedValuesOf,
  shownValues,
  stageValue,
  type RowEditValues,
} from './processingRowEdits';

const saved: RowEditValues = {
  title: '9V Alkaline Batteries 2-Pack',
  brand: '',
  model: '',
  category: 'Electronics',
  unitRetail: '9.54',
  price: '4.99',
};

describe('changes typed on a manifest row, not saved yet (#230)', () => {
  it('keeps a typed value highlighted, and drops it when it is typed back to what is saved', () => {
    let pending = stageValue({}, saved, 'brand', 'Energizer');
    expect(pending).toEqual({ brand: 'Energizer' });
    pending = stageValue(pending, saved, 'title', 'Energizer MAX 9V 2-Pack');
    expect(pendingFields(pending)).toEqual(['title', 'brand']);
    // Typed back: no longer a change.
    pending = stageValue(pending, saved, 'brand', '');
    expect(pending).toEqual({ title: 'Energizer MAX 9V 2-Pack' });
    expect(shownValues(saved, pending).title).toBe('Energizer MAX 9V 2-Pack');
    expect(shownValues(saved, pending).category).toBe('Electronics');
  });

  it('compares money as numbers: "4.990" is not a change to 4.99', () => {
    expect(stageValue({}, saved, 'price', '4.990')).toEqual({});
    expect(stageValue({}, saved, 'unitRetail', '9.5')).toEqual({ unitRetail: '9.5' });
    expect(sameFieldValue('price', '30', '30.00')).toBe(true);
    expect(sameFieldValue('title', 'a', 'a ')).toBe(false);
  });

  it('the X puts one field back and leaves the others', () => {
    const pending = { title: 'New', brand: 'Acme' };
    expect(revertField(pending, 'title')).toEqual({ brand: 'Acme' });
    expect(revertField(pending, 'price')).toBe(pending);
  });

  it('saves every highlighted field in one request, with the names the server knows', () => {
    expect(patchFor({ title: '  New title ', brand: 'Acme', unitRetail: '12.00', price: '6.00' })).toEqual({
      title: 'New title',
      brand: 'Acme',
      unit_retail: '12.00',
      shelf_price: '6.00',
    });
    // A brand can be emptied; an empty price or retail is not sent.
    expect(patchFor({ brand: '', price: '' })).toEqual({ brand: '' });
  });

  it('knows what Undo puts back after a save', () => {
    expect(savedValuesOf({ brand: 'Acme', price: '6.00' }, saved)).toEqual({ brand: '', price: '4.99' });
  });

  it('names the fields in plain words', () => {
    expect(fieldsPhrase(['title'])).toBe('Title');
    expect(fieldsPhrase(['title', 'brand'])).toBe('Title and Brand');
    expect(fieldsPhrase(['title', 'brand', 'price'])).toBe('Title, Brand and Price');
  });
});
