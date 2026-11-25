import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrepLine, PrepRun } from '../../api/prepSteps.api';
import PrepStepsPage from './PrepStepsPage';

const api = vi.hoisted(() => ({
  orders: vi.fn(), run: vi.fn(), lines: vi.fn(), start: vi.fn(), step: vi.fn(), rule: vi.fn(), edit: vi.fn(),
  accept: vi.fn(), target: vi.fn(), ai: vi.fn(), action: vi.fn(), apply: vi.fn(), discard: vi.fn(), undo: vi.fn(), send: vi.fn(),
}));
vi.mock('../../api/prepSteps.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/prepSteps.api')>()),
  prepStepsApi: api,
}));

const KEYS = ['load', 'clean', 'match', 'category', 'retail', 'price', 'packs', 'send'] as const;
const LABELS = ['Load', 'Clean', 'Match products', 'Category', 'Retail', 'Price', 'Packs', 'Send'];

function makeRun(step: PrepRun['step'] = 'match'): PrepRun {
  return {
    id: 1, order_id: 461, order_number: 'WLMRT-1', vendor: 'Walmart', description: 'Truckload', step,
    steps: KEYS.map((k, i) => ({
      key: k, label: LABELS[i], state: i < KEYS.indexOf(step) ? 'done' : k === step ? 'open' : '', open: k === 'match' ? 1 : 0,
      flags: (k === 'match' ? { like: 1 } : {}) as Record<string, number>, cost: 0, seconds: 1,
    })),
    target: { share: 0.55, band: 0.15, total: 100 },
    totals: { lines: 2, units: 3, pieces: 3, manifest_retail: 200, retail: 200, tag: 110, cost: 40, ai_cost: 0.0013, seconds: 12 },
    actions: [{
      id: 9, step: 'match', kind: 'rule', name: 'match_products', label: 'Match products', model: '', effort: '', status: 'applied',
      line_count: 2, changed_count: 2, seconds: 10.1, cost: 0, calls: 0, input_tokens: 0, output_tokens: 0, batches_done: 0,
      batches_total: 0, prompt: '', error: '', created_at: '2026-11-24T00:00:00Z', preview_count: 0,
    }],
    load_info: { columns: { title: 'Item Description' } },
    flag_text: { like: 'Only like a product' },
  };
}

function line(id: number, title: string, kind: PrepLine['match_kind']): PrepLine {
  return {
    id, row_number: id, src_title: `${title}, long seller words`, src_brand: '', src_model: '', src_qty: 1, src_retail: 100,
    src_ext_retail: 100, src_category: 'X', src_subcategory: 'Y', src_condition: '', upc: '', item_number: '', image_url: '',
    page_url: '', title, brand: 'Kleenex', model: '', qty: 1, match_product_id: kind === 'new' ? null : 50, match_kind: kind,
    match_confidence: 85, match_candidates: [{ product_id: 50, sim: 0.85, id: '', number: 'PRD-00050', title: 'Kleenex Box', brand: 'Kleenex', category: '', retail_avg: 9, sold: 3, avg_sold: 5 }],
    category: '', subcategory: '', retail: 100, price: 55, price_class: 'GEN', unit_count: null, unit_name: '', pack_units: null,
    pieces: 1, sell_as: '', search_tags: [], reasons: { match_kind: 'Similar (0.85)' }, sources: {}, accepted: [],
    flags: kind === 'like' ? { match: ['like'] } : {}, open: kind === 'like' ? ['match'] : [], pack: '',
  };
}

function page(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/prep/steps" element={<PrepStepsPage />} />
            <Route path="/prep/steps/:orderId" element={<PrepStepsPage />} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('PrepStepsPage', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('shows every step, the step header with what ran, and the open lines', async () => {
    api.run.mockResolvedValue({ run: makeRun() });
    api.lines.mockResolvedValue({ lines: [line(1, 'Kleenex Tissue', 'like'), line(2, 'Chair', 'new')] });
    page('/prep/steps/461');
    expect(await screen.findByText('3. Match products')).toBeInTheDocument();
    const rail = screen.getByRole('navigation', { name: 'Steps' });
    LABELS.forEach((l) => expect(within(rail).getByText(l)).toBeInTheDocument());
    expect(screen.getByTestId('next-step')).toHaveTextContent('Next: Category (1 open)');
    const ledger = screen.getByTestId('ledger');
    expect(within(ledger).getByText('Code, no AI')).toBeInTheDocument();
    expect(within(ledger).getByText('2 changed')).toBeInTheDocument();
    expect(screen.getByText('all 2 shown')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Open 1'));
    expect(await screen.findByText('all 1 shown')).toBeInTheDocument();
  });

  it('Next moves on and Accept goes to the server for the shown lines', async () => {
    api.run.mockResolvedValue({ run: makeRun() });
    api.lines.mockResolvedValue({ lines: [line(1, 'Kleenex Tissue', 'like')] });
    api.step.mockResolvedValue({ run: makeRun('category') });
    api.accept.mockResolvedValue({ run: makeRun(), lines: [] });
    page('/prep/steps/461');
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(api.accept).toHaveBeenCalledWith(461, 'match', [1], true));
    fireEvent.click(screen.getByTestId('next-step'));
    await waitFor(() => expect(api.step).toHaveBeenCalledWith(461, 'next'));
    expect(await screen.findByText('4. Category')).toBeInTheDocument();
  });

  it('offers to load a truck that is not prepped yet', async () => {
    api.run.mockResolvedValue({ run: null, order: { id: 465, order_number: 'W-1', vendor: 'Wayfair', description: '' } });
    page('/prep/steps/465');
    expect(await screen.findByTestId('start-prep')).toHaveTextContent('Step 1: load the manifest');
  });
});
