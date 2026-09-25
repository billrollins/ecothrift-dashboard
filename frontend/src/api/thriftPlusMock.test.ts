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
  lookupTag,
  mockRewardCents,
  passItem,
  requestPasswordReset,
  setCartQty,
  setRewardChoice,
  shortTitle,
  signIn,
  signInWithCard,
  signOut,
  thriftPlusMockControls,
  toCents,
  type ThriftPlusItemCard,
  type ThriftPlusMember,
} from './thriftPlusMock';

const DRILL = 'TP0000001';
const PATIO = 'TP0000008';

async function found(sku: string): Promise<ThriftPlusItemCard> {
  const r = await lookupTag(sku);
  if (r.status !== 'found') throw new Error(`expected ${sku} to be found`);
  return r.item;
}

function member(coveredCents: number): ThriftPlusMember {
  return {
    first_name: 'Test',
    email: 'test@example.com',
    username: null,
    card_last4: null,
    verified_18: true,
    banked_rewards: '0.00',
    credit_balance: '0.00',
    cover: {
      month: '2026-09',
      amount: '10.00',
      covered: (coveredCents / 100).toFixed(2),
      remaining: ((1000 - coveredCents) / 100).toFixed(2),
      is_covered: coveredCents >= 1000,
      resets_on: '2026-10-01',
    },
  };
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

describe('tag lookup', () => {
  it('finds sample tags without the network and logs the scan to history', async () => {
    const drill = await found(DRILL);
    expect(drill).toMatchObject({ title: 'Cordless Drill Kit', category: 'tools', category_label: 'Tools', price: '60.00', reward: '15.00', member_price: '45.00' });
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

  it('asks bank-or-rebate once per trip (members only) and clears it with the cart', async () => {
    await signIn('dana', 'secret');
    let cart = await addToCart(await found(DRILL));
    expect(cart.reward_choice).toBeNull();
    cart = await setRewardChoice('bank');
    expect(cart.reward_choice).toBe('bank');
    expect(cart.totals.to_bank).toBe('11.40');
    expect(thriftPlusMockControls.signals().at(-1)).toMatchObject({ kind: 'choice', choice: 'bank' });
    const { clearCart } = await import('./thriftPlusMock');
    expect((await clearCart()).reward_choice).toBeNull();
    await continueAsGuest();
    await setRewardChoice('bank');
    expect((await getCart()).reward_choice).toBeNull();
  });

  it('survives a reload (kept on the phone)', async () => {
    await addToCart(await found(DRILL));
    expect((await getCart()).lines[0].item.sku).toBe(DRILL);
  });
});

describe('cart totals and the monthly cover', () => {
  const line = (price: string, reward: string, qty = 1) => ({
    qty,
    item: { price, reward } as ThriftPlusItemCard,
  });

  it('fills what is left of the cover first, then takes the rest off the price', () => {
    const t = computeCartTotals([line('60.00', '15.00'), line('20.00', '2.00', 2)], member(640));
    expect(t).toEqual({
      item_count: 3,
      price_total: '100.00',
      reward_total: '19.00',
      to_cover: '3.60',
      savings: '15.40',
      to_bank: '0.00',
      member_total: '84.60',
    });
  });

  it('takes the whole reward off once the card is covered', () => {
    const t = computeCartTotals([line('60.00', '15.00')], member(1000));
    expect(t.to_cover).toBe('0.00');
    expect(t.member_total).toBe('45.00');
  });

  it('shows a guest what a new member would pay', () => {
    const t = computeCartTotals([line('60.00', '15.00')], null);
    expect(t.to_cover).toBe('10.00');
    expect(t.member_total).toBe('55.00');
  });

  it('banks the rewards past the cover instead of taking them off the price', () => {
    const t = computeCartTotals([line('60.00', '15.00')], member(640), 'bank');
    expect(t).toMatchObject({ to_cover: '3.60', savings: '0.00', to_bank: '11.40', member_total: '60.00' });
    expect(computeCartTotals([line('60.00', '15.00')], null, 'bank').to_bank).toBe('0.00');
  });
});
