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
  requestSignInCode,
  setCartQty,
  shortTitle,
  signOut,
  thriftPlusMockControls,
  toCents,
  verifySignInCode,
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
    phone_last4: '0123',
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
  it('starts signed out, signs in with a phone and any 4 digits, and signs out', async () => {
    expect((await getSession()).status).toBe('signed_out');
    await expect(requestSignInCode('555')).rejects.toThrow(/10-digit/);
    expect((await requestSignInCode('(402) 555-0123')).sent_to).toContain('0123');
    await expect(verifySignInCode('12')).rejects.toThrow(/4-digit/);
    const s = await verifySignInCode('4321');
    expect(s.status).toBe('member');
    if (s.status === 'member') expect(s.member.phone_last4).toBe('0123');
    expect((await signOut()).status).toBe('signed_out');
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
    expect(card.title.endsWith('…')).toBe(true);
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
    expect(shortTitle('One two three four five six seven eight')).toBe('One two three four five six…');
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
});
