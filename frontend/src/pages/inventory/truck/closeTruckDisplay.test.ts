import { describe, expect, it } from 'vitest';
import type { TruckCloseDTO } from '../../../api/truckClose.api';
import { activeStep, dueWords, notFiledLine, standing } from './closeTruckDisplay';

function data(over: Partial<TruckCloseDTO> = {}): TruckCloseDTO {
  return {
    order: { id: 1, order_number: 'PO-1', vendor: 'Target', description: 'Toys', delivered: '2026-11-05' },
    numbers: {
      items: 3, retail: '250.00', retail_pct: 25, truck_retail: '1000.00', threshold_pct: 5, threshold_retail: '50.00',
      over_threshold: true, price_plus_fees: '220.00', worth: '44.00', lines_without_retail: 0,
      parts: {
        not_received: { units: 2, retail: '100.00' }, broken: { units: 1, retail: '100.00' },
        damaged: { units: 1, retail: '50.00' },
      },
    },
    added: { units: 0, retail: '0.00' },
    state: 'to_file',
    claim: {
      id: null, filed: false, filed_on: null, amount_asked: null, bstock_dispute_id: '', answered: false,
      amount_back: null, back_on: null, status: '', status_label: '',
    },
    lines: [],
    copy_text: '',
    so_far_worth: '44.00',
    working: { pending_items: 0, pallets_open: 0, pallets_total: 2 },
    public_url: null,
    due: { date: '2026-11-11', days_left: 2 },
    finalized: { at: null, by: '' },
    warnings: [],
    ...over,
  };
}

describe('the count-down words', () => {
  it('counts business days and turns red at the end', () => {
    expect(dueWords(3)).toEqual({ text: 'due in 3 days', tone: 'warning' });
    expect(dueWords(1)).toEqual({ text: 'due in 1 day', tone: 'error' });
    expect(dueWords(0).text).toBe('due today');
    expect(dueWords(-2).text).toBe('past due');
    expect(dueWords(null).text).toBe('no due day');
  });

  it('says what is not filed', () => {
    expect(notFiledLine('412.30', 2)).toEqual({ text: 'Dispute not filed: $412, due in 2 days', missed: false });
    // Past the day it is missed, not a count-down.
    expect(notFiledLine('412.30', -1)).toEqual({ text: 'Dispute day passed, $412 not filed', missed: true });
    expect(notFiledLine('0.00', 2)).toBeNull();
    expect(notFiledLine(null, 2)).toBeNull();
  });
});

describe('where the truck stands', () => {
  it('walks from the claim to closed', () => {
    expect(activeStep(data())).toBe(1);
    expect(standing(data())).toBe('A dispute of $44.00 is ready to file on B-Stock.');
    // Late, or still being worked: the top line says so instead of "ready to file".
    expect(standing(data({ due: { date: '2026-10-12', days_left: -5 } }))).toBe('Dispute day passed, $44.00 not filed. Close the truck.');
    const nothingOpen = data({ state: 'nothing', working: { pending_items: 15, pallets_open: 1, pallets_total: 1 } });
    expect(standing(nothingOpen)).toBe('Nothing to dispute so far. The truck is still being worked: 1 of 1 pallets not closed, 15 items waiting.');
    const working = data({ working: { pending_items: 0, pallets_open: 2, pallets_total: 2 } });
    expect(standing(working)).toBe('This truck is still being worked. Closed today, the dispute would be $44.00.');
    expect(activeStep(working)).toBe(0);
    const denied = data({ state: 'answered', claim: { ...data().claim, filed: true, answered: true, amount_asked: '44.00', amount_back: '0.00' } });
    expect(standing(denied)).toBe('B-Stock said no to the $44.00 asked. The truck can be closed.');
    expect(standing({ ...denied, working: { pending_items: 3, pallets_open: 0, pallets_total: 2 } }))
      .toBe('B-Stock said no to the $44.00 asked. The truck is still being worked.');
    const filed = data({ state: 'filed', claim: { ...data().claim, filed: true, amount_asked: '44.00' } });
    expect(activeStep(filed)).toBe(3);
    expect(standing(filed)).toBe('Filed for $44.00. Waiting for the money.');
    const answered = data({
      state: 'answered',
      claim: { ...data().claim, filed: true, answered: true, amount_asked: '44.00', amount_back: '40.00' },
    });
    expect(activeStep(answered)).toBe(4);
    expect(standing(answered)).toContain('$40.00 of $44.00');
    expect(activeStep(data({ finalized: { at: '2026-11-10T12:00:00Z', by: 'Pat' } }))).toBe(5);
  });

  it('a clean truck goes straight to closing', () => {
    const clean = data({ state: 'nothing' });
    expect(activeStep(clean)).toBe(4);
    expect(standing(clean)).toBe('Nothing to dispute on this truck. It can be closed now.');
  });
});
