import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstimateScores as Scores } from '../../types/buying.types';
import EstimateScores from './EstimateScores';

const api = vi.hoisted(() => ({ fetchEstimateScores: vi.fn() }));
vi.mock('../../api/buying.api', () => api);

const ok: Scores = {
  seller: 'target',
  fit_id: 3,
  fitted_at: '2026-11-06T08:05:00Z',
  forward: [],
  fit: {
    status: 'ok',
    scored_trucks: 8,
    young_trucks: 7,
    rates: { whole: { low: 0.24, likely: 0.279, high: 0.345, retail: 235901, trucks: 8, band: 'quartiles' }, categories: {} },
    summary: { trucks: 8, median_miss: 7.3, whole_median_miss: 7.3, worst_miss: 16.6, within_4: 2, mean_signed: -0.4, thin: false },
    scores: [
      {
        po: 318, predicted: 16333, whole_predicted: 16333, actual: 24035, retail: 66395, miss: -11.6, whole_miss: -11.6,
        fill_in_share: 1, ordered: '2026-04-21', first_sale: '2026-05-15', age_days: 174, zero_retail_rows: 0, unlinked_sold: 164,
      },
    ],
    categories: { 'BICYCLES-PHYSICAL FITNESS': { retail: 40000, actual: 15000, trucks: 1 } },
    previous: null,
  },
};

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EstimateScores seller="target" sellerName="Target" />
    </QueryClientProvider>,
  );
}

describe('EstimateScores', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads nothing until opened, then shows the blind test and a truck Bill knows', async () => {
    api.fetchEstimateScores.mockResolvedValue(ok);
    renderIt();
    expect(api.fetchEstimateScores).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'How good is it?' }));
    expect(await screen.findByText(/7.3 points/)).toBeTruthy();
    expect(screen.getByText('318')).toBeTruthy();
    expect(screen.getByText('36.2%')).toBeTruthy(); // what PO 318 sold in its first 90 days
    expect(screen.getByText('24.6%')).toBeTruthy(); // its blind estimate
    expect(screen.getByText(/sold with no manifest row/)).toBeTruthy();
    expect(screen.getByText(/No category is on 3\+ scored trucks yet/)).toBeTruthy();
    expect(screen.getByText(/Forward test: none yet/)).toBeTruthy();
  });

  it('says not yet for a seller without three scored trucks', async () => {
    api.fetchEstimateScores.mockResolvedValue({ ...ok, fit: { status: 'not_yet', scored_trucks: 1, young_trucks: 2 } });
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'How good is it?' }));
    expect(await screen.findByText(/1 trucks have 90 days of selling \(3 needed\)/)).toBeTruthy();
  });
});
