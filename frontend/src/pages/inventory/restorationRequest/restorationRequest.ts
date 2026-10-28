/**
 * Processing's request to Restoration (owner, 2026-10-28; replaces the v2.217.0 hours / parts / value-after estimate).
 * Shared by every check-in that can send an item to Restoration. Processing picks what it needs (which is also the
 * state it is in now) and types ONE price: what it sells for when done. Each other ending's as-is price fills in
 * from settings and can be changed. Server: `apps/inventory/services/restoration_request.py` (it refuses without a
 * need and the done price, and fills any as-is price we leave out with the same settings).
 */
import type {
  RestorationEnding,
  RestorationNeed,
  RestorationRequestPayload,
  RestorationRequestSettings,
} from '../../../types/inventory.types';

export const NEED_OPTIONS: Array<{ value: RestorationNeed; label: string; ending: RestorationEnding; endingLabel: string }> = [
  { value: 'test', label: 'Test', ending: 'untested', endingLabel: 'Untested, as is' },
  { value: 'clean', label: 'Clean', ending: 'dirty', endingLabel: 'Dirty, as is' },
  { value: 'assemble', label: 'Assemble', ending: 'flat_packed', endingLabel: 'Flat-packed, as is' },
  { value: 'repair', label: 'Repair', ending: 'broken', endingLabel: "Can't repair, as is" },
  { value: 'check_parts', label: 'Check parts', ending: 'parts_unchecked', endingLabel: 'Parts not checked, as is' },
];

/** Same numbers as the server's defaults, for the moment before the settings load. */
export const DEFAULT_REQUEST_SETTINGS: RestorationRequestSettings = {
  as_is_pct: { untested: 50, dirty: 70, broken: 30, parts_unchecked: 60 },
  flat_pack_markup_pct: 10,
  assembly_holdout_pct: 10,
};

export interface RestorationRequestForm {
  needs: RestorationNeed[];
  donePrice: string;
  /** Only the as-is prices someone typed; the rest show (and the server stores) the settings' price. */
  asIs: Partial<Record<RestorationEnding, string>>;
  /** Can't repair: scrap / parts at $0 instead of selling as is. */
  brokenScrap: boolean;
}

export const EMPTY_REQUEST: RestorationRequestForm = { needs: [], donePrice: '', asIs: {}, brokenScrap: false };

export function amount(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim().replace(/[$,\s]/g, '');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cents(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The settings' as-is price for one ending, from the done price. */
export function defaultAsIs(ending: RestorationEnding, done: number, settings: RestorationRequestSettings): number {
  if (ending === 'flat_packed') return cents(done / (1 + settings.flat_pack_markup_pct / 100));
  const pct = settings.as_is_pct[ending as Exclude<RestorationEnding, 'flat_packed'>] ?? 0;
  return cents((done * pct) / 100);
}

/** The as-is price each picked need shows: typed, scrap $0, or the settings' price. Null until the done price. */
export function asIsPrices(
  form: RestorationRequestForm,
  settings: RestorationRequestSettings,
): Array<{ need: RestorationNeed; ending: RestorationEnding; label: string; price: number | null; typed: boolean }> {
  const done = amount(form.donePrice);
  return NEED_OPTIONS.filter((o) => form.needs.includes(o.value)).map((o) => {
    const typedRaw = form.asIs[o.ending];
    const typed = typedRaw != null && typedRaw.trim() !== '';
    let price: number | null;
    if (o.ending === 'broken' && form.brokenScrap) price = 0;
    else if (typed) price = amount(typedRaw);
    else price = done ? defaultAsIs(o.ending, done, settings) : null;
    return { need: o.value, ending: o.ending, label: o.endingLabel, price, typed };
  });
}

/** Done minus the lowest as-is: the item is in every state it needs fixing from. */
export function valueAtStake(form: RestorationRequestForm, settings: RestorationRequestSettings): number | null {
  const done = amount(form.donePrice);
  const prices = asIsPrices(form, settings).map((p) => p.price);
  if (!done || !prices.length || prices.some((p) => p == null)) return null;
  return cents(done - Math.min(...(prices as number[])));
}

/** What still stops it, in the order the fields show. */
export function requestProblems(form: RestorationRequestForm): string[] {
  const out: string[] = [];
  if (!form.needs.length) out.push('Pick what it needs.');
  const done = amount(form.donePrice);
  if (!done) out.push('Give the done price.');
  for (const o of NEED_OPTIONS) {
    if (!form.needs.includes(o.value) || (o.ending === 'broken' && form.brokenScrap)) continue;
    const raw = form.asIs[o.ending];
    if (raw == null || raw.trim() === '') continue;
    const n = amount(raw);
    if (n == null) {
      out.push('An as-is price must be a dollar amount.');
      break;
    }
    if (done && n > done) {
      out.push("An as-is price can't be more than the done price.");
      break;
    }
  }
  return out;
}

export function requestPayload(form: RestorationRequestForm): RestorationRequestPayload {
  const asIs: Partial<Record<RestorationEnding, string>> = {};
  for (const o of NEED_OPTIONS) {
    const raw = form.asIs[o.ending]?.trim();
    if (form.needs.includes(o.value) && raw) asIs[o.ending] = raw;
  }
  return {
    needs: form.needs,
    done_price: form.donePrice.trim(),
    ...(Object.keys(asIs).length ? { as_is: asIs } : {}),
    ...(form.needs.includes('repair') && form.brokenScrap ? { broken_scrap: true } : {}),
  };
}

/** The request a check-in already has (its defaults), ready to edit. Old estimates start empty. */
export function requestFromSaved(saved: Partial<RestorationRequestPayload> | null | undefined): RestorationRequestForm {
  if (!saved) return EMPTY_REQUEST;
  const needs = NEED_OPTIONS.map((o) => o.value).filter((n) => (saved.needs ?? []).includes(n));
  return {
    needs,
    donePrice: saved.done_price ?? '',
    asIs: { ...(saved.as_is ?? {}) },
    brokenScrap: Boolean(saved.broken_scrap),
  };
}

export function toggleNeed(form: RestorationRequestForm, need: RestorationNeed): RestorationRequestForm {
  return {
    ...form,
    needs: form.needs.includes(need) ? form.needs.filter((n) => n !== need) : [...form.needs, need],
  };
}
