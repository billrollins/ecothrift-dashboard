import { describe, expect, it } from 'vitest';
import type { RestorationPartsOrderDTO } from '../../../types/inventory.types';
import {
  EFFECTIVE_LABOR_RATE,
  laborCostForMinutes,
  moneyNumber,
  orderNetValue,
  partsRangeByGrade,
  partsScenariosForGrade,
  requestIntent,
  sortOrdersForDesk,
  spentPartsCost,
} from './tarsPartsOrders';

function order(overrides: Partial<RestorationPartsOrderDTO> = {}): RestorationPartsOrderDTO {
  return {
    id: 1,
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
    status: 'requested',
    denied_reason: '',
    est_shipping_days: null,
    expected_delivery_on: null,
    days_late: null,
    attention: 'approval',
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
    total: '12.00',
    parts_cost: '12.00',
    needs_review: false,
    lines: [],
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    ...overrides,
  };
}

describe('laborCostForMinutes', () => {
  it('uses $19.80 an hour', () => {
    expect(EFFECTIVE_LABOR_RATE).toBe(19.8);
    expect(laborCostForMinutes(60)).toBeCloseTo(19.8);
    expect(laborCostForMinutes(30)).toBeCloseTo(9.9);
  });
});

describe('orderNetValue', () => {
  it('is value(target) − value(current) − labor − parts', () => {
    expect(
      orderNetValue({
        targetValue: 100,
        currentValue: 40,
        laborMinutes: 30,
        partsCost: 12,
      }),
    ).toBeCloseTo(38.1);
  });

  it('is null when a price is missing', () => {
    expect(
      orderNetValue({ targetValue: null, currentValue: 40, laborMinutes: 30, partsCost: 12 }),
    ).toBeNull();
  });
});

describe('partsScenariosForGrade', () => {
  it('treats each live order as its own path and includes drafts', () => {
    expect(
      partsScenariosForGrade(
        [
          order({ id: 1, parts_cost: '10.00', status: 'draft' }),
          order({ id: 2, parts_cost: '40.00', status: 'requested' }),
          order({ id: 3, parts_cost: '99.00', status: 'denied' }),
          order({ id: 4, parts_cost: '8.00', target_grade: 'Repairable', status: 'draft' }),
        ],
        'Working',
      ),
    ).toEqual([10, 40]);
  });
});

describe('partsRangeByGrade', () => {
  it('is one number when the paths agree and a min–max when they do not', () => {
    expect(
      partsRangeByGrade([
        order({ id: 1, parts_cost: '12.00' }),
        order({ id: 2, parts_cost: '12.00', status: 'draft' }),
      ]),
    ).toEqual({ Working: { min: 12, max: 12 } });
    expect(
      partsRangeByGrade([
        order({ id: 1, parts_cost: '10.00' }),
        order({ id: 2, parts_cost: '40.00' }),
      ]),
    ).toEqual({ Working: { min: 10, max: 40 } });
  });
});

describe('requestIntent', () => {
  const draft = order({ id: 2, name: 'eBay hinge', status: 'draft' });

  it('is free when nothing else is live', () => {
    expect(requestIntent([draft], draft)).toEqual({ kind: 'free' });
  });

  it('withdraws a requested sibling', () => {
    const requested = order({ id: 1, name: 'Amazon hinge', status: 'requested' });
    expect(requestIntent([requested, draft], draft)).toEqual({ kind: 'withdraw', order: requested });
  });

  it('asks for a cancel when a sibling is approved or purchased', () => {
    const approved = order({ id: 1, name: 'Amazon hinge', status: 'approved' });
    expect(requestIntent([approved, draft], draft)).toEqual({ kind: 'askCancel', order: approved });
    const purchased = order({ id: 1, name: 'Amazon hinge', status: 'purchased' });
    expect(requestIntent([purchased, draft], draft)).toEqual({ kind: 'askCancel', order: purchased });
  });

  it('is free when a sibling is only received', () => {
    const received = order({ id: 1, name: 'Amazon hinge', status: 'received' });
    expect(requestIntent([received, draft], draft)).toEqual({ kind: 'free' });
  });
});

describe('sortOrdersForDesk', () => {
  it('sorts higher grade first, then dearer cost', () => {
    const grades = ['Working', 'Repairable', 'Parts-only'];
    const cheapWorking = order({ id: 1, target_grade: 'Working', total: '10.00' });
    const dearWorking = order({ id: 2, target_grade: 'Working', total: '40.00' });
    const repairable = order({ id: 3, target_grade: 'Repairable', total: '99.00' });
    expect(sortOrdersForDesk([repairable, cheapWorking, dearWorking], grades).map((row) => row.id)).toEqual([
      2, 1, 3,
    ]);
  });
});

describe('spentPartsCost', () => {
  it('counts purchased and received only', () => {
    expect(
      spentPartsCost([
        order({ id: 1, parts_cost: '6.00', status: 'purchased' }),
        order({ id: 2, parts_cost: '4.00', status: 'received' }),
        order({ id: 3, parts_cost: '9.00', status: 'requested' }),
      ]),
    ).toBe(10);
  });
});

describe('moneyNumber', () => {
  it('reads API money strings', () => {
    expect(moneyNumber('7.30')).toBe(7.3);
    expect(moneyNumber('')).toBe(0);
  });
});
