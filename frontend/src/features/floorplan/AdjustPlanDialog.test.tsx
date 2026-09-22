import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import type { PlanDocument, PlanElement } from '../../types/floorplan.types';
import AdjustPlanDialog from './AdjustPlanDialog';

const api = vi.hoisted(() => ({ adjustPlan: vi.fn() }));

vi.mock('../../api/floorplanAi.api', () => ({ adjustPlan: api.adjustPlan }));

vi.mock('../../hooks/useAiSettings', () => ({
  useAiActionChoices: () => ({
    data: {
      purpose: 'FLOORPLAN_ADJUST',
      modality: 'text',
      default_model: 'model-a',
      default_effort: 'low',
      models: [{ slug: 'model-a', label: 'Model A', provider: 'google' }],
    },
    isError: false,
  }),
}));

function el(id: string, x = 0): PlanElement {
  return { id, kind: 'gondola', x, y: 0, w: 48, h: 144, rotation: 0, label: '', active: true };
}

function planDoc(): PlanDocument {
  return {
    schema_version: 1,
    settings: { planWidth: 1200, planHeight: 720, grid: { visible: true, minor: 6, major: 12 }, snap: 1 },
    elements: [el('a')],
    zones: [],
    paths: [],
    labels: [],
    infoBlocks: [],
    configStore: { cfg_other: { elements: [el('z')], zones: [], paths: [], labels: [], infoBlocks: [] } },
  };
}

const zero = { added: 0, changed: 0, removed: 0 };
const proposal = {
  layers: { elements: [el('a', 240)], zones: [], paths: [], labels: [], infoBlocks: [] },
  settings_patch: {},
  summary: {
    counts: { elements: { added: 0, changed: 1, removed: 0 }, zones: zero, paths: zero, labels: zero, infoBlocks: zero },
    lines: ['Changed element "gondola" (a): x'],
    more: 0,
  },
  notes: 'Moved aisle a.',
  model_used: 'model-a',
};

function renderDialog(getDoc: () => PlanDocument, onApply = vi.fn(), onClose = vi.fn()) {
  render(
    <SnackbarProvider>
      <AdjustPlanDialog open planId={7} getDoc={getDoc} onApply={onApply} onClose={onClose} />
    </SnackbarProvider>,
  );
  return { onApply, onClose };
}

describe('AdjustPlanDialog', () => {
  beforeEach(() => {
    api.adjustPlan.mockReset();
    api.adjustPlan.mockResolvedValue({ data: proposal });
  });

  it('sends active layers only, shows the summary, and applies without saving', async () => {
    const doc = planDoc();
    const { onApply, onClose } = renderDialog(() => doc);
    await userEvent.type(screen.getByLabelText('What should change?'), 'Move aisle a right');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('Changed element "gondola" (a): x')).toBeInTheDocument();
    const [planId, body] = api.adjustPlan.mock.calls[0];
    expect(planId).toBe(7);
    expect(body.model).toBe('model-a');
    expect(body.effort).toBe('low');
    expect('configStore' in body.document).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const next = onApply.mock.calls[0][0] as PlanDocument;
    expect(next.elements[0].x).toBe(240);
    expect(next.configStore).toBe(doc.configStore);
    expect(onClose).toHaveBeenCalled();
  });

  it('refuses to apply when the plan changed after generating', async () => {
    let doc = planDoc();
    const { onApply } = renderDialog(() => doc);
    await userEvent.type(screen.getByLabelText('What should change?'), 'Move it');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await screen.findByText('Moved aisle a.');
    doc = { ...doc, elements: [] };
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByText(/The plan changed after this suggestion was made/)).toBeInTheDocument();
  });
});
