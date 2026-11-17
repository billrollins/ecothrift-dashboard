import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AdDraft } from '../../../api/marketing.api';
import { AdResultsDialog } from './AdResultsDialog';
import { addRow, fromRows, shortKey, toRows, weightOptions, weightProblem } from './adResultsModel';

const api = vi.hoisted(() => ({ readAdPaste: vi.fn(), saveAd: vi.fn() }));
vi.mock('../../../api/marketing.api', async (orig) => ({ ...(await orig<object>()), ...api }));
vi.mock('../../../api/addItem.api', () => ({
  getAddItemTaxonomy: () => Promise.resolve([
    { name: 'Toys & games', subcategories: ['Board games & puzzles', 'Figures'] },
    { name: 'Mixed lots & uncategorized', subcategories: [] },
  ]),
}));

const GAMES = 'Toys & games › Board games & puzzles';
const DRAFT: AdDraft = {
  start: '2026-11-13', end: '2026-11-17', spent: '99.60', daily_budget: '25.00', goal: 'Get more engagement',
  ad_type: 'Boosted Facebook post', channel: 'facebook', results: { reach: 11221, link_clicks: 517 },
  audience: { location: 'Omaha (+35 mi)', women_pct: 80, men_pct: 20 }, post_text: 'Game Night!!!',
  weights: { [GAMES]: 90, 'Toys & games › Figures': 10 },
};

function wrap(node: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
}

describe('ad weights', () => {
  it('sum to 100 or are ALL', () => {
    expect(toRows({ ALL: 100 })).toEqual([]);
    expect(fromRows([])).toEqual({ ALL: 100 });
    expect(weightProblem([])).toBe('');
    expect(weightProblem([{ key: GAMES, pct: '80' }, { key: 'Toys & games', pct: '10' }])).toMatch(/add up to 90%/);
    expect(weightProblem([{ key: GAMES, pct: '100' }])).toBe('');
    expect(weightProblem([{ key: '', pct: '100' }])).toMatch(/Pick a category/);
    expect(weightProblem([{ key: GAMES, pct: '50' }, { key: GAMES, pct: '50' }])).toMatch(/twice/);
    expect(addRow([{ key: GAMES, pct: '70' }])[1]).toEqual({ key: '', pct: '30' });
    expect(shortKey(GAMES)).toBe('Board games & puzzles');
    expect(weightOptions([{ name: 'Toys & games', subcategories: ['Figures'] }, { name: 'Mixed lots & uncategorized', subcategories: [] }]))
      .toEqual(['Toys & games', 'Toys & games › Figures']);
  });
});

describe('AdResultsDialog', () => {
  it('reads the paste into one card, asks for photos when no post matches, and saves', async () => {
    api.readAdPaste.mockResolvedValue({
      draft: DRAFT, model: 'muse', match: { ad_id: null, post_id: null, post_label: '', need_photos: true, need_text: false },
    });
    api.saveAd.mockResolvedValue({ ...DRAFT, id: 7, post_id: null, post_label: '', photo_ids: [], read: null });
    wrap(<AdResultsDialog open onClose={() => {}} />);
    expect(screen.getByText('The ad shows here.')).toBeTruthy();
    fireEvent.change(screen.getByTestId('ad-paste'), { target: { value: 'View results Performance $99.60 spent over 4 days.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    await screen.findByText('New ad');
    expect((screen.getByLabelText('Spent $') as HTMLInputElement).value).toBe('99.60');
    expect((screen.getByLabelText('Reach') as HTMLInputElement).value).toBe('11221');
    expect(screen.getByText(/Drop the post photos/)).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Percent for Figures'), { target: { value: '5' } });
    expect(screen.getByRole('status').textContent).toMatch(/add up to 95%/);
    expect((screen.getByRole('button', { name: 'Save ad' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Percent for Figures'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save ad' }));
    await waitFor(() => expect(api.saveAd).toHaveBeenCalled());
    expect(api.saveAd.mock.calls[0][0].weights).toEqual({ [GAMES]: 90, 'Toys & games › Figures': 10 });
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Saved/));
  });

  it('ALL clears the categories and needs the post text when the paste lacks it', async () => {
    api.readAdPaste.mockResolvedValue({
      draft: { ...DRAFT, post_text: '' }, model: 'muse',
      match: { ad_id: 3, post_id: 9, post_label: 'Nov 12 · Game Night', need_photos: false, need_text: true },
    });
    wrap(<AdResultsDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByTestId('ad-paste'), { target: { value: 'View results Performance $99.60 spent over 4 days.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Read it' }));
    await screen.findByText('Updates the saved ad');
    expect(screen.getByText('Post: Nov 12 · Game Night')).toBeTruthy();
    expect(screen.getByLabelText('Post text')).toBeTruthy();
    expect(screen.queryByText(/Drop the post photos/)).toBeNull();
    fireEvent.click(screen.getByText('ALL'));
    expect(screen.getByText('Whole store')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();
  });
});
