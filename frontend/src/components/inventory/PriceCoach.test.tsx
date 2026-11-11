import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceCoach as Coach, PriceCoachShelf } from '../../api/priceCoach.api';
import { PriceCoach, coachBasis, coachDays, coachLine, coachMoney, coachNear, coachOwn, shelfWords, soldWords } from './PriceCoach';

const api = vi.hoisted(() => ({ getPriceCoach: vi.fn(), PRICE_COACH_TIMEOUT_MS: 4000 }));
vi.mock('../../api/priceCoach.api', () => api);

function shelf(over: Partial<PriceCoachShelf> = {}): PriceCoachShelf {
  return { n: 4, oldest_days: 140, min_price: 25, max_price: 40, sitting: 4, sitting_days: 90, ...over };
}

const COACH: Coach = {
  basis: 'product', label: '', n: 13, enough: true,
  sold: { n: 9, low: 12, high: 15, median_days: 14 },
  on_shelf: shelf(),
  own: null,
  near: null,
  sold_groups: [{ title: 'Stoneware mug', price: 12, n: 9, own: true, min_days: 3, max_days: 30, median_days: 14 }],
  shelf_groups: [{ title: 'Stoneware mug', price: 25, n: 4, own: true, min_days: 95, max_days: 140, median_days: 120 }],
  more: { sold: 0, on_shelf: 0 },
};

function show(props: Partial<Parameters<typeof PriceCoach>[0]> = {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PriceCoach productId={7} price="25.00" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.getPriceCoach.mockReset();
});

