import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrepRun, SendPreview, SendState } from '../../../api/prepSteps.api';
import SendBar from './SendBar';

const api = vi.hoisted(() => ({ send: vi.fn(), sendNow: vi.fn(), undoSend: vi.fn() }));
vi.mock('../../../api/prepSteps.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/prepSteps.api')>()),
  prepStepsApi: api,
}));

const NOT_SENT: SendState = { sent: false, sent_at: null, rows: 0, blocked: '', processing_url: '/inventory/processing/465' };
const SENT: SendState = { ...NOT_SENT, sent: true, sent_at: '2026-11-25T20:14:00Z', rows: 66 };

function makeRun(send: SendState): PrepRun {
  return {
    id: 8, order_id: 465, order_number: 'WAYFR-1', vendor: 'Wayfair', description: '', step: 'send', steps: [],
    target: { share: 0.55, band: 0.15, total: 100 },
    totals: { lines: 2, units: 2, pieces: 2, manifest_retail: 200, retail: 200, tag: 110, cost: 40, ai_cost: 0, seconds: 1 },
    actions: [], load_info: {}, flag_text: {}, send,
  };
}

function line(row: number, title: string, kind: 'is' | 'like' | null, price: number | null): SendPreview['lines'][number] {
  return {
    row_number: row, manifest_row_id: null, preprocessing_row_id: row, search_tags: [], title, qty: 1,
    product_match: kind ? { product_id: 50, number: 'PRD-00050', kind, confidence: 90, reason: '' } : null,
    product_draft: null, price, price_reason: '', retail: 100, retail_reason: '', pieces: 1, pieces_reason: '',
    sell_as: 'whole', category: 'Furniture', subcategory: 'Seating',
  };
}

const PREVIEW: SendPreview = {
  lines: [line(1, 'Anoka Bedroom Set', 'is', 858), line(2, 'Accent Chair', 'like', null), line(3, 'Mystery Lamp', null, null)],
  would_write: 3, matched: 1, like: 1, drafts: 2, priced: 1, written: 0,
  open: { lines: 2, no_product: 2, no_price: 1, no_retail: 1 },
  state: NOT_SENT,
};

function show(send: SendState, onState = vi.fn()) {
  render(
    <SnackbarProvider>
      <MemoryRouter>
        <SendBar run={makeRun(send)} onState={onState} />
      </MemoryRouter>
    </SnackbarProvider>,
  );
  return onState;
}

const BUTTONS = ['undo-send', 'send-to-processing', 'send-open-processing'];
/** The bar's buttons, in the order they sit. A hidden one still holds its place. */
const inBar = () =>
  [...screen.getByTestId('send-bar').querySelectorAll('[data-testid]')]
    .map((el) => el.getAttribute('data-testid') as string)
    .filter((id) => BUTTONS.includes(id));

