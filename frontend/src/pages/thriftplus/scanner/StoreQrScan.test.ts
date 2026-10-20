import { describe, expect, it } from 'vitest';
import { signInTokenOf } from './StoreQrScan';

describe("the store's sign-in QR (owner 2026-10-20)", () => {
  it('reads the token from ecothrift.us/scan?signin=', () => {
    expect(signInTokenOf('https://ecothrift.us/scan?signin=AbC_123-x')).toBe('AbC_123-x');
    expect(signInTokenOf(' https://www.ecothrift.us/scan?signin=tok ')).toBe('tok');
  });

  it('ignores member QRs, other sites and plain text', () => {
    expect(signInTokenOf('TP402155831907')).toBe('');
    expect(signInTokenOf('https://example.com/scan?signin=tok')).toBe('');
    expect(signInTokenOf('https://ecothrift.us/join')).toBe('');
  });
});
