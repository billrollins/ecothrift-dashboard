import { describe, expect, it, vi } from 'vitest';
import { retailCheckFrom, withRetailCheck, type RetailCheckPayload } from './RetailCheckDialog';
import { tagRetailText, toLabelRequest } from './printProcessingLabel';

const check: RetailCheckPayload = {
  code: 'retail_check',
  retail: '999.00',
  price: '9.99',
  reasons: ['Retail is over 6x the tag price.'],
  typical: null,
  typical_from: 0,
  source: 'manifest',
};
const conflict = { response: { status: 409, data: check } };

describe('withRetailCheck', () => {
  it('resends with the answer after a 409 retail check', async () => {
    const send = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce({ ok: true });
    const ask = vi.fn().mockResolvedValue({ retail_check: 'fix', retail: '99.00' });
    const out = await withRetailCheck({ quantity: 1 }, send, ask);
    expect(out).toEqual({ ok: true });
    expect(ask).toHaveBeenCalledWith(check);
    expect(send).toHaveBeenLastCalledWith({ quantity: 1, retail_check: 'fix', retail: '99.00' });
  });

  it('returns null when the processor cancels', async () => {
    const send = vi.fn().mockRejectedValue(conflict);
    const out = await withRetailCheck({ quantity: 1 }, send, vi.fn().mockResolvedValue(null));
    expect(out).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('passes other errors through', async () => {
    const err = { response: { status: 400, data: { detail: 'nope' } } };
    await expect(withRetailCheck({}, vi.fn().mockRejectedValue(err), vi.fn())).rejects.toBe(err);
    expect(retailCheckFrom(err)).toBeNull();
  });
});

describe('retail on the tag', () => {
  it('formats the server value and prints none without one', () => {
    expect(tagRetailText('49.9')).toBe('Retail $49.90');
    expect(tagRetailText(null)).toBeUndefined();
    expect(tagRetailText('0')).toBeUndefined();
  });

  it('sends retail_text only when the server allowed it and the price is unchanged', () => {
    const item = { sku: 'ITM0000001', price: '12.00', product_title: 'Lamp', tag_retail: '40.00' };
    expect(toLabelRequest(item).retail_text).toBe('Retail $40.00');
    expect(toLabelRequest(item, '8.00').retail_text).toBeUndefined();
    expect(toLabelRequest({ ...item, tag_retail: null }).retail_text).toBeUndefined();
  });
});
