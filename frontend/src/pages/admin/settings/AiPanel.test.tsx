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

const priceCheck = vi.hoisted(() => ({ started: [] as string[][] }));

vi.mock('../../../api/aiSettings.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/aiSettings.api')>()),
  getAiPriceCheck: async () => ({ status: 'done', results: [] }),
  startAiPriceCheck: async (slugs: string[]) => {
    priceCheck.started.push(slugs);
    return { status: 'running', results: [] };
  },
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

  it('Update adds new models and gets prices only for the ones just added', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(await screen.findByText('Added gemini-9-flash. Getting their prices.')).toBeInTheDocument();
    expect(priceCheck.started).toEqual([['gemini-9-flash']]);
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
