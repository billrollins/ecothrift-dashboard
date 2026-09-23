import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import BuildSvgDialog from './BuildSvgDialog';

const mocks = vi.hoisted(() => ({
  generateKindSvg: vi.fn(),
  upload: vi.fn(),
  createKind: vi.fn(),
  updateKind: vi.fn(),
}));

vi.mock('../../api/floorplanAi.api', () => ({ generateKindSvg: mocks.generateKindSvg }));

vi.mock('../../hooks/useFloorplanAssets', () => ({
  useUploadFloorPlanAsset: () => ({ mutateAsync: mocks.upload, isPending: false }),
}));

vi.mock('../../hooks/useFloorplanElementKinds', () => ({
  useCreateFloorPlanElementKind: () => ({ mutateAsync: mocks.createKind, isPending: false }),
  useUpdateFloorPlanElementKind: () => ({ mutateAsync: mocks.updateKind, isPending: false }),
}));

vi.mock('../../hooks/useAiSettings', () => ({
  useAiActionChoices: () => ({
    data: {
      purpose: 'FLOORPLAN_SVG',
      modality: 'text',
      default_model: 'model-a',
      default_effort: 'low',
      models: [{ slug: 'model-a', label: 'Model A', provider: 'google' }],
    },
    isError: false,
  }),
}));

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48"/></svg>';

describe('BuildSvgDialog', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.generateKindSvg.mockResolvedValue({
      data: { svg_data_uri: `data:image/svg+xml;base64,${btoa(SVG)}`, model_used: 'model-a', width: 48, depth: 48 },
    });
    mocks.upload.mockResolvedValue({ id: 55 });
    mocks.createKind.mockResolvedValue({ id: 9 });
  });

  it('previews the SVG and on Apply uploads a shared asset and creates the kind', async () => {
    const onClose = vi.fn();
    render(
      <SnackbarProvider>
        <BuildSvgDialog open kinds={[]} categories={['Fixtures']} onClose={onClose} />
      </SnackbarProvider>,
    );
    await userEvent.type(screen.getByLabelText('Name'), 'Test table');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByAltText('Generated SVG preview')).toBeInTheDocument();
    const sent = mocks.generateKindSvg.mock.calls[0][0];
    expect(sent).toMatchObject({ label: 'Test table', width: 48, depth: 48, model: 'model-a', effort: 'low' });

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(mocks.createKind).toHaveBeenCalled());
    const uploaded = mocks.upload.mock.calls[0][0];
    expect(uploaded.file.type).toBe('image/svg+xml');
    expect(uploaded.file.name).toBe('test-table.svg');
    expect('location' in uploaded).toBe(false);
    expect(mocks.createKind.mock.calls[0][0]).toMatchObject({
      label: 'Test table',
      default_w: 48,
      default_h: 48,
      default_image: 55,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a readable error and does not preview when generation fails', async () => {
    mocks.generateKindSvg.mockRejectedValue({ response: { data: { detail: 'The model did not return an SVG. Try again.' } } });
    render(
      <SnackbarProvider>
        <BuildSvgDialog open kinds={[]} categories={[]} onClose={vi.fn()} />
      </SnackbarProvider>,
    );
    await userEvent.type(screen.getByLabelText('Name'), 'Cart');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('The model did not return an SVG. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });
});
