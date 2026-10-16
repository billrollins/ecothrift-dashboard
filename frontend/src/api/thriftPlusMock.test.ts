import { beforeEach, describe, expect, it } from 'vitest';
import {
  addToCart,
  categoryFor,
  computeCartTotals,
  continueAsGuest,
  getCart,
  getHistory,
  getSession,
  itemFromPublic,
  joinThriftPlus,
  lookupTag,
  mockRewardCents,
  passItem,
  requestPasswordReset,
  requestSignInEmail,
  setCartQty,
  shortTitle,
  signIn,
  signInWithCard,
  signInWithCode,
  signInWithLink,
  signOut,
  thriftPlusMockControls,
  toCents,
  type ThriftPlusItemCard,
} from './thriftPlusMock';

const DRILL = 'TP0000001';
const PATIO = 'TP0000008';

async function found(sku: string): Promise<ThriftPlusItemCard> {
  const r = await lookupTag(sku);
  if (r.status !== 'found') throw new Error(`expected ${sku} to be found`);
  return r.item;
}

beforeEach(() => {
  thriftPlusMockControls.reset();
  thriftPlusMockControls.setLatency(0);
});

describe('sign-in (mock)', () => {
  it('starts signed out, signs in with email or username and a password, and signs out', async () => {
    expect((await getSession()).status).toBe('signed_out');
    await expect(signIn('', 'secret')).rejects.toThrow(/email or username/);
    await expect(signIn('dana@example.com', '')).rejects.toThrow(/password/);
    const byEmail = await signIn('Dana@Example.com', 'secret');
    expect(byEmail.status === 'member' && byEmail.member.email).toBe('dana@example.com');
    const byName = await signIn('dana', 'secret');
    expect(byName.status === 'member' && byName.member.username).toBe('dana');
    expect((await signOut()).status).toBe('signed_out');
  });

  it('emails a reset link and signs in with a scanned card plus the phone last 4', async () => {
    await expect(requestPasswordReset('nope')).rejects.toThrow(/email/);
    expect((await requestPasswordReset(' Dana@Example.com ')).sent_to).toBe('dana@example.com');
    await expect(signInWithCard('TP1', '1234')).rejects.toThrow(/card/);
    await expect(signInWithCard('TPC-4821-7', '12')).rejects.toThrow(/last 4/);
    expect((await signInWithCard('TPC-4821-7', '1234')).status).toBe('member');
  });

  it('lets a guest scan', async () => {
    expect((await continueAsGuest()).status).toBe('guest');
  });
});

describe('email sign-in and joining (mock, owner 2026-10-15, APP D9)', () => {
  it('joins pending: the code signs in once, not ready until a register, and a confirmed email gets a sign-in email', async () => {
    await expect(joinThriftPlus(' ', 'Lee', 'robin@example.com')).rejects.toMatchObject({ code: 'NAME_NEEDED' });
    await expect(joinThriftPlus('Robin', ' ', 'robin@example.com')).rejects.toMatchObject({ code: 'NAME_NEEDED' });
    await expect(joinThriftPlus('Robin', 'Lee', 'nope')).rejects.toMatchObject({ code: 'EMAIL_BAD' });
    expect(await joinThriftPlus('Robin', 'Lee', ' Robin@Example.com ')).toEqual({ status: 'sent' });
    const [sent] = thriftPlusMockControls.outbox();
    expect(sent).toMatchObject({ to: 'robin@example.com', purpose: 'join' });
    expect(sent.code).toMatch(/^\d{6}$/);

    const s = await signInWithCode('robin@example.com', sent.code);
    expect(s.purpose).toBe('join');
    expect(s.status === 'member' && s.member).toMatchObject({ first_name: 'Robin', ready: false, email_verified: true, session_kind: 'email' });
    expect((await getSession()).status).toBe('member');
    await expect(signInWithLink(sent.token)).rejects.toMatchObject({ code: 'LINK_USED' });

    await joinThriftPlus('Robin', 'Lee', 'robin@example.com');
    expect(thriftPlusMockControls.outbox().at(-1)?.purpose).toBe('sign_in');
  });

  it('answers the same for any email, kills a code after 5 wrong tries, and a link works once', async () => {
    expect(await requestSignInEmail('dana@example.com')).toEqual({ status: 'sent' });
    const first = thriftPlusMockControls.outbox()[0];
    const wrong = first.code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) await expect(signInWithCode('dana@example.com', wrong)).rejects.toMatchObject({ code: 'CODE_BAD' });
    await expect(signInWithCode('dana@example.com', first.code)).rejects.toMatchObject({ code: 'CODE_EXPIRED' });
    await expect(signInWithLink(first.token)).rejects.toMatchObject({ code: 'LINK_EXPIRED' });
    await expect(signInWithLink('nope')).rejects.toMatchObject({ code: 'LINK_BAD' });

    await requestSignInEmail('dana@example.com');
    const second = thriftPlusMockControls.outbox()[1];
    const s = await signInWithLink(second.token);
    expect(s).toMatchObject({ status: 'member', purpose: 'sign_in', member: { ready: true } });
    await expect(signInWithLink(second.token)).rejects.toMatchObject({ code: 'LINK_USED' });
    await expect(signInWithCode('nobody@example.com', '123456')).rejects.toMatchObject({ code: 'CODE_BAD' });
  });
});

