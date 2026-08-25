import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RestorationAddToQueueDialog } from './RestorationAddToQueueDialog';

const item = {
  id: 9,
  sku: 'SHELF-1',
  name: 'Radio',
  location: 'A3',
  status: 'in_stock',
  condition: '',
};

describe('RestorationAddToQueueDialog', () => {
  it('cancels without adding', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <RestorationAddToQueueDialog item={item} onCancel={onCancel} onConfirm={onConfirm} />,
    );

    expect(screen.getByText('SHELF-1')).toBeInTheDocument();
    expect(screen.getByText('Radio')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms add to queue', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <RestorationAddToQueueDialog item={item} onCancel={vi.fn()} onConfirm={onConfirm} />,
    );
    await user.click(screen.getByRole('button', { name: 'Add to queue' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
