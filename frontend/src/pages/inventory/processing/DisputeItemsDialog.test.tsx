import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProcessingWorkspaceItemDTO } from '../../../types/inventory.types';
import { DisputeItemsDialog } from './DisputeItemsDialog';

const item = (id: number, sku: string, extra: Partial<ProcessingWorkspaceItemDTO> = {}) =>
  ({ id, sku, status: 'on_shelf', dispute_type: null, dispute_pct_loss: null, dispute_description: '', ...extra }) as ProcessingWorkspaceItemDTO;

describe('Mark as disputed (Dash Updates #1)', () => {
  it('saves each ticked item with what is wrong and the value lost; a sold item cannot be picked', async () => {
    const patch = vi.fn().mockResolvedValue({});
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DisputeItemsDialog
        open
        items={[item(1, 'ITM1'), item(2, 'ITM2'), item(3, 'ITM3', { status: 'sold' })]}
        patch={patch}
        onClose={onClose}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /ITM3/ })).toBeDisabled();
    expect(screen.getByText('This marks the item. It does not file a claim with the supplier.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark disputed' }));
    expect(screen.getByText('Pick at least one item.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /ITM1/ }));
    await user.click(screen.getByRole('checkbox', { name: /ITM2/ }));
    await user.click(screen.getByLabelText("What's wrong"));
    await user.click(await screen.findByRole('option', { name: 'Cosmetic damage' }));
    await user.click(screen.getByRole('button', { name: 'Mark disputed' }));
    expect(screen.getByText(/how much of its value is lost/)).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Value lost'), '30');
    await user.type(screen.getByLabelText('Describe it'), 'Scuffed top');
    await user.click(screen.getByRole('button', { name: 'Mark disputed' }));
    const payload = { disputed: true, dispute_type: 'cosmetic_damage', dispute_pct_loss: 30, dispute_description: 'Scuffed top' };
    expect(patch.mock.calls).toEqual([[1, payload], [2, payload]]);
    expect(onClose).toHaveBeenCalledWith({ saved: 2, failed: [] });
  });

  it('shows a dispute already there and clears it', async () => {
    const patch = vi.fn().mockResolvedValue({});
    const user = userEvent.setup();
    render(
      <DisputeItemsDialog
        open
        items={[item(1, 'ITM1', { dispute_type: 'broken', dispute_pct_loss: 50, dispute_description: 'Leg cracked' })]}
        patch={patch}
        onClose={() => {}}
      />,
    );
    expect((screen.getByLabelText('Value lost') as HTMLInputElement).value).toBe('50');
    await user.click(screen.getByRole('button', { name: 'Clear dispute' }));
    expect(patch).toHaveBeenCalledWith(1, { disputed: false });
  });
});