describe('tag lookup', () => {
  it('finds sample tags without the network and logs the scan to history', async () => {
    const drill = await found(DRILL);
    expect(drill).toMatchObject({ title: 'Cordless Drill Kit', category: 'tools', category_label: 'Tools', price: '60.00', reward: '15.00', member_price: '45.00' });
    // The scanner shows only ThriftBucks (B1, V8): no instant figure on the tag.
    expect(drill).not.toHaveProperty('reward_instant');
    expect(drill).not.toHaveProperty('reward_banked');
    const hist = await getHistory();
    expect(hist[0].item.sku).toBe(DRILL);
    expect(hist[0].decision).toBeNull();
    expect(thriftPlusMockControls.signals().map((s) => s.kind)).toEqual(['scan']);
  });

  it('keeps one history row per tag, newest first, with the last decision', async () => {
    await found(DRILL);
    await found('TP0000002');
    await passItem('TP0000002');
    await found(DRILL);
    const hist = await getHistory();
    expect(hist.map((h) => h.item.sku)).toEqual([DRILL, 'TP0000002']);
    expect(hist[1].decision).toBe('passed');
  });
});

describe('mapping a live inventory item', () => {
  const dto = {
    sku: 'ITM0012345',
    title: 'Hamilton Beach 12-Cup Programmable Coffee Maker with Glass Carafe',
    brand: 'Hamilton Beach',
    category: 'Kitchen & Dining',
    price: '24.99',
    status: 'on_shelf',
    condition: 'like_new',
    source: 'purchased',
    estimated_retail_value: '59.99',
    savings_pct: 58.3,
    processing_notes: 'Tested, brews hot',
  };

  it('builds a card with a short title, icon category, details and a 0-80% reward', () => {
    const card = itemFromPublic(dto);
    expect(card.title.length).toBeLessThanOrEqual(28);
    expect(card.title).toBe('Hamilton Beach 12-Cup');
    expect(card.category).toBe('kitchen');
    expect(card.details).toEqual(['Hamilton Beach', 'Like new', 'Tested, brews hot']);
    expect(card.retail_price).toBe('59.99');
    expect(card.available).toBe(true);
    expect(toCents(card.reward)).toBeGreaterThanOrEqual(0);
    expect(toCents(card.reward)).toBeLessThanOrEqual(Math.floor(2499 * 0.8));
    expect(toCents(card.member_price)).toBe(2499 - toCents(card.reward));
  });

  it('marks sold items unavailable, clothing final sale, and hides a retail below our price', () => {
    expect(itemFromPublic({ ...dto, status: 'sold' }).available).toBe(false);
    expect(itemFromPublic({ ...dto, category: 'Clothing', title: 'Denim jacket' }).returnable).toBe(false);
    expect(itemFromPublic({ ...dto, estimated_retail_value: '10.00' }).retail_price).toBeNull();
  });

  it('gives the same tag the same reward every time, always within 0% to 80%', () => {
    expect(mockRewardCents('ITM0000042', 10000)).toBe(mockRewardCents('ITM0000042', 10000));
    for (let i = 0; i < 500; i += 1) {
      const r = mockRewardCents(`ITM${String(i).padStart(7, '0')}`, 10000);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(8000);
      expect(r % 10).toBe(0);
    }
  });

  it('maps free-text categories to icons and cuts titles at a word', () => {
    expect(categoryFor('Power Tools')).toBe('tools');
    expect(categoryFor('Furniture > Chairs')).toBe('furniture');
    expect(categoryFor('')).toBe('other');
    expect(categoryFor('Is that a lamp')).toBe('lighting');
    expect(categoryFor('Womens Dresses')).toBe('clothing');
    expect(shortTitle('Short title')).toBe('Short title');
    expect(shortTitle('One two three four five six seven eight')).toBe('One two three four five six');
    expect(shortTitle('Supercalifragilisticexpialidocious lamp')).toBe('Supercalifragilisticexpialid');
  });
});

describe('cart', () => {
  it('adds once per tag, changes quantity, removes at 0, and marks history', async () => {
    const drill = await found(DRILL);
    await addToCart(drill);
    let cart = await addToCart(drill);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].qty).toBe(1);
    cart = await setCartQty(DRILL, 3);
    expect(cart.totals.item_count).toBe(3);
    expect(cart.totals.price_total).toBe('180.00');
    expect((await getHistory())[0].decision).toBe('added');
    cart = await setCartQty(DRILL, 0);
    expect(cart.lines).toHaveLength(0);
  });

  it('refuses a sold item', async () => {
    await expect(addToCart(await found(PATIO))).rejects.toThrow(/no longer/);
  });

  it('asks nothing about redeeming: a member sees the ThriftBucks the trip collects (B1, V8)', async () => {
    const session = await signIn('dana', 'secret');
    expect(session.status === 'member' && session.member).not.toHaveProperty('cover');
    const cart = await addToCart(await found(DRILL));
    expect(cart).not.toHaveProperty('reward_choice');
    expect(cart.totals).toEqual({ item_count: 1, price_total: '60.00', reward_total: '15.00' });
    const { clearCart } = await import('./thriftPlusMock');
    expect((await clearCart()).totals.item_count).toBe(0);
  });

  it('survives a reload (kept on the phone)', async () => {
    await addToCart(await found(DRILL));
    expect((await getCart()).lines[0].item.sku).toBe(DRILL);
  });
});

describe('trip totals (no cover since 10-12)', () => {
  const line = (price: string, reward: string, qty = 1) => ({
    qty,
    item: { price, reward } as ThriftPlusItemCard,
  });

  it('adds up the units, the tags and every ThriftBuck the trip collects, in full', () => {
    expect(computeCartTotals([line('60.00', '15.00'), line('20.00', '2.00', 2)])).toEqual({
      item_count: 3,
      price_total: '100.00',
      reward_total: '19.00',
    });
  });

  it('is zero for an empty trip', () => {
    expect(computeCartTotals([])).toEqual({ item_count: 0, price_total: '0.00', reward_total: '0.00' });
  });
});
