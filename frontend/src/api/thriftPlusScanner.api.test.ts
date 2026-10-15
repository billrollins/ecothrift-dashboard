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
});
