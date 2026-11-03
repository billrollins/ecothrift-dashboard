import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { describe, expect, it, vi } from 'vitest';
import type { Cart } from '../../types/pos.types';
import { DiscountDialog } from './DiscountDialog';

vi.mock('../../hooks/usePOS', () => ({ useGoogleReviewUsernames: () => ({ data: [] }) }));

const line = (id: number, description: string, total: string) =>
  ({ id, description, line_total: total, line_kind: 'item', quantity: 1, unit_price: total }) as never;
const CART = { id: 1, lines: [line(1, 'Lamp', '20.00'), line(2, 'Chair', '30.00'), line(3, 'Rug', '50.00')] } as unknown as Cart;

describe('DiscountDialog: several items (Dash Updates #30)', () => {
  it('takes a percent off the items picked, one line each, and sends their ids', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SnackbarProvider>
          <DiscountDialog open cart={CART} pending={false} onClose={() => {}} onSubmit={onSubmit} />
        </SnackbarProvider>
      </QueryClientProvider>,
    );
    await user.click(screen.getByLabelText('Reason'));
    await user.click(await screen.findByRole('option', { name: 'Other' }));
    await user.type(screen.getByLabelText(/Note/), 'Scratched');
    await user.click(screen.getByLabelText('Apply to'));
    await user.click(await screen.findByRole('option', { name: 'Several items' }));
    expect(screen.getByRole('button', { name: '$' })).toBeDisabled();
    const list = screen.getByTestId('discount-several');
    await user.click(within(list).getByLabelText(/Lamp/));
    await user.click(within(list).getByLabelText(/Chair/));
    await user.type(screen.getByLabelText(/Percent/), '10');
    expect(screen.getByText(/Takes \$5\.00 off/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add discount' }));
    expect(onSubmit).toHaveBeenCalledWith({
      mode: 'percent', percent: 10, reason: 'Scratched', target_line_id: null, target_line_ids: [1, 2],
    });
  });
});
