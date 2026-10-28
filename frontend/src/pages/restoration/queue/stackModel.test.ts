import { describe, expect, it } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { clusterQueue, combinable, isStack, planSizes, planSplit, stackStake } from './stackModel';

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

function job(overrides: Partial<RestorationJobDTO> = {}): RestorationJobDTO {
  return {
    id: 1,
    stage: 'queued',
    quantity: 1,
    product_id: 7,
    purchase_order_id: 3,
    grade_values: { A: 50, C: 20 },
    items: [{ id: 1, sku: 'ET-1', status: 'on_shelf', condition: '', location: '' }],
    stack_family: null,
    ...overrides,
  } as RestorationJobDTO;
}

describe('planSplit', () => {
  it('makes N equal groups, leftovers to the first groups', () => {
    const plan = planSplit(ids(12), 'equal', 5);
    expect(plan && planSizes(plan)).toEqual([3, 3, 2, 2, 2]);
  });

  it('pulls N out, or exactly the ticked units', () => {
    expect(planSizes(planSplit(ids(12), 'pull', 4)!)).toEqual([8, 4]);
    const ticked = planSplit(ids(5), 'pull', 99, [2, 4]);
    expect(ticked).toEqual({ keep: [1, 3, 5], groups: [[2, 4]] });
  });

  it('makes groups of N with the remainder on its own', () => {
    expect(planSizes(planSplit(ids(12), 'groupsOf', 5)!)).toEqual([5, 5, 2]);
  });

  it('says no when nothing would change', () => {
    expect(planSplit(ids(4), 'equal', 1)).toBeNull();
    expect(planSplit(ids(4), 'equal', 5)).toBeNull();
    expect(planSplit(ids(4), 'pull', 4)).toBeNull();
    expect(planSplit(ids(4), 'groupsOf', 4)).toBeNull();
    expect(planSplit(ids(1), 'equal', 2)).toBeNull();
  });
});

describe('stacks on the list', () => {
  it('counts the stake for every unit', () => {
    const stack = job({ quantity: 3, items: [1, 2, 3].map((id) => ({ id, sku: `ET-${id}`, status: '', condition: '', location: '' })) });
    expect(isStack(stack)).toBe(true);
    expect(stackStake(stack)).toBe(90);
    expect(stackStake(job())).toBe(30);
  });

  it('puts a family together where its first group sorts', () => {
    const a = job({ id: 1, stack_family: 1 });
    const other = job({ id: 2, product_id: 99 });
    const b = job({ id: 3, stack_family: 1 });
    const out = clusterQueue([a, other, b], true);
    expect(out.map((e) => (e.kind === 'job' ? e.job.id : e.jobs.map((j) => j.id)))).toEqual([[1, 3], 2]);
  });

  it('puts loose units of one product from one order together, not across orders', () => {
    const out = clusterQueue([job({ id: 1 }), job({ id: 2 }), job({ id: 3, purchase_order_id: 4 })], true);
    expect(out[0].kind).toBe('cluster');
    expect(out[1]).toMatchObject({ kind: 'job' });
    expect(clusterQueue([job({ id: 1 }), job({ id: 2 })], false).every((e) => e.kind === 'job')).toBe(true);
  });

  it('only joins cards at the same stage', () => {
    expect(combinable([job({ id: 1 }), job({ id: 2, stage: 'sent' })])).toEqual([]);
    expect(combinable([job({ id: 1 }), job({ id: 2 })]).length).toBe(2);
  });
});