describe('the words', () => {
  it('names the group, what sold, and everything on the shelf', () => {
    expect(coachLine(COACH)).toBe(
      'This same product: 9 sold, most for $12.00 to $15.00, typically in 14 days. 4 on the shelf now, all over 90 days.',
    );
  });

  it('the parts add up: sold plus on the shelf is the count under the line', () => {
    const many = { ...COACH, n: 117, sold: { n: 8, low: 6.29, high: 6.29, median_days: 21, min: 6.29, max: 6.29 },
      on_shelf: shelf({ n: 109, min_price: 6.29, max_price: 9.74, sitting: 11, oldest_days: 175 }) };
    expect(coachLine(many)).toBe(
      'This same product: 8 sold, all for $6.29, typically in 21 days. 109 on the shelf now, 11 of them over 90 days.',
    );
    expect(many.sold.n + many.on_shelf.n).toBe(many.n);
  });

  it('handles one sale, two sales, all at one price, and a same-day sale', () => {
    expect(soldWords({ n: 1, low: 8.45, high: 8.45, median_days: 1 })).toBe('1 sold for $8.45, in 1 day.');
    expect(soldWords({ n: 2, low: 22.76, high: 22.76, median_days: 12 })).toBe('2 sold for $22.76, in 12 days.');
    expect(soldWords({ n: 6, low: 20, high: 20, median_days: 0 })).toBe('6 sold, most for $20.00, typically the same day.');
    expect(soldWords({ n: 6, low: 20, high: 20, median_days: 0, min: 20, max: 20 })).toBe('6 sold, all for $20.00, typically the same day.');
    expect(soldWords({ n: 2, low: 8, high: 9, median_days: 4, min: 7, max: 10 })).toBe('2 sold for $7.00 to $10.00, in 4 days.');
    expect(soldWords(null)).toBe('None sold yet.');
  });

  it('says the shelf the same way in every state', () => {
    expect(shelfWords(shelf({ n: 5, min_price: 12.99, max_price: 12.99, sitting: 0, oldest_days: 34 })))
      .toBe('5 on the shelf now at $12.99, the oldest 34 days.');
    expect(shelfWords(shelf({ n: 1, min_price: 30, max_price: 30, sitting: 1, oldest_days: 100 })))
      .toBe('1 on the shelf now at $30.00, there over 90 days.');
    expect(shelfWords(shelf({ n: 1, min_price: 9.74, max_price: 9.74, sitting: 0, oldest_days: 28 })))
      .toBe('1 on the shelf now at $9.74, there 28 days.');
    expect(shelfWords(shelf({ n: 0, min_price: null, max_price: null, sitting: 0, oldest_days: 0 }))).toBe('None on the shelf now.');
    expect(shelfWords(null)).toBe('None on the shelf now.');
  });

  it('says how many on the shelf are from this truck, and the tags only when nothing sold', () => {
    expect(shelfWords(shelf({ n: 109, sitting: 11, this_truck: 98 }), { tags: false }))
      .toBe('109 on the shelf now, 98 from this truck, 11 of them over 90 days.');
    expect(shelfWords(shelf({ n: 5, min_price: 12.99, max_price: 12.99, sitting: 0, oldest_days: 34, this_truck: 5 })))
      .toBe('5 on the shelf now at $12.99, all from this truck, the oldest 34 days.');
    expect(coachLine({ ...COACH, sold: null })).toBe('This same product: None sold yet. 4 on the shelf now at $25.00 to $40.00, all over 90 days.');
  });

  it('says not enough in one short line', () => {
    expect(coachLine({ ...COACH, enough: false, basis: '', n: 2 })).toBe('Not enough like this yet.');
  });

  it('a wider group is the other products, in one short line, after the product own record', () => {
    const wide: Coach = {
      ...COACH, basis: 'similar', n: 15,
      own: { n: 2, sold: null, on_shelf: shelf({ n: 2, min_price: 32.49, max_price: 32.49, sitting: 0, oldest_days: 33 }) },
    };
    expect(coachLine(wide)).toBe('Other products like it: 9 sold, most for $12.00 to $15.00, typically in 14 days. 4 on the shelf now.');
    // Own plus others is the count under the line.
    expect(wide.own!.n + wide.sold!.n + wide.on_shelf!.n).toBe(wide.n);
    expect(coachOwn(wide)).toBe('This same product: None sold yet. 2 on the shelf now at $32.49, the oldest 33 days.');
    expect(coachLine({ ...wide, basis: 'category_brand', label: 'Nerf in Toys & games' }).startsWith('Other Nerf in Toys & games: ')).toBe(true);
    expect(coachOwn({ ...wide, own: { n: 0, sold: null, on_shelf: shelf({ n: 0 }) } }))
      .toBe('This same product: no sales or shelf time here yet.');
    expect(coachOwn(COACH)).toBe('');
  });

  it('says how much it rests on', () => {
    expect(coachBasis(COACH)).toBe('13 items, last 12 months');
    expect(coachBasis({ basis: 'similar', n: 9 })).toBe('9 items, this product and ones with close descriptions, last 12 months');
    expect(coachBasis({ basis: 'category_brand', n: 1200 })).toBe('1,200 items, this product and its brand in the category, last 12 months');
  });

  it('writes money and days one way', () => {
    expect([0, 1, 3, 14, 90].map(coachDays)).toEqual(['the same day', '1 day', '3 days', '14 days', '90 days']);
    expect([12, 12.5, 6.29].map(coachMoney)).toEqual(['$12.00', '$12.50', '$6.29']);
  });

  it('answers every typed price with a plain count, whichever way it points', () => {
    expect(coachNear({ ...COACH, n: 117, near: { price: 9.74, low: 8.28, high: 11.2, n: 98, sold: 0, on_shelf: 98, oldest_days: 34 } }))
      .toBe('This product near $9.74 ($8.28 to $11.20): 0 sold, 98 on the shelf now.');
    expect(coachNear({ ...COACH, near: { price: 12, n: 9, sold: 9, on_shelf: 0, oldest_days: 0 } }))
      .toBe('This product near $12.00 ($10.20 to $13.80): 9 sold, 0 on the shelf now.');
    // Nothing tagged near it is a fact too.
    expect(coachNear({ ...COACH, near: { price: 3, low: 2.55, high: 3.45, n: 0, sold: 0, on_shelf: 0, oldest_days: 0 } }))
      .toBe('This product near $3.00 ($2.55 to $3.45): never tagged there yet.');
    expect(coachNear(COACH)).toBe('');
  });
});

