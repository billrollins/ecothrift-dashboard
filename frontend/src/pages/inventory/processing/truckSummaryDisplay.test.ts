import { describe, expect, it } from 'vitest';
import type { TruckPlanDTO, TruckSummaryDTO } from '../../../api/truckPlan.api';
import {
  businessDaysUntil,
  disputeDueLabel,
  disputedHeadline,
  money,
  moneyWhole,
  onTrackHeadline,
  overUnder,
  paidHeadline,
  planLineParts,
  targetHeadline,
  worthHeadline,
  worthSum,
} from './truckSummaryDisplay';

function summary(over: Partial<TruckSummaryDTO> = {}): TruckSummaryDTO {
  return {
    order: { id: 7, order_number: 'PO-7', vendor: 'Target', description: 'General merchandise', notes: '' },
    paid: { total: '520.00', price: '200.00', fees: '20.00', shipping: '300.00' },
    target: { total: '1040.00', default: '1040.00', is_default: true, multiple: 2, set_by: '', set_at: null },
    on_track: {
      total: '1150.00', priced_so_far: '700.00', priced_items: 40, estimated_left: '450.00', units_left: 30,
      units_own_price: 20, units_by_rate: 8, units_no_estimate: 2, rate_pct: 31.5, rate_basis: 'truck',
      vs_target: '110.00',
    },
    disputes: {
      items: 3, retail: '250.00', retail_pct: 25, truck_retail: '1000.00', threshold_pct: 5,
      threshold_retail: '50.00', over_threshold: true, price_plus_fees: '220.00', worth: '44.00',
      lines_without_retail: 0,
      parts: {
        not_received: { units: 1, retail: '100.00' },
        broken: { units: 1, retail: '100.00' },
        damaged: { units: 1, retail: '50.00' },
      },
    },
    dates: {
      delivered: '2026-11-05', expected_delivery: null, dispute_due: '2026-11-11', dispute_due_from_plan: false,
      dispute_business_days: 4,
    },
    plan: null,
    can_set_target: false,
    ...over,
  };
}

describe('money', () => {
  it('shows cents in the sums and whole dollars on the blocks', () => {
    expect(money('1234.5')).toBe('$1,234.50');
    expect(moneyWhole('1234.5')).toBe('$1,235');
    expect(money(null)).toBe('-');
    expect(moneyWhole('')).toBe('-');
  });
});

describe('over or under the target', () => {
  it('says how far over', () => {
    expect(overUnder('110.00')).toEqual({ text: '$110 over', tone: 'good' });
  });
  it('says how far under', () => {
    expect(overUnder('-350.40')).toEqual({ text: '$350 under', tone: 'warning' });
  });
  it('handles on target and no target', () => {
    expect(overUnder('0.20').text).toBe('On target');
    expect(overUnder(null).text).toBe('No target yet');
  });
});

describe('the money blocks', () => {
  it('Paid shows the total with its three parts behind it', () => {
    const h = paidHeadline(summary());
    expect(h.value).toBe('$520');
    expect(h.detail).toEqual(['Price: $200.00', 'Fees: $20.00', 'Shipping: $300.00', 'Paid: $520.00']);
  });

  it('Target says 2 x Paid until a superuser sets it', () => {
    expect(targetHeadline(summary()).helper).toBe('2 x Paid');
    const set = targetHeadline(summary({
      target: { total: '1500.00', default: '1040.00', is_default: false, multiple: 2, set_by: 'Bill', set_at: '2026-11-10T15:00:00Z' },
    }));
    expect(set.value).toBe('$1,500');
    expect(set.helper).toBe('Set by Bill');
    expect(set.detail.join(' ')).toContain('2 x Paid would be $1,040.00.');
  });

  it('On track shows the total and how it sits against the target', () => {
    const h = onTrackHeadline(summary());
    expect(h.value).toBe('$1,150');
    expect(h.helper).toBe('$110 over');
    expect(h.tone).toBe('good');
    expect(h.detail[0]).toBe('Tags so far: $700.00 on 40 items.');
    expect(h.detail[1]).toBe('Estimate for 30 units on lines still open: $450.00.');
    expect(h.detail).toContain('8 units use retail x 31.5% (this truck so far).');
    expect(h.detail.some((line) => line.startsWith('2 units have no estimate yet.'))).toBe(true);
  });

  it('waits quietly while the numbers load', () => {
    expect(paidHeadline(undefined).value).toBe('-');
    expect(onTrackHeadline(undefined).detail).toEqual([]);
  });
});

