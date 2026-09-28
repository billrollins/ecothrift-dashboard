import { describe, expect, it } from 'vitest';
import { isThriftCardCode, thriftCardCode } from './thriftPlusCard';

// 7992739871 + 3 is the textbook Luhn example; pad to 12 digits with a valid check digit.
const CODE = '100000000008';

describe('Thrift+ card scans', () => {
  it('checks the Luhn digit', () => {
    expect(isThriftCardCode(CODE)).toBe(true);
    expect(isThriftCardCode('100000000009')).toBe(false);
    expect(isThriftCardCode('12345')).toBe(false);
  });

  it('reads a TP scan always, and bare digits only when Thrift+ is live', () => {
    expect(thriftCardCode(`TP${CODE}`, false)).toBe(CODE);
    expect(thriftCardCode('tp1000-0000-0008', false)).toBe(CODE);
    expect(thriftCardCode('1000 0000 0008', false)).toBeNull();
    expect(thriftCardCode('1000 0000 0008', true)).toBe(CODE);
    expect(thriftCardCode('ITM0001234', true)).toBeNull();
    expect(thriftCardCode('CUS-12', true)).toBeNull();
  });
});
