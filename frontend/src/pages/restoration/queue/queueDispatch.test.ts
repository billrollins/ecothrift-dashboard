import { describe, expect, it } from 'vitest';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import {
  DISPATCH_DOTS,
  DISPATCH_LABELS,
  dispatchJobSku,
  dispatchLabel,
  dispatchOption,
  dispatchOptions,
  queueListForJob,
  type DispatchContext,
  type DispatchTarget,
} from './queueDispatch';

const SCALE = ['Working', 'Repairable', 'Parts-only'];

function job(overrides: Partial<RestorationJobDTO> = {}): RestorationJobDTO {
  return {
    id: 1,
    stage: 'queued',
    quantity: 1,
    scale: 'Functional',
    grade_values: { Working: 20, Repairable: 12, 'Parts-only': 5 },
    created_at: '2026-08-12T11:00:00Z',
    sent_at: null,
    sku: 'SKU-1',
    name: 'Controller',
    items: [{ id: 10, sku: 'SKU-1', status: 'in_stock', condition: '', location: 'restoration' }],
    processing_handled_at: null,
    ...overrides,
  } as RestorationJobDTO;
}

function ctx(overrides: Partial<DispatchContext> = {}): DispatchContext {
  return { scaleGrades: SCALE, occupyingBenchJob: null, ...overrides };
}

function occupying(sku = 'SKU-99'): RestorationJobDTO {
  return job({
    id: 99,
    stage: 'bench',
    sku,
    items: [{ id: 99, sku, status: 'in_stock', condition: '', location: 'restoration' }],
  });
}

function targetsOf(j: RestorationJobDTO, context: DispatchContext = ctx()): DispatchTarget[] {
  return dispatchOptions(j, context).map((option) => option.target);
}

function toneOf(j: RestorationJobDTO, target: DispatchTarget, context: DispatchContext = ctx()) {
  return dispatchOption(j, context, target)?.tone;
}

describe('queueListForJob', () => {
  it('maps queued and sent onto Queue', () => {
    expect(queueListForJob(job({ stage: 'queued' }))).toBe('queue');
    expect(queueListForJob(job({ stage: 'sent' }))).toBe('queue');
  });

  it('maps the other stages onto their lists', () => {
    expect(queueListForJob(job({ stage: 'bench' }))).toBe('bench');
    expect(queueListForJob(job({ stage: 'pending' }))).toBe('holding');
    expect(queueListForJob(job({ stage: 'done' }))).toBe('done');
  });

  it('does not invent a list for a returned item', () => {
    expect(queueListForJob(job({ stage: 'returned' }))).toBeNull();
  });
});

describe('visible sets', () => {
  it('shows Open, Hold, Finish on a queued row — Hold stays blocked', () => {
    const queued = job({ stage: 'queued' });
    expect(targetsOf(queued)).toEqual(['bench', 'holding', 'done']);
    expect(dispatchOption(queued, ctx(), 'bench')?.label).toBe('Open');
    expect(dispatchOption(queued, ctx(), 'holding')?.label).toBe('Hold');
    expect(toneOf(queued, 'holding')).toBe('blocked');
  });

  it('shows Queue, Open, Finish on a held row', () => {
    expect(targetsOf(job({ stage: 'pending' }))).toEqual(['queue', 'bench', 'done']);
  });
});

describe('Bench', () => {
  const onBench = job({ stage: 'bench' });

  it('keeps Queue, Hold, Finish in that order — Open is the row', () => {
    expect(targetsOf(onBench)).toEqual(['queue', 'holding', 'done']);
    expect(dispatchOption(onBench, ctx(), 'queue')?.label).toBe('Queue');
    expect(dispatchOption(onBench, ctx(), 'holding')?.label).toBe('Hold');
    expect(dispatchOption(onBench, ctx(), 'done')?.label).toBe('Finish');
    expect(dispatchOption(onBench, ctx(), 'bench')).toBeUndefined();
  });

  it('is ready to send back to the queue, hold, or finish when priced', () => {
    expect(toneOf(onBench, 'queue')).toBe('ready');
    expect(toneOf(onBench, 'holding')).toBe('ready');
    expect(toneOf(onBench, 'done')).toBe('ready');
  });
});

describe('Queue', () => {
  const queued = job({ stage: 'queued' });

  it('is ready to open when priced, not a stack, and the bench is free', () => {
    expect(toneOf(queued, 'bench')).toBe('ready');
    expect(dispatchOption(queued, ctx(), 'bench')?.label).toBe('Open');
  });

  it('blocks Put on Bench without prices and names the missing grades', () => {
    const partial = job({ stage: 'queued', grade_values: { Working: 20 } });
    const option = dispatchOption(partial, ctx(), 'bench');
    expect(option?.tone).toBe('blocked');
    expect(option?.explainer?.whyNot).toContain('Repairable');
    expect(option?.explainer?.whyNot).toContain('Parts-only');
  });

  it('blocks Put on Bench without a scale', () => {
    const option = dispatchOption(job({ stage: 'queued', scale: '' }), ctx(), 'bench');
    expect(option?.tone).toBe('blocked');
    expect(option?.explainer?.whyNot).toMatch(/scale/i);
  });

  it('blocks Put on Bench for a stack before it mentions prices', () => {
    const stacked = job({
      stage: 'queued',
      quantity: 3,
      grade_values: { Working: 20 },
    });
    const option = dispatchOption(stacked, ctx(), 'bench');
    expect(option?.tone).toBe('blocked');
    expect(option?.explainer?.whyNot).toContain('stack of 3');
  });

  it('blocks Hold — work has to start on the bench first', () => {
    expect(toneOf(queued, 'holding')).toBe('blocked');
    expect(dispatchOption(queued, ctx(), 'holding')?.explainer?.whyNot).toMatch(/bench/i);
  });

  it('is ready to Finish an untouched single item', () => {
    expect(toneOf(queued, 'done')).toBe('ready');
    expect(dispatchOption(queued, ctx(), 'done')?.label).toBe('Finish');
  });

  it('is ready to Finish from Queue even when unpriced', () => {
    expect(toneOf(job({ stage: 'queued', grade_values: {}, scale: '' }), 'done')).toBe('ready');
  });

  it('blocks Finish for a stack', () => {
    const option = dispatchOption(job({ stage: 'queued', quantity: 3 }), ctx(), 'done');
    expect(option?.tone).toBe('blocked');
    expect(option?.explainer?.whyNot).toContain('stack of 3');
  });
});

