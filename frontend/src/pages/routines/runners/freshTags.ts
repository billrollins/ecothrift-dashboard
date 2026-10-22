import type { FreshTagItem, FreshTagsResponses } from '../../../api/routines.api';

/**
 * Fresh-tag check (retail_tags_and_social Phase 1): the answer rules, mirrored from
 * `apps/routines/kinds.py` (`_clean_fresh_tags`, `submit_blockers`, `fresh_tag_misses`).
 */

/** An item is checked when it was not found, or when it was found and all three answers are in. */
export function isFreshItemChecked(row: FreshTagItem): boolean {
  if (row.found === 'no') return true;
  return row.found === 'yes' && Boolean(row.match && row.retail_ok && row.price_ok);
}

export function freshTagsChecked(responses: FreshTagsResponses | null | undefined): number {
  return (responses?.items ?? []).filter(isFreshItemChecked).length;
}

/** What still blocks Submit: items neither marked "Can't find" nor fully answered. */
export function freshTagsLeft(responses: FreshTagsResponses | null | undefined): number {
  return (responses?.items ?? []).length - freshTagsChecked(responses);
}

/** The bad-tag reasons submitting will record for one item (found items only). */
export function freshItemMisses(row: FreshTagItem): string[] {
  if (row.found !== 'yes') return [];
  const out: string[] = [];
  if (row.match === 'fail') out.push('wrong_item');
  if (row.retail_ok === 'fail') out.push('retail_high');
  if (row.price_ok === 'high') out.push('price_high');
  if (row.price_ok === 'low') out.push('price_low');
  return out;
}

/** How many bad tags submitting will send to PR Fix-it. */
export function freshTagMisses(responses: FreshTagsResponses | null | undefined): number {
  return (responses?.items ?? []).reduce((total, row) => total + freshItemMisses(row).length, 0);
}

/** A tag with no retail printed on it has nothing to believe: retail is n.a. */
export function hasTagRetail(row: Pick<FreshTagItem, 'tag_retail'>): boolean {
  return row.tag_retail != null && row.tag_retail !== '' && Number(row.tag_retail) > 0;
}

/**
 * One answer on one item. "Can't find" clears the three checks (the server ignores them
 * anyway); "Found it" on a tag with no retail answers retail as n.a.
 */
export function answerFreshItem(
  responses: FreshTagsResponses,
  itemId: number,
  patch: Partial<Pick<FreshTagItem, 'found' | 'match' | 'retail_ok' | 'price_ok' | 'note'>>,
): FreshTagsResponses {
  return {
    ...responses,
    items: responses.items.map((row) => {
      if (row.item_id !== itemId) return row;
      const next: FreshTagItem = { ...row, ...patch };
      if (patch.found === 'no') {
        next.match = '';
        next.retail_ok = '';
        next.price_ok = '';
      }
      if (patch.found === 'yes' && !next.retail_ok && !hasTagRetail(next)) next.retail_ok = 'na';
      return next;
    }),
  };
}
