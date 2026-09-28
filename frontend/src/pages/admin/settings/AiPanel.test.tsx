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

vi.mock('../../../api/aiSettings.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/aiSettings.api')>()),
  getAiPriceCheck: async () => ({
    status: 'done', finished_at: '2026-09-28T20:00:00Z', checker: 'claude-opus-5-5',
    results: [{ id: 1, slug: 'grok-4.7', found_input: '3.0000', found_output: '15.0000', current_input: '2.0000', current_output: null,
      filled: false, differs: true, source_url: 'https://docs.x.ai/pricing', note: '' }],
  }),
  startAiPriceCheck: async () => ({ status: 'running', results: [] }),
}));

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

  it('shows check-for-new results per provider in a dialog', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Check for new models' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/found 3, added 1 \(gemini-9-flash\)/)).toBeInTheDocument();
    expect(within(dialog).getByText(/not checked - No API key in .env/)).toBeInTheDocument();
  });

  it('shows prices per million tokens and opens the model test', async () => {
    renderPanel();
    expect(screen.getByLabelText('grok-4.7 input price')).toHaveValue('2');
    expect(screen.getByLabelText('grok-4.7 output price')).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Test a model' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Say something')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('shows the price check: what it found against yours, with the source and Apply', async () => {
    renderPanel();
    expect(await screen.findByText('$3 / $15')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'page' })).toHaveAttribute('href', 'https://docs.x.ai/pricing');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Estimate API costs' })).toBeEnabled();
  });
});
