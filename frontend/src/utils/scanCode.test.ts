import { describe, expect, it } from 'vitest';
import { isTagLink, skuFromScan, tagLink, TAG_LINK_BASE } from './scanCode';

describe('skuFromScan (the Thrift+ Perks tag QR link, 2026-10-28)', () => {
  it.each([
    'HTTPS://ECOTHRIFT.US/I/ITM0226342',
    'https://ecothrift.us/i/ITM0226342',
    'https://www.ecothrift.us/I/itm0226342/',
    'ecothrift.us/i/ITM0226342',
    'ECOTHRIFT.US/I/ITM0226342',
    'http://ecothrift.us/i/ITM0226342?utm=x',
    'HTTPS;//ECOTHRIFT.US/I/ITM0226342', // a keyboard scanner on the wrong layout
    '  HTTPS://ECOTHRIFT.US/I/ITM0226342\n',
  ])('%s is ITM0226342', (raw) => {
    expect(isTagLink(raw)).toBe(true);
    expect(skuFromScan(raw)).toBe('ITM0226342');
  });

  it('leaves an old plain-SKU tag, a typed code and other links as they were (trimmed)', () => {
    expect(skuFromScan(' ITM0048211 ')).toBe('ITM0048211');
    expect(skuFromScan('itm0048211')).toBe('itm0048211');
    expect(skuFromScan('012345678905')).toBe('012345678905');
    expect(skuFromScan('https://ecothrift.us/terms')).toBe('https://ecothrift.us/terms');
    expect(skuFromScan('https://example.com/i/ITM0226342')).toBe('https://example.com/i/ITM0226342');
    expect(skuFromScan('https://ecothrift.us/i/ITM0226342/extra')).toBe('https://ecothrift.us/i/ITM0226342/extra');
    expect(skuFromScan(null)).toBe('');
  });

  it('builds the link in capitals (a smaller QR: alphanumeric mode)', () => {
    expect(tagLink(' itm0226342 ')).toBe('HTTPS://ECOTHRIFT.US/I/ITM0226342');
    expect(TAG_LINK_BASE).toBe(TAG_LINK_BASE.toUpperCase());
    expect(skuFromScan(tagLink('ITM0226342'))).toBe('ITM0226342');
  });
});
