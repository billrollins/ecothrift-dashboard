/**
 * Where an Overview item can go next, and what to say when it cannot.
 *
 * Every row on a tab shows the same buttons. Blocked moves stay on the strip
 * with an explainer - never silent holes, and never extra lines on the card.
 */
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { isReadyForBench, missingGrades, QUEUE_LISTS, type QueueListId } from './restorationQueueModel';

export const DISPATCH_TARGETS = ['queue', 'bench', 'holding', 'done', 'receive', 'fix'] as const;
export type DispatchTarget = (typeof DISPATCH_TARGETS)[number];

const LIST_TARGETS: Record<QueueListId, readonly DispatchTarget[]> = {
  queue: ['bench', 'holding', 'done'],
  bench: ['queue', 'holding', 'done'],
  holding: ['queue', 'bench', 'done'],
  done: ['receive', 'queue'],
};

export const DISPATCH_LABELS: Record<DispatchTarget, string> = {
  queue: 'Back to Queue',
  bench: 'Open',
  holding: 'Hold',
  done: 'Finish',
  receive: 'Check in',
  fix: 'Fix Finish',
};

export const DISPATCH_DOTS: Record<DispatchTarget, string> = {
  queue: '#2e7d32',
  bench: '#1565c0',
  holding: '#c2410c',
  done: '#6d4c41',
  receive: '#00897b',
  fix: '#6d4c41',
};

export type DispatchTone = 'ready' | 'blocked';

export type DispatchExplainer = {
  title: string;
  whyNot: string;
  steps: string[];
  occupyingSku?: string;
};

export type DispatchOption = {
  target: DispatchTarget;
  label: string;
  tone: DispatchTone;
  dot: string;
  explainer?: DispatchExplainer;
  section?: string;
};

export type DispatchContext = {
  scaleGrades: string[];
  occupyingBenchJob: RestorationJobDTO | null;
};

export function queueListForJob(job: RestorationJobDTO): QueueListId | null {
  return QUEUE_LISTS.find((entry) => (entry.stages as readonly string[]).includes(job.stage))?.id ?? null;
}

export function dispatchJobSku(job: RestorationJobDTO): string {
  return job.items?.[0]?.sku ?? job.sku ?? `Job ${job.id}`;
}

export function dispatchLabel(target: DispatchTarget, list: QueueListId | null): string {
  if (target === 'bench') return 'Open';
  if (target === 'queue') return list === 'done' ? 'Back to Queue' : 'Queue';
  return DISPATCH_LABELS[target];
}

export function dispatchOptions(job: RestorationJobDTO, ctx: DispatchContext): DispatchOption[] {
  const list = queueListForJob(job);
  const targets = LIST_TARGETS[list ?? 'queue'];
  if (list === 'done') {
    return targets.map((target) => doneRowOption(job, ctx, target));
  }
  return targets.map((target) => optionFor(job, ctx, list, target));
}

export function dispatchOption(
  job: RestorationJobDTO,
  ctx: DispatchContext,
  target: DispatchTarget,
): DispatchOption | undefined {
  return dispatchOptions(job, ctx).find((option) => option.target === target);
}

function optionFor(
  job: RestorationJobDTO,
  ctx: DispatchContext,
  list: QueueListId | null,
  target: DispatchTarget,
): DispatchOption {
  const base = {
    target,
    label: dispatchLabel(target, list),
    dot: DISPATCH_DOTS[target],
  };

  if (list == null) {
    return { ...base, tone: 'blocked', explainer: processingOwnsExplainer() };
  }

  if (target === 'bench') return benchOption(job, ctx, list, base);
  if (target === 'queue') return { ...base, tone: 'ready' };
  if (target === 'holding') return holdingOption(list, base);
  return finishOption(job, ctx, list, base);
}

function benchOption(
  job: RestorationJobDTO,
  ctx: DispatchContext,
  list: QueueListId,
  base: Pick<DispatchOption, 'target' | 'label' | 'dot'>,
): DispatchOption {
  const occupying =
    ctx.occupyingBenchJob != null && ctx.occupyingBenchJob.id !== job.id ? ctx.occupyingBenchJob : null;

  if (list === 'bench') {
    return { ...base, tone: 'ready' };
  }

  if (list === 'queue') {
    if (job.quantity > 1) {
      return { ...base, tone: 'blocked', explainer: stackExplainer(job, 'bench') };
    }
    if (!isReadyForBench(job, ctx.scaleGrades)) {
      return { ...base, tone: 'blocked', explainer: pricesExplainer(job, ctx.scaleGrades, 'bench') };
    }
    if (occupying) {
      return { ...base, tone: 'blocked', explainer: occupiedExplainer(occupying) };
    }
    return { ...base, tone: 'ready' };
  }

  if (occupying) {
    return { ...base, tone: 'blocked', explainer: occupiedExplainer(occupying) };
  }
  return { ...base, tone: 'ready' };
}

