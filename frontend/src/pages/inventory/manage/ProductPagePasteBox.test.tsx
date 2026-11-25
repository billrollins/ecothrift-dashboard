import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
const PAGE = 'Tampax Pearl Tampons, Regular, 3 boxes of 50. $14.97. Add to cart. Reviews.';

function show(onDraft = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProductPagePasteBox processingRowId={7} onDraft={onDraft} />
    </QueryClientProvider>,
  );
  return onDraft;
}

const box = () => screen.getByRole('textbox', { name: 'Pasted product page' });
const paste = () => fireEvent.change(box(), { target: { value: PAGE } });

describe('paste the product page (#224; its three buttons, #230)', () => {
  beforeEach(() => {
    client.post.mockReset();
    client.post.mockResolvedValue({ data: ANSWER });
  });

  it('Fill sends the page with the row and hands the draft back to go over what is there', async () => {
    const onDraft = show();
    const fill = screen.getByRole('button', { name: 'Fill' });
    expect(fill).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Clear then fill' })).toBeDisabled();
    paste();
    await userEvent.setup().click(fill);
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith(ANSWER, 'fill'));
    expect(client.post).toHaveBeenCalledWith('/inventory/products/from-page/', { text: PAGE, row: 7 });
    expect(screen.getByTestId('page-paste-status')).toHaveTextContent(
      'Filled from the page (muse-spark-1.3-contributor · 4.2 s · $0.0021). Check each box, then Save.',
    );
  });

  it('Clear then fill is the page alone: the row is not sent, and the details are emptied first', async () => {
    const onDraft = show();
    paste();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear then fill' }));
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith(ANSWER, 'clear-then-fill'));
    expect(client.post).toHaveBeenCalledWith('/inventory/products/from-page/', { text: PAGE, row: undefined });
    expect(screen.getByTestId('page-paste-status')).toHaveTextContent('Cleared and filled from the page');
  });

  it('Enter in the box is Clear then fill; Shift+Enter is a new line', async () => {
    const onDraft = show();
    paste();
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(client.post).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(() => expect(onDraft).toHaveBeenCalledWith(ANSWER, 'clear-then-fill'));
  });

  it('Enter with nothing pasted does nothing', () => {
    show();
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(client.post).not.toHaveBeenCalled();
  });

  it('Clear empties the box and its line', async () => {
    show();
    paste();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Fill' }));
    await waitFor(() => expect(screen.getByTestId('page-paste-status')).toHaveTextContent('Filled from the page'));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(box()).toHaveValue('');
    expect(screen.getByTestId('page-paste-status')).toHaveTextContent('');
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('shows model, time and cost in one line', () => {
    expect(pageRunLine({ model: 'm', took_ms: 1500, cost_usd: null })).toBe('m · 1.5 s');
  });
});
