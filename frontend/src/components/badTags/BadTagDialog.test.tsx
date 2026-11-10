import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BadTagButton from './BadTagButton';
import BadTagDialog from './BadTagDialog';

const client = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../api/client', () => ({ default: client }));

const ITEM = {
  id: 7, sku: 'ITM0000101', title: 'Brass floor lamp', brand: 'Acme', product_number: 'P-7', price: '24.00',
  retail: '80.00', status: 'on_shelf', location: '',
};
const FOUND = {
  found: true, code: 'ITM0000101', item: ITEM, tag_retail: null, retail_check: '', checked_in_by: 'Sam',
  checked_in_at: null, order_number: 'PO-77', floor_issue: null, reasons: [],
};
const WAITING = {
  id: 3, reason: 'dirty', reason_label: 'Dirty', about: 'item', note: '', where: 'floor', where_label: 'Floor',
  photo_url: null, reported_by: 'Pat', reported_at: '2026-11-10T15:00:00Z', status_before: 'on_shelf', bad_tag_id: null,
  closed_at: null, closed_by: '', outcome: '', item: ITEM,
};

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ThemeProvider theme={createTheme()}>
        <SnackbarProvider>{ui}</SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  client.get.mockReset();
  client.post.mockReset();
});

describe('Report a problem', () => {
  it('scans a tag, picks what is wrong with the item, and sends it to Processing', async () => {
    client.get.mockResolvedValue({ data: FOUND });
    client.post.mockResolvedValue({ data: { floor_issue: { ...WAITING, reason: 'broken' }, bad_tag: null, already: false } });
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="floor" onClose={onClose} onSaved={onSaved} />);

    expect(screen.getByRole('heading', { name: 'Report a problem' })).toBeInTheDocument();
    expect(screen.getByText('The item')).toBeInTheDocument();
    expect(screen.getByText('The tag')).toBeInTheDocument();
    const send = screen.getByRole('button', { name: 'Send to Processing' });
    expect(send).toBeDisabled();

    await user.type(screen.getByLabelText('Scan or type the tag'), 'itm0000101{Enter}');
    expect(await screen.findByText('Brass floor lamp')).toBeInTheDocument();
    // Sent as typed; the server reads any case (and a Perks tag's link) as the SKU.
    expect(client.get).toHaveBeenCalledWith('/inventory/floor-issues/lookup/', { params: { code: 'itm0000101' } });
    expect(send).toBeDisabled();

    await user.click(screen.getByText('Broken or damaged'));
    expect(send).toBeEnabled();
    await user.type(screen.getByLabelText('Note (optional)'), 'Cracked base');
    await user.click(send);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(client.post).toHaveBeenCalledWith('/inventory/floor-issues/', {
      code: 'ITM0000101', reason: 'broken', where: 'floor', note: 'Cracked base',
      right_price: undefined, right_retail: undefined, photo: undefined,
    });
    expect(onSaved).toHaveBeenCalled();
    expect(await screen.findByText('Sent to Processing. Put the item on the PR cart.')).toBeInTheDocument();
  });

  it('a tag problem goes through the same report, with the right price', async () => {
    client.get.mockResolvedValue({ data: FOUND });
    client.post.mockResolvedValue({ data: { floor_issue: WAITING, bad_tag: { id: 1 }, already: false } });
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="register" initialCode="ITM0000101" onClose={vi.fn()} />);

    expect(await screen.findByText('Brass floor lamp')).toBeInTheDocument();
    await user.click(screen.getByText('Price too high'));
    await user.type(screen.getByLabelText('Right price (if you know it)'), '12');
    await user.click(screen.getByRole('button', { name: 'Send to Processing' }));

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(client.post.mock.calls[0][1]).toMatchObject({ reason: 'price_high', where: 'register', right_price: '12' });
  });

  it('"Other" needs a note', async () => {
    client.get.mockResolvedValue({ data: FOUND });
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="floor" initialCode="ITM0000101" onClose={vi.fn()} />);

    expect(await screen.findByText('Brass floor lamp')).toBeInTheDocument();
    await user.click(screen.getByText('Other'));
    const send = screen.getByRole('button', { name: 'Send to Processing' });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText('What is wrong with it?'), 'Smells like smoke');
    expect(send).toBeEnabled();
  });

  it('says so when the item is already on its way, and does not send it twice', async () => {
    client.get.mockResolvedValue({ data: { ...FOUND, floor_issue: WAITING } });
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="floor" initialCode="ITM0000101" onClose={vi.fn()} />);

    expect(await screen.findByText(/Already on its way to Processing: Dirty \(Pat\)/)).toBeInTheDocument();
    await user.click(screen.getByText('Broken or damaged'));
    expect(screen.getByRole('button', { name: 'Send to Processing' })).toBeDisabled();
    expect(client.post).not.toHaveBeenCalled();
  });

  it("a walk's counter still offers only its own tag problems", () => {
    wrap(<BadTagDialog open where="section_check" reasons={['missing']} initialReason="missing" onClose={vi.fn()} />);

    expect(screen.getByText('Tag missing or unreadable')).toBeInTheDocument();
    expect(screen.queryByText('The item')).not.toBeInTheDocument();
    expect(screen.queryByText('Broken or damaged')).not.toBeInTheDocument();
    expect(screen.queryByText('Price too high')).not.toBeInTheDocument();
  });

  it('the one button opens it, with the item filled in from the item window', async () => {
    client.get.mockResolvedValue({ data: FOUND });
    const user = userEvent.setup();
    wrap(<BadTagButton where="floor" code="ITM0000101" />);

    await user.click(screen.getByRole('button', { name: 'Report a problem' }));
    expect(await screen.findByText('Brass floor lamp')).toBeInTheDocument();
    expect(screen.getByLabelText('Scan or type the tag')).toHaveValue('ITM0000101');
  });
});
