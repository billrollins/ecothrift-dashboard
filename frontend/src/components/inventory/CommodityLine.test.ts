import { describe, expect, it } from 'vitest';
import { commodityWords } from './CommodityLine';
import type { ProductStandard } from '../../api/pricingStandards.api';

const base: ProductStandard = { product_id: 1, standard: '', suggested: '', label: '', share: null, price: null };

describe('commodity line words (#180)', () => {
  it('says nothing for an undecided product with no guess, or one marked not a commodity', () => {
    expect(commodityWords(base)).toBeNull();
    expect(commodityWords({ ...base, standard: 'no' })).toBeNull();
  });

  it('gives a marked commodity its steady price and share of retail', () => {
    const w = commodityWords({ ...base, standard: 'name_brand', share: 0.65, price: '6.50' });
    expect(w).toEqual({ lead: 'Commodity, name brand: $6.50 (65% of retail), holds steady', price: '6.50', asking: false });
  });

  it('asks a person when the rules only suggest it', () => {
    const w = commodityWords({ ...base, suggested: 'store_brand', share: 0.55, price: '5.00' });
    expect(w).toEqual({ lead: 'Looks like a commodity, store brand: $5.00 (55% of retail)', price: '5.00', asking: true });
  });

  it('asks for the retail when there is none to price from', () => {
    expect(commodityWords({ ...base, standard: 'store_brand' })?.lead).toBe('Commodity, store brand: holds steady. Enter the retail for its price');
  });
});
