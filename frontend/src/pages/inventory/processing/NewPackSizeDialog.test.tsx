import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NewPackSizeDialog } from './NewPackSizeDialog';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../../api/client', () => ({ default: client }));

const PACK = {
  id: 5, title: 'Tampons Regular Pack of 100', unit_count: null, unit_name: '', pack_units: null, base_product: null,
  pack_label: '', is_pack: false, guess: { unit_count: 100, unit_name: '', pack_units: 1, from_title: true },
};

function show(onMade = vi.fn()) {
  client.get.mockReset();
  client.post.mockReset();
  client.get.mockResolvedValue({ data: PACK });
  client.post.mockResolvedValue({ data: { product: { id: 9, title: 'x' }, base: { fixed: false }, price: '6.00', retail: '24.00' } });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NewPackSizeDialog open product={{ id: 5, title: PACK.title }} basePrice="1.00" baseRetail="4.00" onClose={vi.fn()} onMade={onMade} />
    </QueryClientProvider>,
  );
  return onMade;
}

describe('New pack size (#224)', () => {
  it('starts from the product\'s own count and scales price and retail from it', async () => {
    const onMade = show();
    const user = userEvent.setup();
    expect(await screen.findByDisplayValue('Tampons Regular - 100 ct')).toBeInTheDocument();
    const units = screen.getByRole('textbox', { name: 'New pack: units in the pack' });
    await user.clear(units);
    await user.type(units, '3');
    await user.type(screen.getByRole('textbox', { name: 'New pack: unit name' }), 'box');
    const count = screen.getByRole('textbox', { name: 'New pack: count per unit' });
    await user.clear(count);
    await user.type(count, '200');
    expect(screen.getByTestId('new-pack-preview')).toHaveTextContent('3 boxes × 200 = 600 pieces · price $6.00 · retail $24.00');
    expect(screen.getByLabelText('New product title')).toHaveValue('Tampons Regular - 3 boxes × 200');
    await user.click(screen.getByRole('button', { name: 'Make it and check in' }));
    await waitFor(() => expect(onMade).toHaveBeenCalled());
    expect(client.post).toHaveBeenCalledWith('/inventory/products/5/new-pack/', expect.objectContaining({
      unit_count: 200, unit_name: 'box', pack_units: 3, base_unit_count: 100, fix_base: false, base_price: '1.00',
    }));
  });

  it('"it was really 10": a changed count asks Yes or No before anything is made', async () => {
    show();
    const user = userEvent.setup();
    await screen.findByDisplayValue('Tampons Regular - 100 ct');
    const baseCount = screen.getByRole('textbox', { name: 'This product: count per unit' });
    await user.clear(baseCount);
    await user.type(baseCount, '10');
    expect(screen.getByText("Fix this product's own details to 10 ct?")).toBeInTheDocument();
    const count = screen.getByRole('textbox', { name: 'New pack: count per unit' });
    await user.clear(count);
    await user.type(count, '30');
    expect(screen.getByRole('button', { name: 'Make it and check in' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Yes' }));
    await user.click(screen.getByRole('button', { name: 'Make it and check in' }));
    await waitFor(() => expect(client.post).toHaveBeenCalledWith('/inventory/products/5/new-pack/',
      expect.objectContaining({ base_unit_count: 10, fix_base: true, unit_count: 30 })));
  });
});