describe('the dispute blocks', () => {
  it('Disputed shows the retail, the items and the 5% line', () => {
    const h = disputedHeadline(summary());
    expect(h.value).toBe('$250');
    expect(h.helper).toBe('3 items · 5% line $50');
    expect(h.tone).toBe('warning');
    expect(h.detail[0]).toBe('Not received: 1 unit, $100.00 retail.');
  });

  it('Dispute worth shows the sum', () => {
    const s = summary();
    expect(worthSum(s.disputes)).toBe('($250.00 - $50.00) / $1,000.00 x $220.00 = $44.00');
    const h = worthHeadline(s);
    expect(h.value).toBe('$44');
    expect(h.detail).toContain('Never below $0. Shipping is not in it.');
  });

  it('under the line it is worth $0 and says how far there is to go', () => {
    const s = summary();
    s.disputes = { ...s.disputes, retail: '30.00', over_threshold: false, worth: '0.00' };
    const h = worthHeadline(s);
    expect(h.value).toBe('$0');
    expect(h.detail).toContain('$20.00 more disputed retail reaches the line.');
    expect(disputedHeadline(s).tone).toBe('default');
  });
});

describe('dispute due', () => {
  it('counts weekdays only', () => {
    // Friday to the next Wednesday: Mon, Tue, Wed.
    expect(businessDaysUntil(new Date(2026, 10, 11), new Date(2026, 10, 6))).toBe(3);
    expect(businessDaysUntil(new Date(2026, 10, 6), new Date(2026, 10, 11))).toBe(-3);
  });

  it('says the day and the days left', () => {
    const dates = summary().dates;
    expect(disputeDueLabel(dates, new Date(2026, 10, 9)).value).toBe('Nov 11 · 2 days left');
    expect(disputeDueLabel(dates, new Date(2026, 10, 11)).value).toBe('Nov 11 · Today');
    const closed = disputeDueLabel(dates, new Date(2026, 10, 12));
    expect(closed.value).toBe('Nov 11 · Closed');
    expect(closed.tooltip).toContain('4 business days after delivery.');
  });

  it('says when the plan set the day', () => {
    const label = disputeDueLabel({ ...summary().dates, dispute_due_from_plan: true }, new Date(2026, 10, 9));
    expect(label.tooltip).toContain('Set in the Truck Plan.');
  });

  it('is blank with no delivery date', () => {
    expect(disputeDueLabel({ ...summary().dates, dispute_due: null }).value).toBe('-');
  });
});

describe('the plan line', () => {
  const plan: TruckPlanDTO = {
    pricing_start_pct: '55', watch_for: 'Check every box\nfor the remote.', known_issues: 'Two pallets came in wet.',
    crew: [{ id: 1, name: 'Pat Proc' }, { id: 2, name: 'Ana Lee' }], dispute_due_date: null, updated_by: 'Pat Proc',
    updated_at: '2026-11-10T15:00:00Z',
  };

  it('is empty with no plan', () => {
    expect(planLineParts(null)).toEqual([]);
  });

  it('says the start point, who is on it, issues and what to watch for', () => {
    expect(planLineParts(plan)).toEqual([
      { label: 'Start at', text: '55% of retail' },
      { label: 'On it', text: 'Pat, Ana' },
      { label: 'Issues', text: 'Two pallets came in wet.', strong: true },
      { label: 'Watch for', text: 'Check every box for the remote.' },
    ]);
  });

  it('leaves out what was not written', () => {
    expect(planLineParts({ ...plan, pricing_start_pct: null, crew: [], known_issues: ' ', watch_for: '' })).toEqual([]);
  });
});
