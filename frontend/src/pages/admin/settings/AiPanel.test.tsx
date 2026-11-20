import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { AiPanel } from './AiPanel';

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  refresh: vi.fn(),
  updateAction: vi.fn(),
  updateTier: vi.fn(),
  dismiss: vi.fn(),
  priceFlag: vi.fn(),
  startReview: vi.fn(),
  unarchive: vi.fn(),
  updateModel: vi.fn(),
  testText: vi.fn(),
  testImage: vi.fn(),
}));

vi.mock('../../../api/aiSettings.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/aiSettings.api')>()),
  testAiModel: mocks.testText,
  testAiImage: mocks.testImage,
}));

const base = {
  label: '', modality: 'text', status: 'active', source: 'manual', input_price: null, output_price: null, image_price: null,
  price_source: '', price_checked_at: null, price_flag: '', flag_input: null, flag_output: null, aa_slug: '',
  aa_name: '', release_date: null, aa_intelligence: null, aa_task_cost: null, aa_speed: null, aa_checked_at: null, tier_keys: [],
  created_at: '', updated_at: '',
};
const models = [
  { ...base, id: 1, slug: 'grok-4.7', label: 'Grok 4.7', provider: 'xai', input_price: '2.0000', tier_keys: ['fast'],
    aa_intelligence: '61.30', aa_task_cost: '0.4130', aa_speed: '88.0', price_source: 'aa', release_date: '2026-09-21' },
  { ...base, id: 2, slug: 'old-model', provider: 'google', status: 'archived', source: 'discovered' },
  { ...base, id: 3, slug: 'claude-opus-5-5', provider: 'anthropic', input_price: '4.0000', output_price: '20.0000',
    price_flag: 'Saved $4 / $20; AA says $5 / $25. Offered: AA.', flag_input: '5.0000', flag_output: '25.0000' },
  { ...base, id: 4, slug: 'gpt-image-2', provider: 'openai', modality: 'image', image_price: '0.0400', aa_intelligence: '1193.00' },
];
const tiers = [
  { key: 'fast', label: 'Fast', modality: 'text', model: 1, model_slug: 'grok-4.7', effort: 'low', env_model: 'env-x', updated_at: '' },
  { key: 'standard', label: 'Standard', modality: 'text', model: null, model_slug: null, effort: 'low', env_model: 'env-x', updated_at: '' },
  { key: 'best', label: 'Best', modality: 'text', model: 3, model_slug: 'claude-opus-5-5', effort: 'medium', env_model: 'env-x', updated_at: '' },
  { key: 'image', label: 'Image', modality: 'image', model: null, model_slug: null, effort: 'off', env_model: 'img', updated_at: '' },
];
const row = {
  description: 'Does a thing.', modality: 'text', model: null, model_slug: null, effort: '', run_effort: 'low',
  model_from: 'tier', effort_from: 'tier', runs_30d: 0, tokens_in: null, tokens_out: null, cost_per_run: null,
  cost_month: null, spent_30d: null, tier_costs: {}, suggested_tier: '', suggested_reason: '', updated_by_name: null,
  updated_at: '',
};
const actions = [
  { ...row, purpose: 'CATEGORY_AI', label: 'Read one manifest category key', workspace: 'Buying', page: 'Auctions',
    tier: 'fast', run_model: 'grok-4.7', runs_30d: 229, cost_per_run: '0.000786', spent_30d: '0.19',
    tier_costs: { fast: '0.000786', standard: null, best: '0.0712' } },
  { ...row, purpose: 'MANIFEST_TEMPLATE', label: "Map a new vendor's manifest columns", workspace: 'Buying', page: 'Orders',
    tier: 'best', run_model: 'claude-opus-5-5', suggested_tier: 'standard', suggested_reason: 'Rare and well defined.' },
  { ...row, purpose: 'KEYS', label: 'Read a key photo and find its match', workspace: 'Facilities', page: 'Keys',
    tier: 'standard', run_model: 'env-x', model_from: 'env' },
  { ...row, purpose: 'LABEL_IMAGE', label: 'AI Create: background image', workspace: 'Studios', page: 'Label Studio',
    modality: 'image', tier: 'image', run_model: 'img', run_effort: 'off' },
];

const idle = { mutateAsync: vi.fn(), isPending: false };

