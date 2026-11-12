import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { AiPanel } from './AiPanel';

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  discover: vi.fn(),
  updateAction: vi.fn(),
}));

const models = [
  { id: 1, slug: 'grok-4.7', label: 'Grok 4.7', provider: 'xai', modality: 'text', status: 'active', source: 'manual', input_price: '2.0000', output_price: null, created_at: '', updated_at: '' },
  { id: 2, slug: 'old-model', label: '', provider: 'google', modality: 'text', status: 'archived', source: 'discovered', input_price: null, output_price: null, created_at: '', updated_at: '' },
];
const actions = [
  { purpose: 'AI_CHAT', label: 'AI chat', modality: 'text', model: null, model_slug: null, effort: 'off', env_model: 'env-chat', updated_by_name: null, updated_at: '' },
  { purpose: 'LABEL_IMAGE', label: 'Label Studio background image', modality: 'image', model: null, model_slug: null, effort: 'off', env_model: 'grok-imagine-image-quality', updated_by_name: null, updated_at: '' },
];

const idle = { mutateAsync: vi.fn(), isPending: false };

const priceCheck = vi.hoisted(() => ({
  started: [] as boolean[],
  applied: [] as number[][],
  state: { status: 'done', results: [] } as Record<string, unknown>,
}));

vi.mock('../../../api/aiSettings.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/aiSettings.api')>()),
  getAiPriceCheck: async () => priceCheck.state,
  startAiPriceCheck: async (auto: boolean) => {
    priceCheck.started.push(auto);
    return { status: 'running', auto, results: [] };
  },
  applyAiPriceCheck: async (ids: number[]) => {
    priceCheck.applied.push(ids);
    const results = (priceCheck.state.results as { id: number; saved: string }[]).map((r) =>
      ids.includes(r.id) ? { ...r, saved: 'review' } : r,
    );
    return { ...priceCheck.state, results, saved: { by: 'Bill', at: '2026-11-12T21:05:00Z', count: ids.length } };
  },
}));

const checkRow = {
  label: '', provider: 'xai', current_input: null, current_output: null, found_input: null, found_output: null,
  source_url: '', note: '', saved: '',
};
const finishedCheck = {
  status: 'done', auto: false, requested_by: 'Bill', finished_at: '2026-11-12T21:00:00Z',
  checker: 'claude-opus-5-5', effort: 'high', web_searches: 4, web_fetches: 3,
  results: [
    { ...checkRow, id: 1, slug: 'grok-4.7', verdict: 'changed', current_input: '2.0000', current_output: '6.0000',
      found_input: '3.0000', found_output: '15.0000', source_url: 'https://docs.x.ai/developers/pricing' },
    { ...checkRow, id: 3, slug: 'new-model', verdict: 'changed', found_input: '0.1000', found_output: '0.5000',
      source_url: 'https://www.example.com/pricing' },
    { ...checkRow, id: 4, slug: 'lost-model', verdict: 'not_verified', current_input: '1.0000', current_output: '3.0000',
      note: 'Not on the pricing page.' },
    { ...checkRow, id: 5, slug: 'same-model', verdict: 'confirmed', current_input: '4.0000', current_output: '20.0000',
      found_input: '4.0000', found_output: '20.0000', source_url: 'https://platform.claude.com/docs/en/about-claude/pricing' },
  ],
};

vi.mock('../../../hooks/useAiSettings', () => ({
  useAiModels: () => ({ data: models, isLoading: false, isError: false }),
  useAiActions: () => ({ data: actions, isLoading: false, isError: false }),
  useCreateAiModel: () => idle,
  useUpdateAiModel: () => idle,
  useArchiveAiModel: () => ({ mutateAsync: mocks.archive, isPending: false }),
  useUnarchiveAiModel: () => idle,
  useDiscoverAiModels: () => ({ mutateAsync: mocks.discover, isPending: false }),
  useUpdateAiAction: () => ({ mutateAsync: mocks.updateAction, isPending: false }),
}));

