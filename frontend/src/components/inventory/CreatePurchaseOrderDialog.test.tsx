import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CreatePurchaseOrderDialog from './CreatePurchaseOrderDialog';

const navigate = vi.fn();
const mutateAsync = vi.fn();
const guess = vi.fn();

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const TARGET = { id: 7, name: 'Target', code: 'TRGET', is_active: true };
const AMAZON = { id: 9, name: 'Amazon', code: 'AMZON', is_active: true };

vi.mock('../../hooks/useInventory', () => ({
  useCreatePurchaseOrder: () => ({ mutateAsync, isPending: false }),
  useVendors: () => ({ data: { results: [TARGET, AMAZON] } }),
}));

vi.mock('../../api/inventory.api', () => ({
  guessOrderVendor: (n: string) => guess(n),
}));

function setup(onCreated?: (order: { id: number }, open: boolean) => void) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <CreatePurchaseOrderDialog open onClose={onClose} onCreated={onCreated as never} />
    </MemoryRouter>,
  );
  return { onClose };
}

async function typeOrderNumber(value: string) {
  fireEvent.change(screen.getByLabelText(/Order Number/), { target: { value } });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
}

describe('CreatePurchaseOrderDialog', () => {
  beforeEach(() => {
    navigate.mockReset();
    mutateAsync.mockReset().mockResolvedValue({ id: 55, order_number: 'TRGET-ABC-1' });
    guess.mockReset().mockResolvedValue({ data: { prefix: 'TRGET', vendor: { ...TARGET, source: 'orders' } } });
  });

  it('fills the vendor from the order number prefix', async () => {
    setup();
    await typeOrderNumber('TRGET-ABC-1');
    expect(guess).toHaveBeenCalledWith('TRGET-ABC-1');
    expect(await screen.findByText('From the order number (TRGET)')).toBeTruthy();
    expect(screen.getByTitle('Target (TRGET)')).toBeTruthy();
  });

  it('Create stays on the list; Enter means Create', async () => {
    const onCreated = vi.fn();
    const { onClose } = setup(onCreated);
    await typeOrderNumber('TRGET-ABC-1');
    await screen.findByTitle('Target (TRGET)');
    fireEvent.change(screen.getByLabelText('Purchase Cost'), { target: { value: '412.50+38' } });
    fireEvent.submit(screen.getByLabelText(/Order Number/).closest('form')!);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ vendor: 7, order_number: 'TRGET-ABC-1', purchase_cost: '450.50' });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 55 }), false));
    expect(onClose).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('Create & Open opens the new order', async () => {
    const onCreated = vi.fn();
    setup(onCreated);
    await typeOrderNumber('TRGET-ABC-1');
    await screen.findByTitle('Target (TRGET)');
    fireEvent.click(screen.getByRole('button', { name: /Create & Open/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 55 }), true));
  });

  it('without a host, Create & Open goes to the order link and Create does not navigate', async () => {
    setup();
    await typeOrderNumber('TRGET-ABC-1');
    await screen.findByTitle('Target (TRGET)');
    fireEvent.click(screen.getByRole('button', { name: /^Create$/ }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('a bad part in a sum blocks Create', async () => {
    setup();
    await typeOrderNumber('TRGET-ABC-1');
    await screen.findByTitle('Target (TRGET)');
    fireEvent.change(screen.getByLabelText('Fees'), { target: { value: '12+abc' } });
    expect(screen.getByText('"abc" is not a number')).toBeTruthy();
    expect((screen.getByRole('button', { name: /^Create$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Total Cost adds the sums as you type', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Purchase Cost'), { target: { value: '100+50' } });
    fireEvent.change(screen.getByLabelText('Shipping'), { target: { value: '25' } });
    expect(screen.getByTestId('create-po-total').textContent).toBe('$175.00');
  });
});
