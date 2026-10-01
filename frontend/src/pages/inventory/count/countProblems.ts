import type { IssueAction, IssueKind } from '../../../api/stocktake.api';

/** One big button on a problem: what the person did with the item. */
export interface Answer {
  action: IssueAction;
  label: string;
}

export interface ProblemRule {
  /** Short name, shown in lists and on the Fix-it screen. */
  title: string;
  /** One line that says what is wrong, in plain words. */
  help: string;
  answers: Answer[];
  /** Ask for a few words (the right title, the right price). Optional to fill in. */
  ask?: string;
  /** The answer `relocate` needs the section the item belongs in. */
  pickSection?: boolean;
}

const PR: Answer = { action: 'pr_cart', label: 'Put in PR cart' };
const LEAVE: Answer = { action: 'left', label: 'Leave it, just note it' };

/** Every problem and its answers. Two or three buttons each, so an answer takes seconds. */
export const PROBLEM_RULES: Record<IssueKind, ProblemRule> = {
  not_sku: {
    title: 'Not one of our tags',
    help: 'That barcode is not an Eco-Thrift tag. Scan our tag instead. No good tag on it? PR cart.',
    answers: [{ action: 'cleared', label: 'My mistake, skip it' }, PR],
  },
  not_recognized: {
    title: 'Tag not recognized',
    help: 'It looks like our tag, but no item has this number.',
    answers: [{ action: 'cleared', label: 'Misread, skip it' }, PR],
  },
  already_sold: {
    title: 'System says sold',
    help: 'This tag was rung up as sold, but the item is here.',
    answers: [PR, LEAVE],
  },
  not_on_shelf: {
    title: 'Not on the shelf in the system',
    help: 'The system has this item somewhere else (not on the shelf).',
    answers: [PR, LEAVE],
  },
  already_scanned: {
    title: 'Already scanned',
    help: 'This tag was scanned before today.',
    answers: [{ action: 'cleared', label: 'Same item, skip it' }, { action: 'pr_cart', label: 'Two items, one tag: PR cart' }],
  },
  wrong_title: {
    title: 'Wrong title',
    help: 'The tag describes a different item.',
    answers: [PR, LEAVE],
    ask: 'What is it really? (optional)',
  },
  wrong_tag: {
    title: 'Bad tag',
    help: 'The tag is torn, faded or on the wrong item.',
    answers: [PR, LEAVE],
  },
  price_high: {
    title: 'Price too high',
    help: 'It will not sell at this price.',
    answers: [PR, LEAVE],
    ask: 'What price is right? (optional)',
  },
  price_low: {
    title: 'Price too low',
    help: 'It is worth more than the tag says.',
    answers: [PR, LEAVE],
    ask: 'What price is right? (optional)',
  },
  no_tag: {
    title: 'No tag',
    help: 'The item has no tag, or the tag will not scan.',
    answers: [PR],
    ask: 'What is it? (optional)',
  },
  wrong_section: {
    title: 'Wrong section',
    help: 'The item belongs in another part of the store.',
    answers: [{ action: 'relocate', label: 'Put in relocate cart' }, LEAVE],
    pickSection: true,
  },
};

/** Problems a person can report on an item that scanned fine. */
export const REPORTABLE: IssueKind[] = ['wrong_title', 'wrong_tag', 'price_high', 'price_low', 'wrong_section'];

export const ACTION_WORDS: Record<IssueAction, string> = {
  pending: 'Needs an answer',
  cleared: 'Skipped',
  pr_cart: 'PR cart',
  left: 'Left on shelf',
  relocate: 'Relocate cart',
};

/** A price in the scanner's note ("should be $5", "7.50") becomes the suggested new price. */
export function priceFromNote(note: string): string {
  const m = (note || '').match(/\$?\s*(\d{1,5}(?:\.\d{1,2})?)/);
  return m ? Number(m[1]).toFixed(2) : '';
}
