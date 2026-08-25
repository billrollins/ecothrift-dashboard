import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RestorationPartDTO, RestorationPartsOrderDTO } from '../../../types/inventory.types';
import { TarsPurchaseDesk, ORDERS_PANE_KICKER, PARTS_PANE_KICKER } from './TarsPartsListPanel';
import { GRADE_TABLE_HEADINGS } from './TarsGradeTable';

function part(over: Partial<RestorationPartDTO> = {}): RestorationPartDTO {
  return {
    id: 1,
    job: 9,
    part_number: '',
    description: 'Hinge',
    url: '',
    qty: 1,
    unit_price: '6.00',
    category: 'parts',
    line_total: '6.00',
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    ...over,
  };
}

describe('bench purchase panes', () => {
  it('keeps grade headings without item, AT, or Work', () => {
    expect(GRADE_TABLE_HEADINGS).toEqual(['GRADE', 'SELLS FOR', 'PARTS', 'MINS', 'WORTH']);
  });

  it('always names the two purchase headers', () => {
    expect(PARTS_PANE_KICKER).toBe('PARTS');
    expect(ORDERS_PANE_KICKER).toBe('ORDERS');
  });

  it('always renders total slots when the lists are empty', () => {
    render(
      <TarsPurchaseDesk
        jobId={9}
        parts={[]}
        orders={[]}
        onCreatePart={() => undefined}
      />,
    );

    expect(screen.getByText('PARTS')).toBeInTheDocument();
    expect(screen.getByText('ORDERS')).toBeInTheDocument();
    expect(screen.getByText('0 · $0')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('FFE $0 · Supplies $0 · Parts $0')).toBeInTheDocument();
    expect(screen.getByText('No purchase orders yet')).toBeInTheDocument();
    expect(screen.getAllByText('None yet')).toHaveLength(2);
    expect(screen.getByText('No parts waiting to inspect')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add line' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Add order' })).toBeDisabled();
  });

  it('puts a go-to link on the row when a part has a URL', () => {
    render(
      <TarsPurchaseDesk
        jobId={9}
        parts={[part({ url: 'https://amazon.com/hinge' })]}
        orders={[]}
      />,
    );

    const open = screen.getByRole('link', { name: 'Open part link' });
    expect(open).toHaveAttribute('href', 'https://amazon.com/hinge');
    expect(open).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('button', { name: 'Edit part link' })).toBeInTheDocument();
  });

  it('keeps the row slot when there is no URL', () => {
    render(
      <TarsPurchaseDesk
        jobId={9}
        parts={[part()]}
        orders={[]}
      />,
    );

    expect(screen.queryByRole('link', { name: 'Open part link' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add part link' })).toBeInTheDocument();
  });

  it('lets a requested order withdraw and an ordered one mark received', async () => {
    const user = userEvent.setup();
    const onWithdrawOrder = vi.fn();
    const onReceiveOrder = vi.fn();
    const { rerender } = render(
      <TarsPurchaseDesk
        jobId={9}
        parts={[part()]}
        orders={[orderDto({ status: 'requested', target_grade: 'Working' })]}
        onWithdrawOrder={onWithdrawOrder}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onWithdrawOrder).toHaveBeenCalledWith(3);

    rerender(
      <TarsPurchaseDesk
        jobId={9}
        parts={[part()]}
        orders={[orderDto({ status: 'purchased', target_grade: 'Working' })]}
        onReceiveOrder={onReceiveOrder}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Received' }));
    expect(onReceiveOrder).toHaveBeenCalled();
  });

  it('lets a received order be inspected in the reserved slot', async () => {
    const user = userEvent.setup();
    const onInspectOrder = vi.fn();
    render(
      <TarsPurchaseDesk
        jobId={9}
        parts={[part()]}
        orders={[
          orderDto({
            status: 'received',
            review_state: 'needs_review',
            needs_review: true,
            attention: 'review',
            job_starting_grade: 'Parts-only',
            target_grade: 'Working',
            item_count: 1,
            total: '6.00',
            lines: [
              {
                id: 8,
                part_id: 1,
                description: 'Hinge',
                url: '',
                category: 'parts',
                qty: 1,
                unit_price: '6.00',
                unit_cost: '6.00',
                line_total: '6.00',
                inspect_verdict: '',
                inspect_note: '',
              },
            ],
          }),
        ]}
        onInspectOrder={onInspectOrder}
      />,
    );
    expect(screen.getByText('Hinge')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Acceptable' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onInspectOrder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3 }),
      [{ id: 8, verdict: 'acceptable', note: '' }],
    );
  });

  it('asks the owner to cancel an accepted order', async () => {
    const user = userEvent.setup();
    const onRequestCancel = vi.fn();
    render(
      <TarsPurchaseDesk
        jobId={9}
        parts={[part()]}
        orders={[orderDto({ status: 'approved', target_grade: 'Working' })]}
        onRequestCancel={onRequestCancel}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Ask to cancel' }));
    expect(onRequestCancel).toHaveBeenCalledWith(3);
  });

  it('requests a draft even when the order has no grade yet', async () => {
    const user = userEvent.setup();
    const onRequestOrder = vi.fn();
    const draft = orderDto({ status: 'draft', target_grade: '', lines: [] });

    render(
      <TarsPurchaseDesk
        jobId={9}
        parts={[part()]}
        orders={[draft]}
        gradeOptions={['Working', 'Repairable']}
        currentGrade="Working"
        onRequestOrder={onRequestOrder}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Request' }));

    expect(onRequestOrder).toHaveBeenCalledWith(draft);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

function orderDto(over: Partial<RestorationPartsOrderDTO> = {}): RestorationPartsOrderDTO {
  return {
    id: 3,
    job: 9,
    job_sku: 'SKU-1',
    job_name: 'Xbox',
    job_stage: 'bench',
    job_starting_grade: '',
    job_final_grade: '',
    job_value_added: null,
    job_spent_parts_cost: null,
    job_dispositioned_at: null,
    name: 'Amazon hinge',
    target_grade: 'Working',
    target_grade_value: '45.00',
    shipping: '0.00',
    tax: '0.00',
    fees: '0.00',
    status: 'draft',
    denied_reason: '',
    est_shipping_days: null,
    expected_delivery_on: null,
    days_late: null,
    attention: '',
    requested_at: null,
    requested_by: null,
    requested_by_name: '',
    approved_at: null,
    approved_by: null,
    approved_by_name: '',
    purchased_at: null,
    purchased_by: null,
    purchased_by_name: '',
    received_at: null,
    received_by: null,
    received_by_name: '',
    review_state: 'ok',
    review_note: '',
    cancel_requested: false,
    cancel_requested_at: null,
    cancel_requested_by: null,
    cancel_requested_by_name: '',
    cancel_reason: '',
    queued_behind: null,
    queued_behind_name: '',
    replacement_id: null,
    replacement_name: '',
    refunded: false,
    item_count: 1,
    total: '6.00',
    parts_cost: '6.00',
    needs_review: false,
    lines: [],
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    ...over,
  };
}