function holdingOption(
  list: QueueListId,
  base: Pick<DispatchOption, 'target' | 'label' | 'dot'>,
): DispatchOption {
  if (list === 'queue') {
    return {
      ...base,
      tone: 'blocked',
      explainer: {
        title: "Can't hold it yet",
        whyNot: 'Holding is for work that has already started on the bench. This item is still in the queue.',
        steps: ['Put it on the bench first.', 'From the bench, Hold when you need to park it.'],
      },
    };
  }
  return { ...base, tone: 'ready' };
}

function finishOption(
  job: RestorationJobDTO,
  ctx: DispatchContext,
  list: QueueListId,
  base: Pick<DispatchOption, 'target' | 'label' | 'dot'>,
): DispatchOption {
  if (list === 'queue') {
    if (job.quantity > 1) {
      return { ...base, tone: 'blocked', explainer: stackExplainer(job, 'finish') };
    }
    return { ...base, tone: 'ready' };
  }
  if (!isReadyForBench(job, ctx.scaleGrades)) {
    return { ...base, tone: 'blocked', explainer: pricesExplainer(job, ctx.scaleGrades, 'finish') };
  }
  return { ...base, tone: 'ready' };
}

function doneRowOption(
  job: RestorationJobDTO,
  _ctx: DispatchContext,
  target: DispatchTarget,
): DispatchOption {
  const handled = Boolean(job.processing_handled_at);
  const base: DispatchOption = {
    target,
    label: dispatchLabel(target, 'done'),
    tone: 'ready',
    dot: DISPATCH_DOTS[target],
  };

  if (handled) {
    return { ...base, tone: 'blocked', explainer: alreadyCheckedInExplainer(job, target) };
  }

  return { ...base, tone: 'ready' };
}

function pricesExplainer(
  job: RestorationJobDTO,
  scaleGrades: string[],
  kind: 'bench' | 'finish',
): DispatchExplainer {
  const verb = kind === 'bench' ? 'put it on the bench' : 'finish it';
  if (!job.scale) {
    return {
      title: `Can't ${verb} yet`,
      whyNot: 'This item has no grade scale, so there is nothing to price against.',
      steps: ['Choose a scale on this row.', 'Fill in a price for every grade.', `Then ${verb} again.`],
    };
  }
  const missing = missingGrades(job, scaleGrades);
  const named = namedList(missing);
  return {
    title: `Can't ${verb} yet`,
    whyNot:
      kind === 'bench'
        ? `The bench uses the grade prices while you work. Still missing ${named}.`
        : `Every grade on the scale needs a price before the work can be finished. Still missing ${named}.`,
    steps: [`Fill in ${named} on this row.`, `Then ${verb} again.`],
  };
}

function occupiedExplainer(occupying: RestorationJobDTO): DispatchExplainer {
  const sku = dispatchJobSku(occupying);
  return {
    title: 'Your bench is already taken',
    whyNot: `Your bench already has ${sku}. One person, one item.`,
    steps: [`Finish ${sku}, hold it, or send it back to the queue first.`, 'Then put this item on the bench.'],
    occupyingSku: sku,
  };
}

function stackExplainer(job: RestorationJobDTO, kind: 'bench' | 'finish'): DispatchExplainer {
  const verb = kind === 'bench' ? 'put it on the bench' : 'finish it';
  return {
    title: `Can't ${verb} yet`,
    whyNot: `This is a stack of ${job.quantity} items. ${kind === 'bench' ? 'The bench' : 'Finish'} takes one item at a time.`,
    steps: ['Scan one item tag to split it off the stack.', `Then ${verb}.`],
  };
}

function alreadyCheckedInExplainer(job: RestorationJobDTO, target: DispatchTarget): DispatchExplainer {
  const when = handledWhen(job.processing_handled_at);
  if (target === 'receive') {
    return {
      title: 'Already received',
      whyNot: `Processing took this in on ${when}.`,
      steps: ['Leave it. The item is already on Processing\'s desk.'],
    };
  }
  if (target === 'fix') {
    return {
      title: "Can't fix the finish",
      whyNot: `Processing has already checked this in on ${when}. Changing where it went would move items they have already shelved.`,
      steps: ['Ask Processing to fix it on their desk.'],
    };
  }
  return {
    title: "Can't send it back",
    whyNot: `Processing has already checked this in on ${when}.`,
    steps: ['Scan the item tag on the Queue to bring it back.'],
  };
}

function processingOwnsExplainer(): DispatchExplainer {
  return {
    title: 'Processing owns this now',
    whyNot: 'This item has already left restoration.',
    steps: ['Scan the item tag on the Queue if it needs to come back.'],
  };
}

function handledWhen(iso: string | null | undefined): string {
  if (!iso) return 'an earlier date';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'an earlier date';
  return date.toLocaleDateString();
}

function namedList(parts: string[]): string {
  if (parts.length === 0) return 'the missing grades';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}