describe('Send to Processing (#233)', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('shows what will be written, says the open lines go anyway, and sends on one confirm', async () => {
    api.send.mockResolvedValue(PREVIEW);
    const state = { run: makeRun(SENT), lines: [], send: { written: 3, again: false, priced_by_rule: 1, by_unit: 0, products: 1 } };
    api.sendNow.mockResolvedValue(state);
    const onState = show(NOT_SENT);

    expect(screen.getByTestId('send-open-processing')).not.toBeVisible();
    expect(screen.getByTestId('undo-send')).not.toBeVisible();
    expect(screen.getByTestId('send-status')).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: 'Send to Processing' }));
    expect(await screen.findByText('Send WAYFR-1 to Processing?')).toBeInTheDocument();
    expect(api.sendNow).not.toHaveBeenCalled(); // the preview writes nothing
    const counts = screen.getByTestId('send-counts');
    expect(counts).toHaveTextContent('3lines go to Processing');
    expect(counts).toHaveTextContent('1already matched to a product');
    expect(counts).toHaveTextContent('2new products, made at check-in (1 look like a product we have)');
    expect(counts).toHaveTextContent('1with no price: the truck rule prices them');
    expect(counts).toHaveTextContent('1with no price or retail: priced at check-in');
    expect(counts).toHaveTextContent('2still open in a step: they go as they are');
    const table = screen.getByRole('table');
    expect(within(table).getByText('Is PRD-00050')).toBeInTheDocument();
    expect(within(table).getByText('Like PRD-00050')).toBeInTheDocument();
    expect(within(table).getByText('New product')).toBeInTheDocument();
    expect(within(table).getByText('$858.00')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('send-confirm'));
    await waitFor(() => expect(api.sendNow).toHaveBeenCalledWith(465));
    await waitFor(() => expect(onState).toHaveBeenCalledWith(state));
    expect(await screen.findByText('Sent: 3 lines in Processing. 1 line priced by the truck rule.')).toBeInTheDocument();
  });

  it('a sent truck says so, opens in Processing, and can be sent again or taken back', async () => {
    api.send.mockResolvedValue({ ...PREVIEW, state: SENT });
    api.undoSend.mockResolvedValue({ run: makeRun(NOT_SENT), undo_send: { removed: 66 } });
    const onState = show(SENT);

    expect(screen.getByTestId('send-status')).toHaveTextContent(/^Sent to Processing .+ · 66 rows$/);
    expect(screen.getByRole('link', { name: 'Open in Processing' })).toHaveAttribute('href', '/inventory/processing/465');
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }));
    expect(await screen.findByText('Send WAYFR-1 again? It replaces the 66 rows in Processing.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Undo send' }));
    expect(await screen.findByText(/Takes the 66 rows of WAYFR-1 out of Processing\. The prep here stays as it is\./)).toBeInTheDocument();
    expect(api.undoSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('undo-send-confirm'));
    await waitFor(() => expect(api.undoSend).toHaveBeenCalledWith(465));
    await waitFor(() => expect(onState).toHaveBeenCalled());
    expect(await screen.findByText('Send undone: 66 rows taken out of Processing.')).toBeInTheDocument();
  });

  it('the three buttons hold their places, sent or not: a button that does not apply is hidden, never removed', () => {
    const { unmount } = render(
      <SnackbarProvider>
        <MemoryRouter>
          <SendBar run={makeRun(NOT_SENT)} onState={vi.fn()} />
        </MemoryRouter>
      </SnackbarProvider>,
    );
    expect(inBar()).toEqual(BUTTONS);
    expect(screen.getByTestId('send-to-processing')).toHaveStyle({ width: '190px' }); // "Send again" is the same width
    unmount();
    show(SENT);
    expect(inBar()).toEqual(BUTTONS);
    expect(screen.getByTestId('send-to-processing')).toHaveStyle({ width: '190px' });
  });

  it('once anything is checked in, Send and Undo send are closed and the bar says why', () => {
    const why = '1 check-in already in Processing: Send and Undo send are closed.';
    show({ ...SENT, blocked: why });
    expect(screen.getByTestId('send-status')).toHaveTextContent(why);
    expect(screen.getByRole('button', { name: 'Send again' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo send' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Open in Processing' })).toBeVisible();
  });

  it('a refusal shows in the window, which stays open, and nothing is marked sent', async () => {
    api.send.mockResolvedValue(PREVIEW);
    api.sendNow.mockRejectedValue({ response: { data: { detail: 'A check-in came in on this truck while it was being sent. Nothing was changed.' } } });
    const onState = show(NOT_SENT);
    fireEvent.click(screen.getByRole('button', { name: 'Send to Processing' }));
    expect(await screen.findByTestId('send-error')).toHaveTextContent('');
    fireEvent.click(screen.getByTestId('send-confirm'));
    await waitFor(() => expect(screen.getByTestId('send-error')).toHaveTextContent('A check-in came in on this truck while it was being sent. Nothing was changed.'));
    expect(screen.getByTestId('send-confirm')).toBeEnabled();
    expect(onState).not.toHaveBeenCalled();
  });
});
