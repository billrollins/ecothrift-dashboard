import { beforeEach, describe, expect, it, vi } from 'vitest';

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  // client.ts (imported through the mock module) registers interceptors on every instance.
  interceptors: { request: { use: vi.fn(), eject: vi.fn() }, response: { use: vi.fn(), eject: vi.fn() } },
  defaults: { headers: { common: {} } },
}));

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return { ...actual, default: { ...actual.default, create: () => http, isAxiosError: actual.default.isAxiosError } };
});

import * as scanner from './thriftPlusScanner.api';

const lamp = {
  sku: 'ITM1', title: 'Brass floor lamp', category: 'lighting' as const, category_label: 'Lighting', details: [],
  retail_price: null, price: '90.00', reward: '13.00', member_price: '77.00', age_restricted: false, returnable: true,
  available: true,
};

describe('the Thrift+ scanner client', () => {
  beforeEach(() => {
    window.localStorage.clear();
    http.get.mockReset();
    http.post.mockReset();
  });

  it('keeps a guest cart on the phone, with the ThriftBucks a card would collect (no cover, no instant figure)', async () => {
    http.get.mockResolvedValue({ data: { status: 'signed_out' } });
    http.post.mockResolvedValue({ data: {} });
    await scanner.continueAsGuest();
    expect((await scanner.getSession()).status).toBe('guest');
    const cart = await scanner.addToCart(lamp);
    expect(cart.lines).toHaveLength(1);
    expect(cart.totals).toEqual({ item_count: 1, price_total: '90.00', reward_total: '13.00' });
    expect(http.post).toHaveBeenCalledWith('/added/', { sku: 'ITM1' });
    expect((await scanner.getHistory())[0].decision).toBe('added');
  });

  it('asks the server for a member', async () => {
    http.get.mockImplementation(async (url: string) => {
      if (url === '/session/') return { data: { status: 'member', member: { first_name: 'Ana' } } };
      if (url === '/cart/') return { data: { lines: [], totals: { item_count: 0, price_total: '0.00', reward_total: '0.00' } } };
      return { data: { status: 'found', item: lamp } };
    });
    await scanner.getSession();
    expect((await scanner.getCart()).totals.reward_total).toBe('0.00');
    expect(scanner).not.toHaveProperty('setRewardChoice'); // redeeming instantly is at the register (B1)
    expect(await scanner.lookupTag('itm1')).toEqual({ status: 'found', item: lamp });
    expect(http.get).toHaveBeenCalledWith('/tag/ITM1/');
  });

  it('has no card sign-in and no lost-card call (owner 2026-10-14: no card, APP D6)', () => {
    expect(scanner).not.toHaveProperty('signInWithCard');
    expect(scanner).not.toHaveProperty('reportCardLost');
  });

  it('joins, emails a link, and signs in with the link or the code (owner 2026-10-15, APP D9)', async () => {
    http.post.mockImplementation(async (url: string) => {
      if (url === '/join/' || url === '/session/email/') return { data: { status: 'sent' } };
      const purpose = url === '/session/link/' ? 'join' : 'sign_in';
      return { data: { status: 'member', price_first: true, member: { first_name: 'Ana', ready: false, email_verified: true }, purpose } };
    });
    await scanner.continueAsGuest();
    expect(await scanner.joinThriftPlus(' Ana ', ' Diaz ', ' ana@example.com ')).toEqual({ status: 'sent' });
    expect(http.post).toHaveBeenCalledWith('/join/', { first_name: 'Ana', last_name: 'Diaz', email: 'ana@example.com' });
    expect(await scanner.requestSignInEmail('ana@example.com ')).toEqual({ status: 'sent' });
    expect(http.post).toHaveBeenCalledWith('/session/email/', { email: 'ana@example.com' });

    const byLink = await scanner.signInWithLink('tok-1');
    expect(http.post).toHaveBeenCalledWith('/session/link/', { token: 'tok-1' });
    expect(byLink).toMatchObject({ status: 'member', purpose: 'join', member: { first_name: 'Ana', ready: false } });
    expect(window.localStorage.getItem('thriftPlus.real.guest')).toBeNull(); // signed in: no longer scanning without

    const byCode = await scanner.signInWithCode('ana@example.com', ' 123456 ');
    expect(http.post).toHaveBeenCalledWith('/session/code/', { email: 'ana@example.com', code: '123456' });
    expect(byCode.purpose).toBe('sign_in');
  });

  it("carries the server's words and code, and a 429's wait", async () => {
    const fail = (status: number, data: object) => Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status, data, headers: {} } });
    http.post.mockRejectedValueOnce(fail(400, { code: 'CODE_BAD', detail: "That code didn't work. Check it and try again." }));
    await expect(scanner.signInWithCode('a@b.co', '000000')).rejects.toMatchObject({
      message: "That code didn't work. Check it and try again.",
      code: 'CODE_BAD',
    });
    http.post.mockRejectedValueOnce(fail(429, { code: 'TOO_SOON', detail: 'Too many tries. Wait a few minutes and try again.', retry_after: 22 }));
    await expect(scanner.requestSignInEmail('a@b.co')).rejects.toMatchObject({ code: 'TOO_SOON', retryAfter: 22 });
    http.post.mockRejectedValueOnce(fail(400, { code: 'LINK_USED', detail: 'That link has already been used. Send a new one.' }));
    await expect(scanner.signInWithLink('old')).rejects.toMatchObject({ code: 'LINK_USED', message: 'That link has already been used. Send a new one.' });
    http.post.mockRejectedValueOnce(fail(500, {}));
    await expect(scanner.joinThriftPlus('Ana', 'Diaz', 'a@b.co')).rejects.toThrow('Could not send the email. Try again.');
    http.post.mockRejectedValueOnce(Object.assign(new Error('Network Error'), { isAxiosError: true }));
    await expect(scanner.signInWithLink('t')).rejects.toThrow('Could not reach the store. Check your signal and try again.');
  });
});