vi.mock('../../../hooks/useAiSettings', () => ({
  useAiModels: () => ({ data: models, isLoading: false, isError: false }),
  useAiTiers: () => ({ data: tiers, isLoading: false, isError: false }),
  useAiActions: () => ({ data: actions, isLoading: false, isError: false }),
  useAiRefreshSummary: () => ({ data: {} }),
  useAiTierReview: () => ({ data: { status: 'done', finished_at: '2026-11-20T20:00:00Z', model: 'claude-opus-5-5', proposed: 1 } }),
  useCreateAiModel: () => idle,
  useUpdateAiModel: () => ({ mutateAsync: mocks.updateModel, isPending: false }),
  useArchiveAiModel: () => ({ mutateAsync: mocks.archive, isPending: false }),
  useUnarchiveAiModel: () => ({ mutateAsync: mocks.unarchive, isPending: false }),
  useRunAiRefresh: () => ({ mutateAsync: mocks.refresh, isPending: false, data: undefined }),
  useAiModelPriceFlag: () => ({ mutateAsync: mocks.priceFlag, isPending: false }),
  useUpdateAiTier: () => ({ mutateAsync: mocks.updateTier, isPending: false }),
  useUpdateAiAction: () => ({ mutateAsync: mocks.updateAction, isPending: false }),
  useDismissAiSuggestion: () => ({ mutateAsync: mocks.dismiss, isPending: false }),
  useStartAiTierReview: () => ({ mutateAsync: mocks.startReview, isPending: false }),
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
    mocks.archive.mockResolvedValue({ ...models[0], status: 'archived', cleared_actions: 0, cleared_tiers: ['Fast'] });
    mocks.refresh.mockResolvedValue({});
    mocks.updateAction.mockResolvedValue({});
    mocks.priceFlag.mockResolvedValue({});
  });

  it('one type and one status at a time: Text / Image and Live / Archived, with counts', async () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Text 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Image 1' })).toBeInTheDocument();
    const ids = screen.getAllByRole('button', { name: / model id$/ }).map((el) => el.textContent);
    expect(ids).toEqual(['claude-opus-5-5', 'grok-4.7']);  // text only, Anthropic then xAI
    const grok = screen.getByRole('button', { name: 'Edit grok-4.7 model id' }).closest('tr') as HTMLElement;
    expect(within(grok).getByText('61.3')).toBeInTheDocument();
    expect(within(grok).getByText('$0.413')).toBeInTheDocument();
    expect(within(grok).getByText('88')).toBeInTheDocument();
    expect(within(grok).getByText('AA')).toBeInTheDocument();
    expect(within(grok).getByText(/Sep 2026/)).toBeInTheDocument();  // released

    await userEvent.click(screen.getByRole('button', { name: 'Image 1' }));
    expect(screen.getAllByRole('button', { name: / model id$/ }).map((el) => el.textContent)).toEqual(['gpt-image-2']);
    expect(screen.getByText('$ per image')).toBeInTheDocument();
    expect(screen.queryByText('Input $/1M')).not.toBeInTheDocument();
    const img = screen.getByRole('button', { name: 'Edit gpt-image-2 model id' }).closest('tr') as HTMLElement;
    expect(within(img).getByRole('button', { name: 'Edit gpt-image-2 per-image price' })).toHaveTextContent('$0.04/image');
    expect(within(img).getByText('1193')).toBeInTheDocument();  // arena ELO, whole number

    await userEvent.click(screen.getByRole('button', { name: /^Text/ }));
    expect(screen.getByRole('button', { name: 'Live 2' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Archived 1' }));
    expect(screen.getByText('old-model')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Pick old-model'));
    expect(screen.getByText('1 picked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive' }));
    await waitFor(() => expect(mocks.unarchive).toHaveBeenCalledWith(2));
  });

  it('one Refresh button runs the whole check', async () => {
    renderPanel();
    expect(screen.getByText('Not refreshed yet')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
  });

  it('a flagged price waits for a look: Use saves the offered price', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Check' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/AA says \$5 \/ \$25/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Use $5.00 / $25.00' }));
    await waitFor(() => expect(mocks.priceFlag).toHaveBeenCalledWith({ id: 3, accept: true }));
  });

  it('bulk Archive says which tier needs a new pick', async () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeDisabled();  // nothing picked yet
    await userEvent.click(screen.getByLabelText('Pick grok-4.7'));
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mocks.archive).toHaveBeenCalledWith(1));
    expect(await screen.findByText(/Pick a new model for Fast\./)).toBeInTheDocument();
  });

  it('edits in place: click the name, type, Enter saves only that field', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Edit grok-4.7 name' }));
    const input = screen.getByLabelText('grok-4.7 name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Grok Fast{Enter}');
    await waitFor(() => expect(mocks.updateModel).toHaveBeenCalledWith({ id: 1, data: { provider: 'xai', label: 'Grok Fast' } }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Try sends one message to every picked model and shows the answers side by side', async () => {
    mocks.testText.mockResolvedValue({ text: 'Hello.', model_used: 'x', seconds: 1.2, input_tokens: 10,
      output_tokens: 20, input_cost: '0.0001', output_cost: '0.0002' });
    renderPanel();
    expect(screen.getByRole('button', { name: 'Try' })).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Pick grok-4.7'));
    await userEvent.click(screen.getByLabelText('Pick claude-opus-5-5'));
    await userEvent.click(screen.getByRole('button', { name: 'Try' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Try 2 models')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Message'), 'Hi');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findAllByText('Hello.')).toHaveLength(2);
    expect(within(dialog).getAllByText(/1\.2s · 10 in · 20 out · \$0\.00030/)).toHaveLength(2);
    expect(mocks.testText).toHaveBeenCalledWith(1, 'Hi');
    expect(mocks.testText).toHaveBeenCalledWith(3, 'Hi');
  });

  it('Try on image models shows the pictures with time and cost', async () => {
    mocks.testImage.mockResolvedValue({ image: 'data:image/png;base64,aGk=', model_used: 'gpt-image-2', seconds: 9.5, cost: '0.0400' });
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Image 1' }));
    await userEvent.click(screen.getByLabelText('Pick gpt-image-2'));
    await userEvent.click(screen.getByRole('button', { name: 'Try' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('What to draw'), 'A green leaf');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await within(dialog).findByAltText('gpt-image-2: A green leaf')).toHaveAttribute('src', 'data:image/png;base64,aGk=');
    expect(within(dialog).getByText(/9\.5s · \$0\.040/)).toBeInTheDocument();
    expect(mocks.testImage).toHaveBeenCalledWith(4, 'A green leaf');
  });

  it('the tier map shows each tier, and a tier with no model says what it falls back to', () => {
    renderPanel();
    expect(screen.getByText('Not set: uses env-x')).toBeInTheDocument();
    expect(screen.getByLabelText('Fast model')).toBeInTheDocument();
    expect(screen.getByLabelText('Best effort')).toBeInTheDocument();
  });

  it('actions read Workspace > Page > Function in the given order, with runs and cost per run', () => {
    renderPanel();
    const headers = screen.getAllByText(/^(Buying|Facilities|Studios)$/, { selector: 'td' }).map((el) => el.textContent);
    expect(headers).toEqual(['Buying', 'Facilities', 'Studios']);  // one header per workspace, server order kept
    const cat = screen.getByText('Read one manifest category key').closest('tr') as HTMLElement;
    expect(within(cat).getByText('Auctions')).toBeInTheDocument();
    expect(within(cat).getByText('229')).toBeInTheDocument();
    expect(within(cat).getByText('$0.00079')).toBeInTheDocument();
    const keys = screen.getByText('Read a key photo and find its match').closest('tr') as HTMLElement;
    expect(within(keys).getByText(/env-x · low \(\.env\)/)).toBeInTheDocument();
  });

  it('the AI suggestion is one click to use, and can be dismissed', async () => {
    renderPanel();
    expect(screen.getByText(/1 change proposed/)).toBeInTheDocument();
    const tmpl = screen.getByText("Map a new vendor's manifest columns").closest('tr') as HTMLElement;
    await userEvent.click(within(tmpl).getByText('Standard'));
    await waitFor(() => expect(mocks.updateAction).toHaveBeenCalledWith({ purpose: 'MANIFEST_TEMPLATE', data: { tier: 'standard' } }));
    await userEvent.click(within(tmpl).getByTestId('CancelIcon'));
    await waitFor(() => expect(mocks.dismiss).toHaveBeenCalledWith('MANIFEST_TEMPLATE'));
  });

  it('a price saved elsewhere shows in the table without a reload', async () => {
    const { PriceCell } = await import('./AiPriceCell');
    const one = { ...models[0], output_price: null };
    const client = new QueryClient();
    const view = render(
      <QueryClientProvider client={client}><SnackbarProvider><PriceCell model={one as never} field="output_price" /></SnackbarProvider></QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit grok-4.7 output price' })).toHaveTextContent('set');
    view.rerender(
      <QueryClientProvider client={client}><SnackbarProvider><PriceCell model={{ ...one, output_price: '6.0000' } as never} field="output_price" /></SnackbarProvider></QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit grok-4.7 output price' })).toHaveTextContent('$6');
  });
});