describe('PriceCoach', () => {
  it('shows the line and what it rests on, and asks with the product and the typed price', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: COACH } });
    show();
    expect(await screen.findByTestId('price-coach-line')).toHaveTextContent('This same product: 9 sold, most for $12.00 to $15.00');
    expect(screen.getByTestId('price-coach-basis')).toHaveTextContent('13 items, last 12 months.See the items');
    expect(screen.queryByTestId('price-coach-near')).toBeNull();
    expect(screen.queryByTestId('price-coach-own')).toBeNull();
    await waitFor(() => expect(api.getPriceCoach).toHaveBeenCalledWith({ product: 7, price: '25.00', order: undefined }, expect.anything()));
  });

  it('holds its room while it asks, so nothing moves when the answer lands', () => {
    api.getPriceCoach.mockReturnValue(new Promise(() => {}));
    show();
    expect(screen.getByTestId('price-coach-holding')).toBeInTheDocument();
  });

  it('opens a list where the sold rows and the shelf rows are both there, equal items as one row', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: COACH } });
    show();
    await userEvent.click(await screen.findByTestId('price-coach'));
    const list = await screen.findByTestId('price-coach-list');
    expect(within(list).getByText('Sold (9)')).toBeInTheDocument();
    expect(within(list).getByText('On the shelf now (4)')).toBeInTheDocument();
    const rows = within(list).getAllByTestId('price-coach-item');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('9 sold for $12.00, typically in 14 days');
    expect(rows[1]).toHaveTextContent('4 at $25.00, on the shelf 95 to 140 days');
  });

  it('puts the answer to the typed price first, in plain ink, never a warning colour', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: { ...COACH, near: { price: 25, n: 4, sold: 0, on_shelf: 4, oldest_days: 140 } } } });
    show();
    const near = await screen.findByTestId('price-coach-near');
    expect(near).toHaveTextContent('This product near $25.00 ($21.25 to $28.75): 0 sold, 4 on the shelf now.');
    expect(near.compareDocumentPosition(screen.getByTestId('price-coach-line')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(getComputedStyle(near).color).toBe(getComputedStyle(screen.getByTestId('price-coach-line')).color);
  });

  it('puts the product own record over a wider group', async () => {
    const wide: Coach = { ...COACH, basis: 'similar', own: { n: 2, sold: null, on_shelf: shelf({ n: 2, min_price: 32.49, max_price: 32.49, sitting: 0, oldest_days: 33 }) } };
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: wide } });
    show();
    const own = await screen.findByTestId('price-coach-own');
    const line = screen.getByTestId('price-coach-line');
    expect(own).toHaveTextContent('This same product: None sold yet. 2 on the shelf now at $32.49');
    expect(own.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says not enough, with nothing to open', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: { ...COACH, enough: false, basis: '', n: 2, sold: null, on_shelf: null, sold_groups: [], shelf_groups: [] } } });
    show();
    expect(await screen.findByTestId('price-coach-line')).toHaveTextContent('Not enough like this yet.');
    expect(screen.getByTestId('price-coach').tagName).not.toBe('BUTTON');
  });

  it('an error says nothing and keeps its room, so the window does not jump, and is not tried again', async () => {
    api.getPriceCoach.mockRejectedValue(new Error('timeout of 4000ms exceeded'));
    show();
    await waitFor(() => expect(api.getPriceCoach).toHaveBeenCalledTimes(1));
    const empty = await screen.findByTestId('price-coach-empty');
    expect(empty).toBeEmptyDOMElement();
    expect(screen.queryByTestId('price-coach')).toBeNull();
    expect(api.getPriceCoach).toHaveBeenCalledTimes(1);
  });

  it('an answer in a shape it does not know shows nothing, and never throws', async () => {
    const odd = { basis: 'product', label: '', n: 13, enough: true, sold: { n: 9, low: 12, high: 15 }, sitting: { n: 4, days: 90 }, items: [] };
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: odd } });
    show();
    await waitFor(() => expect(api.getPriceCoach).toHaveBeenCalled());
    expect(await screen.findByTestId('price-coach-empty')).toBeEmptyDOMElement();
    expect(screen.queryByTestId('price-coach')).toBeNull();
  });

  it('shows nothing with the switch off, without a product, or with no coach', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: false, coach: null } });
    const off = show();
    await waitFor(() => expect(api.getPriceCoach).toHaveBeenCalled());
    await waitFor(() => expect(off.container).toBeEmptyDOMElement());
    api.getPriceCoach.mockClear();
    const none = show({ productId: null });
    expect(none.container).toBeEmptyDOMElement();
    expect(api.getPriceCoach).not.toHaveBeenCalled();
  });

  it('has no dash characters in its words', () => {
    expect(coachLine(COACH) + coachBasis(COACH)).not.toMatch(new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']'));
  });
});
