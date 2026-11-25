import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProductPagePasteBox, pageRunLine } from './ProductPagePasteBox';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../api/client', () => ({ default: client }));

const ANSWER = {
  draft: { title: 'Tampax Pearl Tampons Regular', brand: 'Tampax', model: '', category: 'Health & beauty', subcategory: '',
    upc: '', retail: '14.97', identifiers: {}, specifications: {}, tags: [], unit_count: 50, unit_name: 'box',
    pack_units: 3, pack_label: '3 boxes × 50' },
  source: { title: 'page' }, confidence: 'high', problems: [], model: 'muse-spark-1.3-contributor', took_ms: 4210,
  cost_usd: '0.0021',
};

describe('paste the product page (#224)', () => {
  it('sends the page with the row and hands the draft back, saying what ran', async () => {
    client.post.mockResolvedValue({ data: ANSWER });
    const onDraft = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ProductPagePasteBox processingRowId={7} onDraft={onDraft} />
      </QueryClientProvider>,
    );
    const button = screen.getByRole('button', { name: 'Fill from the page' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Pasted product page' }), {
      target: { value: 'Tampax Pearl Tampons, Regular, 3 boxes of 50. $14.97. Add to cart. Reviews.' },
    });
    await userEvent.setup().click(button);
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith(ANSWER));
    expect(client.post).toHaveBeenCalledWith('/inventory/products/from-page/', expect.objectContaining({ row: 7 }));
    expect(screen.getByTestId('page-paste-status')).toHaveTextContent(
      'Filled from the page (muse-spark-1.3-contributor · 4.2 s · $0.0021). Check each box, then Save.',
    );
  });

  it('shows model, time and cost in one line', () => {
    expect(pageRunLine({ model: 'm', took_ms: 1500, cost_usd: null })).toBe('m · 1.5 s');
  });
});
