import { afterEach, describe, expect, it } from 'vitest';
import {
  canClaimNow,
  forgetReceiptClaim,
  keepAfterRefusal,
  localDay,
  pendingReceiptClaim,
  rememberReceiptClaim,
} from './receiptClaim';

const TOKEN = '2N9ABCDEFGHIJKL';

describe('a non-member receipt claim kept on the phone (owner 2026-11-20, #204)', () => {
  afterEach(() => forgetReceiptClaim());

  it('keeps the token for the same day only', () => {
    const today = new Date(2026, 10, 20, 15, 0);
    expect(rememberReceiptClaim(TOKEN.toLowerCase(), today)).toBe(true);
    expect(pendingReceiptClaim(new Date(2026, 10, 20, 23, 59))).toBe(TOKEN);
    expect(pendingReceiptClaim(new Date(2026, 10, 21, 0, 1))).toBeNull(); // the next day: dropped
    expect(pendingReceiptClaim(today)).toBeNull();
  });

  it('ignores anything that is not a token', () => {
    for (const junk of ['', null, 'short', 'has space in it now', '<script>alert(1)</script>', 'Z'.repeat(40)]) {
      expect(rememberReceiptClaim(junk)).toBe(false);
    }
    expect(pendingReceiptClaim()).toBeNull();
  });

  it('claims only for a member who finished joining', () => {
    expect(canClaimNow({ status: 'member', member: { ready: true } })).toBe(true);
    expect(canClaimNow({ status: 'member', member: { ready: false } })).toBe(false); // finish joining first
    expect(canClaimNow({ status: 'signed_out' })).toBe(false);
    expect(canClaimNow({ status: 'guest' })).toBe(false);
    expect(canClaimNow(null)).toBe(false);
  });

  it('keeps the token while the join is unfinished or offline; any other refusal is final', () => {
    expect(keepAfterRefusal('NOT_FINISHED')).toBe(true);
    expect(keepAfterRefusal(undefined)).toBe(true);
    for (const code of ['TOO_LATE', 'ALREADY_CLAIMED', 'NOT_NEW', 'NOT_CLAIMABLE', 'BAD_TOKEN', 'NOTHING']) {
      expect(keepAfterRefusal(code)).toBe(false);
    }
  });

  it('names the day by the phone clock', () => {
    expect(localDay(new Date(2026, 0, 5, 9))).toBe('2026-01-05');
  });
});