describe('Holding', () => {
  const held = job({ stage: 'pending' });

  it('is ready for Queue', () => {
    expect(toneOf(held, 'queue')).toBe('ready');
    expect(dispatchOption(held, ctx(), 'queue')?.label).toBe('Queue');
  });

  it('is ready to Open even if unpriced — work already started', () => {
    const unpriced = job({ stage: 'pending', grade_values: { Working: 20 } });
    expect(toneOf(unpriced, 'bench')).toBe('ready');
    expect(dispatchOption(unpriced, ctx(), 'bench')?.label).toBe('Open');
  });

  it('is ready to Finish when priced, blocked when not', () => {
    expect(toneOf(held, 'done')).toBe('ready');
    expect(toneOf(job({ stage: 'pending', grade_values: {} }), 'done')).toBe('blocked');
  });
});

describe('Done', () => {
  const done = job({ stage: 'done' });

  it('offers Check in and Back to Queue', () => {
    expect(targetsOf(done)).toEqual(['receive', 'queue']);
    expect(dispatchOption(done, ctx(), 'receive')?.label).toBe('Check in');
    expect(dispatchOption(done, ctx(), 'queue')?.label).toBe('Back to Queue');
    expect(dispatchOption(done, ctx(), 'bench')).toBeUndefined();
    expect(dispatchOption(done, ctx(), 'fix')).toBeUndefined();
  });

  it('is ready while Processing has not taken it in', () => {
    expect(toneOf(done, 'receive')).toBe('ready');
    expect(toneOf(done, 'queue')).toBe('ready');
  });

  it('blocks every action once Processing has received it', () => {
    const handled = job({ stage: 'done', processing_handled_at: '2026-08-14T12:00:00Z' });
    for (const target of ['receive', 'queue'] as const) {
      expect(toneOf(handled, target)).toBe('blocked');
    }
    expect(dispatchOption(handled, ctx(), 'receive')?.explainer?.title).toMatch(/Already received/i);
    expect(dispatchOption(handled, ctx(), 'queue')?.explainer?.steps[0]).toMatch(/Scan/i);
  });
});

describe('occupied bench', () => {
  const taken = ctx({ occupyingBenchJob: occupying('ABC-7') });

  it('blocks Put on Bench from Queue and names the other SKU', () => {
    const option = dispatchOption(job({ stage: 'queued' }), taken, 'bench');
    expect(option?.tone).toBe('blocked');
    expect(option?.explainer?.occupyingSku).toBe('ABC-7');
    expect(option?.explainer?.whyNot).toContain('ABC-7');
  });

  it('blocks Back on Bench from Holding the same way', () => {
    const option = dispatchOption(job({ stage: 'pending' }), taken, 'bench');
    expect(option?.tone).toBe('blocked');
    expect(option?.explainer?.occupyingSku).toBe('ABC-7');
  });

  it('does not treat the item already on this bench as occupying itself', () => {
    const mine = job({ id: 99, stage: 'pending' });
    expect(toneOf(mine, 'bench', ctx({ occupyingBenchJob: occupying() }))).toBe('ready');
  });
});

describe('presentation', () => {
  it('uses the strip verbs', () => {
    expect(DISPATCH_LABELS.bench).toBe('Open');
    expect(DISPATCH_LABELS.holding).toBe('Hold');
    expect(DISPATCH_LABELS.done).toBe('Finish');
    expect(DISPATCH_LABELS.queue).toBe('Back to Queue');
    expect(DISPATCH_LABELS.receive).toBe('Check in');
    expect(dispatchLabel('bench', 'queue')).toBe('Open');
    expect(dispatchLabel('bench', 'holding')).toBe('Open');
    expect(dispatchLabel('queue', 'bench')).toBe('Queue');
    expect(dispatchLabel('queue', 'done')).toBe('Back to Queue');
  });

  it('gives each destination its list colour', () => {
    expect(DISPATCH_DOTS.queue).toBe('#2e7d32');
    expect(DISPATCH_DOTS.bench).toBe('#1565c0');
    expect(DISPATCH_DOTS.holding).toBe('#c2410c');
    expect(DISPATCH_DOTS.done).toBe('#6d4c41');
    expect(DISPATCH_DOTS.receive).toBe('#00897b');
  });

  it('reads a SKU from the first item, then the job, then the id', () => {
    expect(dispatchJobSku(job())).toBe('SKU-1');
    expect(dispatchJobSku(job({ items: [], sku: 'FALLBACK' }))).toBe('FALLBACK');
    expect(dispatchJobSku(job({ items: [], sku: null, id: 44 }))).toBe('Job 44');
  });
});
