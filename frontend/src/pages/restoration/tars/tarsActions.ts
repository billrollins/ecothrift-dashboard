/**
 * The vocabulary of work, and how the log reads.
 *
 * Five kinds of work, each a verb, each a colour. An action points either at
 * one grade or at the item as a whole; the log groups by that, because "what
 * did we do to this item" and "what did we do chasing Like-New" are different
 * questions and both get asked.
 */
import type {
  RestorationActionCategory,
  RestorationActionDTO,
} from '../../../types/inventory.types';

export const ACTION_CATEGORIES: Array<{
  id: RestorationActionCategory;
  label: string;
  /** What this kind of work is for, in the fewest words that distinguish it. */
  hint: string;
  color: string;
  soft: string;
  border: string;
}> = [
  {
    id: 'inspect',
    label: 'Inspect',
    hint: 'Find out what is wrong or what it needs',
    color: '#0e7490',
    soft: '#e0f5fa',
    border: '#a5dbe8',
  },
  {
    id: 'test',
    label: 'Test',
    hint: 'Check whether something works',
    color: '#1d4ed8',
    soft: '#e6edfd',
    border: '#adc4f5',
  },
  {
    id: 'repair',
    label: 'Repair',
    hint: 'Fix or replace what is broken',
    color: '#b45309',
    soft: '#fdf1de',
    border: '#f0cd93',
  },
  {
    id: 'assemble',
    label: 'Assemble',
    hint: 'Put it together, clean it up, make it sellable',
    color: '#6d28d9',
    soft: '#f0e9fd',
    border: '#cdb8f4',
  },
  {
    id: 'salvage',
    label: 'Salvage',
    hint: 'Take the worth out of it',
    color: '#be123c',
    soft: '#fdeaef',
    border: '#f4b3c3',
  },
];

/** What a new action is until someone says otherwise. */
export const DEFAULT_CATEGORY: RestorationActionCategory = 'inspect';

export function categoryMeta(id: string) {
  return ACTION_CATEGORIES.find((c) => c.id === id) ?? ACTION_CATEGORIES[0];
}

/** What an action is pointed at. Empty grade means the item as a whole. */
export function actionScopeLabel(grade: string): string {
  return grade || 'Item';
}

/** Minutes, or hours and minutes once it stops being readable as minutes. */
export function formatDuration(seconds: number): string {
  const total = Math.max(Math.round(seconds / 60), 0);
  if (total < 1) return '<1m';
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * The log, newest first, so the thing just done is the thing you see.
 *
 * The list itself is stored oldest-first because that is the order it happened
 * in; only the reading order is reversed.
 */
export function actionsNewestFirst(actions: RestorationActionDTO[]): RestorationActionDTO[] {
  return [...actions].reverse();
}

/** Actions pointed at one scope, newest first. */
export function actionsForScope(
  actions: RestorationActionDTO[],
  grade: string,
): RestorationActionDTO[] {
  return actionsNewestFirst(actions.filter((a) => a.grade === grade));
}

/** Every scope this item has time against, item first, then grades in use. */
export function scopesWorked(actions: RestorationActionDTO[]): string[] {
  const seen: string[] = [];
  for (const action of actions) {
    if (!seen.includes(action.grade)) seen.push(action.grade);
  }
  return seen.sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
}

/**
 * Whether new work can be opened, and why not when it cannot.
 *
 * The rule the server enforces, mirrored here so the bench can disable the
 * buttons rather than letting someone click into a rejection.
 */
export function blockingAction(
  actions: RestorationActionDTO[],
  currentActionId: number | null,
): RestorationActionDTO | null {
  if (currentActionId == null) return null;
  const current = actions.find((a) => a.id === currentActionId);
  if (!current) return null;
  return current.is_described ? null : current;
}
