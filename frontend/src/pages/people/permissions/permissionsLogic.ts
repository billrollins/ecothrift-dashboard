import type { AccessArea, AccessAreas, AccessEntry, AccessPerson } from '../../../api/accounts.api';

/** People → Permissions (Dash Update #53): the dial words and the tick rules, kept apart from the page. */
export const STEP_NAMES = ['None', 'View', 'Work', 'Manage', 'Full'] as const;
export const FULL = 4;

export type LayerKind = 'level' | 'department' | 'person';

/** Items one layer's entry gives in an area: those at or below its step, plus added, minus taken away. */
export function itemsGiven(area: AccessArea, entry: AccessEntry | undefined): Set<string> {
  const step = entry?.step ?? 0;
  const out = new Set(area.items.filter((i) => !i.locked && i.step <= step).map((i) => i.id));
  for (const id of entry?.add ?? []) out.add(id);
  for (const id of entry?.remove ?? []) out.delete(id);
  return out;
}

/** "Work", "Work +1", "Manage −1"; a department with no step reads "Adds nothing" (or "+2" with single items). */
export function dialLabel(entry: AccessEntry | undefined, kind: LayerKind): string {
  const added = entry?.add?.length ?? 0;
  const removed = entry?.remove?.length ?? 0;
  const extra = `${added ? ` +${added}` : ''}${removed ? ` −${removed}` : ''}`;
  if (entry?.step == null || (kind === 'department' && entry.step === 0)) {
    if (kind === 'department') return added ? `Adds${extra}` : 'Adds nothing';
    if (kind === 'person') return extra ? `Same${extra}` : 'Same as level';
  }
  return `${STEP_NAMES[entry?.step ?? 0]}${extra}`;
}

function withList(entry: AccessEntry, key: 'add' | 'remove', id: string, on: boolean): AccessEntry {
  const list = new Set(entry[key] ?? []);
  if (on) list.add(id);
  else list.delete(id);
  const next = { ...entry, [key]: [...list].sort() };
  if (!next[key]?.length) delete next[key];
  return next;
}

/** A new dial for one area of a level or department: single ticks are cleared (they were relative to the old step). */
export function setStep(entry: AccessEntry | undefined, step: number | null): AccessEntry {
  const next: AccessEntry = { ...(entry ?? {}) };
  delete next.add;
  delete next.remove;
  if (step == null) delete next.step;
  else next.step = step;
  return next;
}

/**
 * One tick on a level or a department. A level's tick takes an item away when its step gives it, and adds it when it
 * does not. A department only adds: an item its step already gives cannot be unticked.
 */
export function toggleLayerItem(area: AccessArea, entry: AccessEntry | undefined, itemId: string,
  kind: 'level' | 'department'): AccessEntry {
  const base = entry ?? {};
  const item = area.items.find((i) => i.id === itemId);
  if (!item || item.locked) return base;
  const byStep = item.step <= (base.step ?? 0);
  if (byStep) {
    if (kind === 'department') return base;
    return withList(base, 'remove', itemId, !(base.remove ?? []).includes(itemId));
  }
  return withList(base, 'add', itemId, !(base.add ?? []).includes(itemId));
}

/**
 * One tick for a person, from what they hold now. A tick on an item they hold undoes their own "add" first, else
 * takes it away (a personal no). A tick on one they don't hold undoes their own "take away" first, else adds it.
 */
export function togglePersonItem(person: AccessPerson, entry: AccessEntry | undefined, itemId: string): AccessEntry {
  const base = entry ?? {};
  const held = itemId in person.items;
  if (held) {
    if ((base.add ?? []).includes(itemId)) return withList(base, 'add', itemId, false);
    return withList(base, 'remove', itemId, true);
  }
  if ((base.remove ?? []).includes(itemId)) return withList(base, 'remove', itemId, false);
  return withList(base, 'add', itemId, true);
}

/** Drop areas left with nothing (a person's or a department's), so the saved layer stays small. */
export function tidy(areas: AccessAreas, kind: LayerKind): AccessAreas {
  const out: AccessAreas = {};
  for (const [area, entry] of Object.entries(areas)) {
    const empty = (entry.step == null || (kind === 'department' && entry.step === 0))
      && !entry.add?.length && !entry.remove?.length;
    if (!empty || kind === 'level') out[area] = entry;
  }
  return out;
}

export const SOURCE_TEXT: Record<string, string> = {
  level: 'From level',
  department: 'From department',
  person: 'Exception',
  owner: 'Owner',
};