function renderPanel() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>
        <AiPanel />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('AiPanel', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    priceCheck.started = [];
    priceCheck.applied = [];
    priceCheck.state = { status: 'done', results: [] };
    mocks.archive.mockResolvedValue({ ...models[0], status: 'archived', cleared_actions: 1 });
    mocks.discover.mockResolvedValue({
      providers: [
        { provider: 'anthropic', ok: false, found: 0, added: [], error: 'No API key in .env' },
        { provider: 'google', ok: true, found: 3, added: ['gemini-9-flash'], error: '' },
      ],
    });
  });

  it('hides archived models until asked and shows the fallback per action', async () => {
    renderPanel();
    expect(screen.getByText('grok-4.7')).toBeInTheDocument();
    expect(screen.queryByText('old-model')).not.toBeInTheDocument();
    expect(screen.getByText('Default (env-chat)')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Show archived'));
    expect(screen.getByText('old-model')).toBeInTheDocument();
  });

  it('archives right away, with no confirm dialog', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Update adds new models and asks for the prices that are missing', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(await screen.findByText('Added gemini-9-flash. Getting their prices.')).toBeInTheDocument();
    expect(priceCheck.started).toEqual([true]);  // the automatic run: the server skips it when no price is missing
  });

  it('Refresh prices starts a check of every model and says it is running', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh prices' }));
    expect(priceCheck.started).toEqual([false]);  // nothing is saved until the changes are reviewed
    expect(await screen.findByText(/Checking every model's price on the web/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Checking prices...' })).toBeDisabled();
  });

  it('shows what the check found (old, new, source) and saves only the picked changes', async () => {
    priceCheck.state = finishedCheck;
    renderPanel();
    expect(await screen.findByText(/by Bill: 1 confirmed, 2 to review, 1 could not verify\./)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Review' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('$2 in, $6 out')).toBeInTheDocument();      // now
    expect(within(dialog).getByText('$3 in, $15 out')).toBeInTheDocument();     // found
    expect(within(dialog).getByRole('link', { name: 'docs.x.ai' })).toHaveAttribute('href', 'https://docs.x.ai/developers/pricing');
    expect(within(dialog).getByText('not set in, not set out')).toBeInTheDocument();
    expect(within(dialog).getByText('Could not verify (1)')).toBeInTheDocument();
    expect(within(dialog).getByText('Not on the pricing page.')).toBeInTheDocument();
    expect(within(dialog).getByText('Confirmed (1)')).toBeInTheDocument();
    expect(within(dialog).getByText(/with claude-opus-5-5 \(high effort\): 4 web searches, 3 pages read\./)).toBeInTheDocument();
    expect(priceCheck.applied).toEqual([]);  // looking saves nothing

    await userEvent.click(within(dialog).getByLabelText('Save the new price for new-model'));  // leave this one out
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save 1 change' }));
    await waitFor(() => expect(priceCheck.applied).toEqual([[1]]));
    expect(await screen.findByText('Saved 1 price change.')).toBeInTheDocument();
  });

  it('a price saved by the check shows in the table without a reload', async () => {
    const { PriceCell } = await import('./AiPriceCell');
    const row = { ...models[0], output_price: null };
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}><SnackbarProvider><PriceCell model={row as never} field="output_price" /></SnackbarProvider></QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit grok-4.7 output price' })).toHaveTextContent('set');
    view.rerender(
      <QueryClientProvider client={client}><SnackbarProvider><PriceCell model={{ ...row, output_price: '6.0000' } as never} field="output_price" /></SnackbarProvider></QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit grok-4.7 output price' })).toHaveTextContent('$6');
  });

  it('says so when the check failed', async () => {
    priceCheck.state = { status: 'failed', results: [], error: 'The checker did not report prices. Try again.' };
    renderPanel();
    expect(await screen.findByText(/The price check did not finish, so no price was changed\./)).toBeInTheDocument();
  });

  it('shows prices per million tokens and opens the model test', async () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Edit grok-4.7 input price' })).toHaveTextContent('$2');
    expect(screen.getByRole('button', { name: 'Edit grok-4.7 output price' })).toHaveTextContent('set');
    await userEvent.click(screen.getByRole('button', { name: 'Edit grok-4.7 input price' }));
    expect(screen.getByLabelText('grok-4.7 input price')).toHaveValue('2');  // a small input only once clicked
    await userEvent.click(screen.getByRole('button', { name: 'Test grok-4.7' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Grok 4.7')).toBeInTheDocument();  // the row's model is already picked
    expect(within(dialog).getByLabelText('Say something')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
  });
});
