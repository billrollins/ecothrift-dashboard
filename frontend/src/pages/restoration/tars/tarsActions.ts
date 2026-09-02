/**
 * The vocabulary of work, and how the log reads.
 *
 * Two washes, ten inks. Every action sits on the same cool paper; every desk
 * event sits on the same sage. The verb is the colour of the words.
 */
import type {
  RestorationActionCategory,
  RestorationActionDTO,
} from '../../../types/inventory.types';

export const ACTION_WASH = { soft: '#eef1ef', border: '#d6ded8' } as const;
export const DESK_WASH = { soft: '#e9efea', border: '#cfdcd3' } as const;

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
    color: '#3c7a70',
    ...ACTION_WASH,
  },
  {
    id: 'test',
    label: 'Test',
    hint: 'Check whether something works',
    color: '#3f61a8',
    ...ACTION_WASH,
  },
  {
    id: 'assemble',
    label: 'Assemble',
    hint: 'Put it together, clean it up, make it sellable',
    color: '#6a51a3',
    ...ACTION_WASH,
  },
  {
    id: 'repair',
    label: 'Repair',
    hint: 'Fix or replace what is broken',
    color: '#a6572c',
    ...ACTION_WASH,
  },
  {
    id: 'salvage',
    label: 'Salvage',
    hint: 'Take the worth out of it',
    color: '#a34450',
    ...ACTION_WASH,
  },
];

/** What a new action is until someone says otherwise. */
export const DEFAULT_CATEGORY: RestorationActionCategory = 'inspect';

export const DESK_TYPE_META = [
  {
    id: 'notes',
    label: 'Notes',
    color: '#4a6b52',
    ...DESK_WASH,
  },
  {
    id: 'grades',
    label: 'Grades',
    color: '#4a6b52',
    ...DESK_WASH,
  },
  {
    id: 'estimates',
    label: 'Estimates',
    color: '#4a6b52',
    ...DESK_WASH,
  },
  {
    id: 'parts',
    label: 'Parts',
    color: '#4a6b52',
    ...DESK_WASH,
  },
  {
    id: 'progress',
    label: 'Progress',
    color: '#4a6b52',
    ...DESK_WASH,
  },
] as const;

export function categoryMeta(id: string) {
  return ACTION_CATEGORIES.find((c) => c.id === id) ?? ACTION_CATEGORIES[0];
}

export function historyTypeMeta(id: string) {
  return (
    ACTION_CATEGORIES.find((c) => c.id === id) ??
    DESK_TYPE_META.find((c) => c.id === id) ??
    ACTION_CATEGORIES[0]
  );
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

/** A described sitting that changes type is a new piece of work, not a relabel. */
export function categoryChangeStartsNewSitting(
  current: { is_described: boolean; category: string },
  nextCategory: string,
): boolean {
  return current.is_described && current.category !== nextCategory;
}

/**
 * Enter files the open sitting and starts the next.
 * An empty description cannot move on - that is the same gate as the server.
 */
export function fileCurrentActionPlan(
  current: { description: string },
  draft: string,
): { describe: string | null; startNext: boolean; blockedReason: string | null } {
  const trimmed = draft.trim();
  const describe = trimmed !== current.description.trim() ? trimmed : null;
  if (!trimmed) {
    return {
      describe,
      startNext: false,
      blockedReason: 'Say what you did before starting something else.',
    };
  }
  return { describe, startNext: true, blockedReason: null };
}

/** Filed by the bench itself - populate is not enough; Enter has to run. */
export const CANNED_ACTION_DESCRIPTIONS = [
  'Initial item inspection',
  'Resume item from hold',
] as const;

export function isCannedActionDescription(description: string): boolean {
  return (CANNED_ACTION_DESCRIPTIONS as readonly string[]).includes(description.trim());
}

const claimedCannedEnters = new Set<number>();

/** One Enter per canned sitting, even if the composer remounts. */
export function claimCannedActionEnter(actionId: number, description: string): boolean {
  if (!isCannedActionDescription(description)) return false;
  if (claimedCannedEnters.has(actionId)) return false;
  claimedCannedEnters.add(actionId);
  return true;
}

export function resetClaimedCannedActionEnters(): void {
  claimedCannedEnters.clear();
}
