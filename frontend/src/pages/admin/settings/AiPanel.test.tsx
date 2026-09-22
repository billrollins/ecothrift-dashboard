import { describe, expect, it, vi, beforeEach } from 'vitest';
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
  { id: 1, slug: 'grok-4.7', label: 'Grok 4.7', provider: 'xai', modality: 'text', status: 'active', source: 'manual', created_at: '', updated_at: '' },
  { id: 2, slug: 'old-model', label: '', provider: 'google', modality: 'text', status: 'archived', source: 'discovered', created_at: '', updated_at: '' },
];
const actions = [
  { purpose: 'AI_CHAT', label: 'AI chat', modality: 'text', model: null, model_slug: null, effort: 'off', env_model: 'env-chat', updated_by_name: null, updated_at: '' },
  { purpose: 'LABEL_IMAGE', label: 'Label Studio background image', modality: 'image', model: null, model_slug: null, effort: 'off', env_model: 'grok-imagine-image-quality', updated_by_name: null, updated_at: '' },
];

const idle = { mutateAsync: vi.fn(), isPending: false };

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
    <SnackbarProvider>
      <AiPanel />
    </SnackbarProvider>,
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

  it('hides archived models until asked and shows the .env fallback per action', async () => {
    renderPanel();
    expect(screen.getByText('grok-4.7')).toBeInTheDocument();
    expect(screen.queryByText('old-model')).not.toBeInTheDocument();
    expect(screen.getByText('Use .env (env-chat)')).toBeInTheDocument();
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
});
