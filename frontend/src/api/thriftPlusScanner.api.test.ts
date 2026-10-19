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

describe('Join v2 client (owner 2026-10-19)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    http.get.mockReset();
    http.post.mockReset();
  });

  it('reads the ways in, and falls back to email only when the server can\'t say', async () => {
    http.get.mockResolvedValueOnce({ data: { google_client_id: 'client-1', phone: true, email: true } });
    expect(await scanner.getSignInOptions()).toEqual({ google_client_id: 'client-1', phone: true, email: true });
    expect(http.get).toHaveBeenCalledWith('/sign-in-options/');
    http.get.mockResolvedValueOnce({ data: { google_client_id: '', phone: 'yes' } });
    expect(await scanner.getSignInOptions()).toEqual({ google_client_id: null, phone: false, email: true });
    http.get.mockRejectedValueOnce(new Error('404'));
    expect(await scanner.getSignInOptions()).toEqual({ google_client_id: null, phone: false, email: true });
  });

  it('sends a code (names only for a join), checks it, signs in with Google, and posts the selfie and the signature', async () => {
    const member = { first_name: 'Ana', ready: false, finish_steps: ['selfie', 'sign'] };
    http.post.mockImplementation(async (url: string) => {
      if (url === '/code/send/') return { data: { status: 'sent', channel: 'sms' } };
      if (url === '/me/selfie/' || url === '/me/signature/') return { data: member };
      return { data: { status: 'member', member, purpose: 'join' } };
    });
    expect(await scanner.sendCode(' 402 555 0123 ', ' Ana ', ' Diaz ')).toEqual({ status: 'sent', channel: 'sms' });
    expect(http.post).toHaveBeenCalledWith('/code/send/', { contact: '402 555 0123', first_name: 'Ana', last_name: 'Diaz' });
    await scanner.sendCode('ana@example.com');
    expect(http.post).toHaveBeenLastCalledWith('/code/send/', { contact: 'ana@example.com' });

    expect(await scanner.checkCode('ana@example.com', ' 123456 ')).toMatchObject({ purpose: 'join', member: { ready: false } });
    expect(http.post).toHaveBeenLastCalledWith('/code/check/', { contact: 'ana@example.com', code: '123456' });
    await scanner.signInWithGoogle('id-token');
    expect(http.post).toHaveBeenLastCalledWith('/google/', { credential: 'id-token' });

    await scanner.uploadSelfie(new Blob(['jpg'], { type: 'image/jpeg' }));
    const [url, body] = http.post.mock.calls.at(-1) ?? [];
    expect(url).toBe('/me/selfie/');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('photo')).toBeInstanceOf(Blob);
    await scanner.signTerms('data:image/png;base64,cG5n', '2026-10-15');
    expect(http.post).toHaveBeenLastCalledWith('/me/signature/', { signature: 'data:image/png;base64,cG5n', terms_version: '2026-10-15' });
  });

  it("carries the server's words for a bad contact and a bad Google token", async () => {
    const fail = (status: number, data: object) => Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status, data, headers: {} } });
    http.post.mockRejectedValueOnce(fail(400, { code: 'CONTACT_BAD', detail: 'Enter a US phone number or an email.' }));
    await expect(scanner.sendCode('nope')).rejects.toMatchObject({ code: 'CONTACT_BAD', message: 'Enter a US phone number or an email.' });
    http.post.mockRejectedValueOnce(fail(400, { code: 'GOOGLE_BAD' }));
    await expect(scanner.signInWithGoogle('x')).rejects.toMatchObject({ code: 'GOOGLE_BAD', message: "Google didn't sign you in. Try again, or use your email or phone." });
  });

  it("says the server's new answers in short, plain words, with a 429's wait", async () => {
    const fail = (status: number, data: object) => Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status, data, headers: {} } });
    const words = async (call: () => Promise<unknown>, status: number, data: object) => {
      http.post.mockRejectedValueOnce(fail(status, data));
      return call().then(() => '', (e: Error) => e.message);
    };
    const jpeg = new Blob(['x'], { type: 'image/jpeg' });
    expect(await words(() => scanner.signInWithGoogle('t'), 403, { code: 'MEMBERSHIP_OFF', detail: 'Account deactivated.' }))
      .toBe('This membership is not active. Ask at the register.');
    expect(await words(() => scanner.uploadSelfie(jpeg), 400, { code: 'NOT_PENDING' })).toBe('Your membership is already finished. Ask at the register to change it.');
    expect(await words(() => scanner.uploadSelfie(jpeg), 400, { code: 'PHOTO_NEEDED' })).toBe('Take your selfie first.');
    expect(await words(() => scanner.uploadSelfie(jpeg), 400, { code: 'PHOTO_BAD' })).toBe("That photo didn't work. Take your selfie again.");
    expect(await words(() => scanner.uploadSelfie(jpeg), 400, { code: 'PHOTO_TOO_BIG' })).toBe('That photo is too big. Take your selfie again.');
    expect(await words(() => scanner.signTerms('x', 'v'), 400, { code: 'SIGNATURE_BAD' })).toBe('The signature did not save. Clear it and sign again.');
    expect(await words(() => scanner.sendCode('a@b.co'), 429, { code: 'TOO_MANY', retry_after: 600 })).toBe('Too many codes. Try again in 10 minutes.');
    expect(await words(() => scanner.sendCode('a@b.co'), 429, { code: 'LOCKED', retry_after: 60 })).toBe('Too many tries. Try again in a minute.');
    expect(await words(() => scanner.checkCode('a@b.co', '123456'), 429, { code: 'LOCKED', retry_after: 900 })).toBe('Too many tries. Try again in 15 minutes.');
    http.post.mockRejectedValueOnce(fail(429, { code: 'LOCKED', retry_after: 900 }));
    await expect(scanner.checkCode('a@b.co', '123456')).rejects.toMatchObject({ code: 'LOCKED', retryAfter: 900 });
  });
});
