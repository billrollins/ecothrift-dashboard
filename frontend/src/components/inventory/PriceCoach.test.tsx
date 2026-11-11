import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PriceCoach as Coach } from '../../api/priceCoach.api';
import { PriceCoach, coachBasis, coachDays, coachLine, coachMoney, coachNote } from './PriceCoach';

const api = vi.hoisted(() => ({ getPriceCoach: vi.fn(), PRICE_COACH_TIMEOUT_MS: 4000 }));
vi.mock('../../api/priceCoach.api', () => api);

const COACH: Coach = {
  basis: 'product', label: '', n: 13, enough: true,
  sold: { n: 9, low: 12, high: 15, median_days: 14 },
  on_shelf: { n: 4, oldest_days: 140 },
  sitting: { n: 4, min_price: 25, max_price: 40, days: 90 },
  note: null,
  items: [
    { id: 1, sku: 'ITM0001', title: 'Stoneware mug', sold: false, price: 25, sold_for: null, days: 140 },
    { id: 2, sku: 'ITM0002', title: 'Stoneware mug', sold: true, price: 14.99, sold_for: 12, days: 9 },
  ],
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
  it('says what sold, at what, how fast, and what is still sitting', () => {
    expect(coachLine(COACH)).toBe(
      '9 like this sold, most at $12 to $15, in about 2 weeks. 4 priced $25 and up are still on the shelf after 90 days.',
    );
  });

  it('handles one price, one sale, cents and a same-day sale', () => {
    expect(coachLine({ ...COACH, sold: { n: 1, low: 8.45, high: 8.45, median_days: 1 }, sitting: null }))
      .toBe('1 like this sold at $8.45, in 1 day. 4 more are on the shelf, the oldest 140 days.');
    expect(coachLine({ ...COACH, sold: { n: 6, low: 20, high: 20, median_days: 0 }, sitting: { n: 1, min_price: 30, max_price: 30, days: 90 } }))
      .toBe('6 like this sold, most at $20, the same day. 1 priced $30 is still on the shelf after 90 days.');
  });

  it('drops "most" under three sales and counts the rest on the shelf', () => {
    expect(coachLine({ ...COACH, sold: { n: 2, low: 22.76, high: 22.76, median_days: 12 }, sitting: null, on_shelf: { n: 0, oldest_days: 0 } }))
      .toBe('2 like this sold at $22.76, in about 2 weeks.');
  });

  it('gives the tags as a range when what is sitting is not priced above what sold', () => {
    expect(coachLine({ ...COACH, sold: { n: 9, low: 6, high: 19.99, median_days: 14 }, sitting: { n: 5, min_price: 1.75, max_price: 19.99, days: 90 } }))
      .toBe('9 like this sold, most at $6 to $19.99, in about 2 weeks. 5 priced $1.75 to $19.99 are still on the shelf after 90 days.');
  });

  it('says so when nothing has sold yet, and when there is not enough', () => {
    expect(coachLine({ ...COACH, sold: null, sitting: null, on_shelf: { n: 72, oldest_days: 41 } }))
      .toBe('None like this has sold yet. 72 on the shelf, the oldest 41 days.');
    expect(coachLine({ ...COACH, enough: false, basis: '', n: 2 })).toBe('Not enough like this yet.');
  });

  it('names what it rests on and how many items', () => {
    expect(coachBasis(COACH)).toBe('From this same product, 13 items in the last year');
    expect(coachBasis({ basis: 'similar', label: '', n: 9 })).toBe('From similar products, 9 items in the last year');
    expect(coachBasis({ basis: 'category_brand', label: 'Hearth in Kitchen & dining', n: 1200 }))
      .toBe('From Hearth in Kitchen & dining, 1,200 items in the last year');
  });

  it('writes days and money plainly', () => {
    expect([3, 14, 45, 90].map(coachDays)).toEqual(['3 days', 'about 2 weeks', 'about 6 weeks', 'about 3 months']);
    expect([12, 12.5].map(coachMoney)).toEqual(['$12', '$12.50']);
  });

  it('the note names the price and the count, and is empty without one', () => {
    expect(coachNote({ ...COACH, note: { price: 25, n: 5, unsold: 4, days: 60 } }))
      .toBe('Items like this at $25 and up have mostly sat (4 of 5 unsold after 60 days).');
    expect(coachNote(COACH)).toBe('');
  });
});

describe('PriceCoach', () => {
  it('shows the line and what it rests on, and asks with the product and the typed price', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: COACH } });
    show();
    expect(await screen.findByTestId('price-coach-line')).toHaveTextContent('9 like this sold, most at $12 to $15, in about 2 weeks.');
    expect(screen.getByTestId('price-coach-basis')).toHaveTextContent('From this same product, 13 items in the last year. Tap to see them.');
    expect(screen.queryByTestId('price-coach-note')).toBeNull();
    await waitFor(() => expect(api.getPriceCoach).toHaveBeenCalledWith({ product: 7, price: '25.00' }, expect.anything()));
  });

  it('a tap lists the items it rests on', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: COACH } });
    show();
    await userEvent.click(await screen.findByTestId('price-coach'));
    const list = await screen.findByTestId('price-coach-list');
    const rows = within(list).getAllByTestId('price-coach-item');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('On the shelf 140 days');
    expect(rows[1]).toHaveTextContent('Sold for $12, in 9 days');
  });

  it('shows the gentle note when the typed price is in a range that has mostly sat', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: { ...COACH, note: { price: 25, n: 5, unsold: 4, days: 60 } } } });
    show();
    expect(await screen.findByTestId('price-coach-note')).toHaveTextContent('Items like this at $25 and up have mostly sat');
  });

  it('says not enough, with nothing to tap', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: { ...COACH, enough: false, basis: '', n: 2, sold: null, sitting: null, items: [] } } });
    show();
    expect(await screen.findByTestId('price-coach-line')).toHaveTextContent('Not enough like this yet.');
    expect(screen.getByTestId('price-coach').tagName).not.toBe('BUTTON');
  });

  it('an error shows nothing, and is not tried again', async () => {
    api.getPriceCoach.mockRejectedValue(new Error('timeout of 4000ms exceeded'));
    const { container } = show();
    await waitFor(() => expect(api.getPriceCoach).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
    expect(api.getPriceCoach).toHaveBeenCalledTimes(1);
  });

  it('an answer in a shape it does not know shows nothing, and never throws', async () => {
    const odd = { ...COACH, sitting: { n: 4, days: 90 }, sold: { n: 9, low: 12, high: 15 } };
    api.getPriceCoach.mockResolvedValue({ data: { enabled: true, coach: odd } });
    const { container } = show();
    await waitFor(() => expect(api.getPriceCoach).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing with the switch off, without a product, or with no coach', async () => {
    api.getPriceCoach.mockResolvedValue({ data: { enabled: false, coach: null } });
    const off = show();
    await waitFor(() => expect(api.getPriceCoach).toHaveBeenCalled());
    expect(off.container).toBeEmptyDOMElement();
    api.getPriceCoach.mockClear();
    const none = show({ productId: null });
    expect(none.container).toBeEmptyDOMElement();
    expect(api.getPriceCoach).not.toHaveBeenCalled();
  });
});
