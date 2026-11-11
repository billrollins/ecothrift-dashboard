import { ThemeProvider, createTheme } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnackbarProvider } from 'notistack';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BadTagButton from './BadTagButton';
import BadTagDialog, { typedTag } from './BadTagDialog';

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
    // The line above Send always says what is still needed.
    expect(screen.getByText('First scan or type the tag.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Scan or type the tag'), 'itm0000101{Enter}');
    expect(await screen.findByText('Brass floor lamp')).toBeInTheDocument();
    // Sent as typed; the server reads any case (and a Perks tag's link) as the SKU.
    expect(client.get).toHaveBeenCalledWith('/inventory/floor-issues/lookup/', { params: { code: 'itm0000101' } });
    expect(send).toBeDisabled();
    expect(screen.getByText('Now pick what is wrong, then send.')).toBeInTheDocument();

    await user.click(screen.getByText('Broken or damaged'));
    expect(send).toBeEnabled();
    await user.type(screen.getByLabelText('Note (optional)'), 'Cracked base');
    await user.click(send);

    // Sent: the window says so, names the item, and stays until Done.
    const sent = await screen.findByTestId('report-sent');
    expect(sent).toHaveTextContent('Sent to Processing');
    expect(sent).toHaveTextContent('Brass floor lamp (ITM0000101)');
    expect(sent).toHaveTextContent('Put the item on the PR cart.');
    expect(onClose).not.toHaveBeenCalled();
    expect(client.post).toHaveBeenCalledWith('/inventory/floor-issues/', {
      code: 'ITM0000101', reason: 'broken', where: 'floor', note: 'Cracked base',
      right_price: undefined, right_retail: undefined, photo: undefined,
    });
    expect(onSaved).toHaveBeenCalled();
    // Report another starts a clean report in the same window.
    await user.click(screen.getByRole('button', { name: 'Report another' }));
    expect(screen.getByLabelText('Scan or type the tag')).toHaveValue('');
    expect(screen.getByText('First scan or type the tag.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('a tag problem goes through the same report, with the right price', async () => {
    client.get.mockResolvedValue({ data: FOUND });
    client.post.mockResolvedValue({ data: { floor_issue: WAITING, bad_tag: { id: 1 }, already: false } });
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="register" initialCode="ITM0000101" onClose={vi.fn()} />);

    expect(await screen.findByText('Brass floor lamp')).toBeInTheDocument();
    await user.click(screen.getByText('Price too high'));
    expect(screen.getByText('Ready to send. Price too high: our price on the tag is more than it should be.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Right price, if known'), '12');
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
    expect(screen.getByText('Say what is wrong in the note, then send.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('What is wrong with it?'), 'Smells like smoke');
    expect(send).toBeEnabled();
  });

  it('says so when the item is already on its way, and does not send it twice', async () => {
    client.get.mockResolvedValue({ data: { ...FOUND, floor_issue: WAITING } });
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="floor" initialCode="ITM0000101" onClose={vi.fn()} />);

    expect(await screen.findByText('Already reported: Dirty')).toBeInTheDocument();
    expect(screen.getByText(/\(by Pat\)\. It is waiting in Processing\. Nothing more to send\./)).toBeInTheDocument();
    // Nothing left to pick or send: the only way on is Close.
    expect(screen.queryByText('Broken or damaged')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send to Processing' })).not.toBeInTheDocument();
    const onlyClose = screen.getAllByRole('button', { name: 'Close' });
    await user.click(onlyClose[onlyClose.length - 1]);
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

  it('takes the digits of a tag alone, and says what to do when no item has the tag', async () => {
    expect(typedTag('226270')).toBe('ITM0226270');
    expect(typedTag('itm0226270')).toBe('itm0226270');
    expect(typedTag('HTTPS://ECOTHRIFT.US/I/ITM0226270')).toBe('ITM0226270');
    client.get.mockResolvedValue({ data: { ...FOUND, found: false, item: null, code: 'ITM0000999' } });
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="floor" onClose={vi.fn()} />);
    await user.type(screen.getByLabelText('Scan or type the tag'), '999{Enter}');
    expect(client.get).toHaveBeenCalledWith('/inventory/floor-issues/lookup/', { params: { code: 'ITM0000999' } });
    expect(await screen.findByText(/No item has this tag\. Check the number and try again\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to Processing' })).toBeDisabled();
  });

  it('a second scan replaces the first, and one tap clears the tag', async () => {
    client.get.mockImplementation(async (_url: string, opts: { params: { code: string } }) => ({
      data: { ...FOUND, code: opts.params.code.toUpperCase(), item: { ...ITEM, sku: opts.params.code.toUpperCase() } },
    }));
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="floor" onClose={vi.fn()} />);
    const tag = screen.getByLabelText('Scan or type the tag');
    await user.click(tag);
    await user.keyboard('ITM0000101{Enter}');
    expect(await screen.findByText(/ITM0000101$/)).toBeInTheDocument();
    await user.keyboard('ITM0000202{Enter}');
    await waitFor(() => expect(tag).toHaveValue('ITM0000202'));
    expect(client.get).toHaveBeenLastCalledWith('/inventory/floor-issues/lookup/', { params: { code: 'ITM0000202' } });
    await user.click(screen.getByRole('button', { name: 'Clear the tag' }));
    expect(tag).toHaveValue('');
    expect(screen.getByText('First scan or type the tag.')).toBeInTheDocument();
  });

  it('asks before closing when a note would be lost', async () => {
    client.get.mockResolvedValue({ data: FOUND });
    const onClose = vi.fn();
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="floor" initialCode="ITM0000101" onClose={onClose} />);
    expect(await screen.findByText('Brass floor lamp')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Note (optional)'), 'Cracked base');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Close without sending? The note and photo are lost.')).toBeInTheDocument();
    // Keep going puts the window back as it was.
    await user.click(screen.getByRole('button', { name: 'Keep going' }));
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('Cracked base');
    expect(screen.getByRole('button', { name: 'Send to Processing' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Close without sending' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('a different item scanned after the first starts a clean report', async () => {
    client.get.mockImplementation(async (_url: string, opts: { params: { code: string } }) => ({
      data: { ...FOUND, code: opts.params.code, item: { ...ITEM, id: opts.params.code === 'ITM0000101' ? 7 : 8, sku: opts.params.code } },
    }));
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="floor" onClose={vi.fn()} />);
    const tag = screen.getByLabelText('Scan or type the tag');
    await user.click(tag);
    await user.keyboard('ITM0000101{Enter}');
    await user.click(await screen.findByText('Dirty'));
    await user.type(screen.getByLabelText('Note (optional)'), 'Sticky');
    await user.click(tag);
    await user.keyboard('ITM0000202{Enter}');
    await waitFor(() => expect(tag).toHaveValue('ITM0000202'));
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('');
    expect(screen.getByText('Now pick what is wrong, then send.')).toBeInTheDocument();
  });

  it('an item the system says was sold can only be a wrong tag', async () => {
    client.get.mockResolvedValue({ data: { ...FOUND, item: { ...ITEM, status: 'sold' } } });
    const user = userEvent.setup();
    wrap(<BadTagDialog open where="floor" initialCode="ITM0000101" onClose={vi.fn()} />);
    expect(await screen.findByText('The system says this item was sold.')).toBeInTheDocument();
    await user.click(screen.getByText('Broken or damaged'));
    expect(screen.getByRole('button', { name: 'Send to Processing' })).toBeDisabled();
    expect(screen.getByText('It was sold, so this tag is on the wrong item. Pick "Wrong item".')).toBeInTheDocument();
    await user.click(screen.getByText('Wrong item'));
    expect(screen.getByRole('button', { name: 'Send to Processing' })).toBeEnabled();
  });
});
