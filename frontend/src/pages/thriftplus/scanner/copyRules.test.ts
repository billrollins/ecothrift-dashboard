import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/** Thrift+ words to avoid (owner's design, 09-25). */
const AVOID = [/\bfees?\b/i, /\bdues\b/i, /\bunlock/i, /\bcash ?back\b/i, /\bpoints\b/i, /\bbonus/i, /\bclawback/i];
/** The signed words (rule D, 2026-10-10): "collect", never "earn"; "covers", never "pays for"; never "Banked"; ThriftBucks, never "Rewards" (owner 10-10). */
const SIGNED = [/\bRewards\b/,/\b(you'd|members|to|would have) earn/i, /\bearns\b/i, /\bpays for\b/i, /\buse now\b/i, /\bmember price\b/i,
  /\b20% less\b/i, /\bBanked\b/];
/**
 * The 10-12 policy (V2, V8, B6, W1; the app designer's list, owner-approved 10-14): one noun (never
 * "InstantBucks", "Full reward" or "Instant reward"), no cover, a return privilege (never a warranty or a
 * "primary function"; the legal "not a warranty" stays), "Thrift+ credit" (never "Return $", "store credit",
 * "gift card" or "Thrift+ Cash"), "collect" (never "earn"), and never "bank"/"banked", "automatic(ally)",
 * "Thrift Bucks", "TBucks" or "Nothing owed, ever".
 */
const POLICY_1012 = [
  /InstantBucks/, /\bfull reward/i, /\binstant reward/i, /\bcover\b/i, /(?<!not a )warranty/i, /primary function/i,
  /\bbank(ed)?\b/i, /\bearn(s|ed|ing)?\b/i, /Return \$/, /store credit/i, /gift card/i, /Thrift\+ Cash/i, /Thrift Bucks/i,
  /\bTBucks\b/i, /\bautomatic(ally)?\b/i, /Nothing owed, ever/i,
];

/** No card (owner 2026-10-14, APP D6): there is no Thrift+ card, so "card" is nowhere a customer reads. */
const NO_CARD = [/\bcards?\b(?![.\w(])/i];  // not `card.isError` and the like

/** "Non-member", never "guest", where a customer reads (owner 2026-10-15, APP D10). Code names (`isGuest`, 'guest') stay. */
const NO_GUEST = [/\bguests?\b/i];

/**
 * What a customer reads: string literals with a space in them, and JSX text (code names have no spaces). Comments go
 * first, since an apostrophe in one would read as the start of a string.
 */
function customerText(source: string): string {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  const parts: string[] = [];
  for (const m of text.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
    const s = m[1] ?? m[2] ?? m[3] ?? '';
    if (/\s/.test(s)) parts.push(s);
  }
  for (const m of text.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) parts.push(m[1]);
  return parts.join('\n');
}

const SRC = join(__dirname, '../../..');

function sourceFiles(dir: string, skip: string[] = []): string[] {
  return readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx') && !skip.includes(f))
    .map((f) => join(dir, f));
}

/**
 * Whole files, comments included, less what is not copy: CSS's own "cover" (objectFit, backgroundSize), and the
 * data names 'bank' and `.banked` (V8: data and API names stay; people read "Kept" and "Your ThriftBucks"), and the
 * browser's own `screen.orientation.unlock()` (APP D16 v2's "Lock upright").
 */
function asCopy(text: string): string {
  return text
    .replace(/\.unlock\(\)/g, '')
    .replace(/\b(objectFit|backgroundSize|object-fit|background-size)\s*:\s*['"]?cover['"]?/g, '')
    .replace(/(['"])bank\1/g, '')
    .replace(/\.banked\b/g, '');
}

function hitsIn(files: string[], rules: RegExp[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    const text = asCopy(readFileSync(file, 'utf8'));
    for (const re of rules) {
      const m = text.match(re);
      if (m) hits.push(`${file.split(/[\\/]/).pop()}: ${m[0]}`);
    }
  }
  return hits;
}

describe('Thrift+ scanner copy', () => {
  it('never uses the words the program avoids', () => {
    const files = [...sourceFiles(__dirname), join(SRC, 'api/thriftPlusMock.ts')];
    expect(hitsIn(files, [...AVOID, ...SIGNED, ...POLICY_1012])).toEqual([]);
  });
});

/** Where the rule shows up in what a customer reads (the scanner's files and its API's messages). */
function customerHits(rule: RegExp): string[] {
  const files = [...sourceFiles(__dirname), join(SRC, 'api/thriftPlusScanner.api.ts')];
  const hits: string[] = [];
  for (const file of files) {
    const m = customerText(readFileSync(file, 'utf8')).match(rule);
    if (m) hits.push(`${file.split(/[\\/]/).pop()}: ${m[0]}`);
  }
  return hits;
}

describe('No Thrift+ card in the app (owner 2026-10-14, APP D6)', () => {
  it('never says card where a customer reads', () => {
    expect(customerHits(NO_CARD[0])).toEqual([]);
  });

  it('catches card in copy and leaves code names alone', () => {
    expect(customerText(`<Box>Scan your card</Box>`)).toMatch(NO_CARD[0]);
    expect(customerText(`setErr('That card is stopped.')`)).toMatch(NO_CARD[0]);
    expect(customerText(`import { CameraCard } from './CameraCard'; testId="my-card"; get('/me/card/')`)).not.toMatch(NO_CARD[0]);
    expect(customerText(`// the tag's card face\n<Box>{card.isError ? 'Try again later.' : null}</Box>`)).not.toMatch(NO_CARD[0]);
  });
});

describe('Non-member, never guest (owner 2026-10-15, APP D10)', () => {
  it('never says guest where a customer reads', () => {
    expect(customerHits(NO_GUEST[0])).toEqual([]);
  });

  it('catches guest in copy and leaves code names alone', () => {
    expect(customerText(`<ButtonBase>Scan as a guest</ButtonBase>`)).toMatch(NO_GUEST[0]);
    expect(customerText(`{ title: 'Guests pay the tag.' }`)).toMatch(NO_GUEST[0]);
    expect(customerText(`const isGuest = s.status === 'guest'; readJson('thriftPlus.real.guest', false); auth.guest.mutate()`)).not.toMatch(NO_GUEST[0]);
  });
});

describe('Thrift+ register, receipt and Dash words (the 10-12 policy)', () => {
  it('keeps the register, ThriftBucks and receipt code free of the retired words', () => {
    // DiscountDialog and discountUtils are the store's own discounts (not Thrift+): their "In-store credit
    // (return)" reason prints on every receipt today, so renaming it would change receipts with Thrift+ off.
    const files = [
      // ReturnsPopup is the owner's own sentence for the cashier to say (10-20): "Returns are valid through ... and are
      // 80% store credit." It stays word for word.
      ...sourceFiles(join(SRC, 'components/pos'), ['DiscountDialog.tsx', 'discountUtils.ts', 'ReturnsPopup.tsx']),
      ...sourceFiles(join(SRC, 'components/thriftplus')),
      join(SRC, 'utils/posReceipt.ts'),
      join(SRC, 'utils/thriftPlusRegister.ts'),
    ];
    expect(hitsIn(files, [...SIGNED, ...POLICY_1012])).toEqual([]);
  });
});
