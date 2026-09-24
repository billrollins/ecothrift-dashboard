import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ManifestAnalysis } from '../../types/buying.types';
import ManifestAnalysisCard, { topLinesPct } from './ManifestAnalysisCard';

const analysis: ManifestAnalysis = {
  key: '50:1:50',
  analyzed_at: '2026-09-24T12:00:00Z',
  lines: 50,
  units: 80,
  retail: '12000.00',
  revenue: '2400.00',
  revenue_by_category: '2600.00',
  matched_lines: 7,
  match_methods: { near: 6, title: 1 },
  matched_retail_pct: 10.3,
  product_basis_retail_pct: 2,
  hazards: { high_value: { lines: 2, retail_pct: 18.9 }, part: { lines: 1, retail_pct: 1.5 } },
  flagged_lines: 3,
  top_lines_value_pct: 71.4,
  top_lines: [],
  high_volume: [{ product_id: 9, title: 'Dish soap 24oz', units: 48, sold: 12, avg_days: 30, on_hand: 3 }],
};

function renderCard(props: Partial<Parameters<typeof ManifestAnalysisCard>[0]> = {}) {
  const onHazard = vi.fn();
  render(
    <ThemeProvider theme={createTheme()}>
      <ManifestAnalysisCard analysis={analysis} hazard="" onHazard={onHazard} {...props} />
    </ThemeProvider>,
  );
  return { onHazard };
}

describe('ManifestAnalysisCard', () => {
  it('shows truck value next to the category-only value, and match coverage', () => {
    renderCard();
    expect(screen.getByText('$2,400')).toBeInTheDocument();
    expect(screen.getByText(/By category only: \$2,600/)).toBeInTheDocument();
    expect(screen.getByText(/of 50 lines matched a product we know/)).toBeInTheDocument();
    expect(screen.getByText(/Dish soap 24oz/)).toBeInTheDocument();
    expect(screen.getByText('Top 10 lines: 71% of value')).toBeInTheDocument();
  });

  it('works out the top-10 share on older analyses, and skips it on small manifests', () => {
    const older = {
      ...analysis,
      top_lines_value_pct: undefined,
      top_lines: [{ row_id: 1, title: 'TV', qty: 1, value: '600.00', basis: 'category', hazards: [] }],
    };
    expect(topLinesPct(older)).toBe(25);
    expect(topLinesPct({ ...analysis, lines: 8 })).toBeNull();
  });

  it('filters rows by a hazard, box 1 of N first', async () => {
    const user = userEvent.setup();
    const { onHazard } = renderCard();
    const chips = screen.getAllByRole('button').map((b) => b.textContent);
    expect(chips.indexOf('Box 1 of N · 1')).toBeLessThan(chips.indexOf('High value · 2'));
    await user.click(screen.getByRole('button', { name: 'High value · 2' }));
    expect(onHazard).toHaveBeenCalledWith('high_value');
  });
});
