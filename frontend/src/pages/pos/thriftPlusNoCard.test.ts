import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Owner 2026-10-14: "there is no mention of CARD anywhere." There is no Thrift+ membership card: a member shows the
 * member QR in the Thrift+ app or gives their phone number. No Thrift+ words at the register or on the receipt say
 * "card". Payment cards (the POS Card tender, CardX) stay exactly as they are, so their words are allowed.
 */
const CARD = /\bcards?\b/i;
/** Payment-card words: the POS tender, not Thrift+. */
const PAYMENT = /cash or card|card tender|CardX|card surcharge|card type|credit card|debit card|card total charged|card \(|run a real card|card step|card and split|card or split/gi;

const SRC = join(__dirname, '../..');

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** What people read: string literals with a space in them (not keys like 'card'), and JSX text. */
function copyIn(file: string): string[] {
  const text = stripComments(readFileSync(join(SRC, file), 'utf8'));
  const literals = text.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
  const jsx = [...text.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  return [...literals, ...jsx].map((s) => s.replace(PAYMENT, '')).filter((s) => /\s/.test(s.trim()));
}

function cardHits(file: string, only?: RegExp): string[] {
  return copyIn(file)
    .filter((s) => !only || only.test(s))
    .filter((s) => CARD.test(s))
    .map((s) => `${file}: ${s.trim().slice(0, 100)}`);
}

describe('No Thrift+ card in register or receipt words (owner 2026-10-14)', () => {
  it('the Thrift+ register screens never say card', () => {
    const files = [
      'components/pos/ThriftPlusPanel.tsx',
      'components/pos/ThriftPlusPhoneFind.tsx',
      'components/pos/ThriftPlusSignupDialog.tsx',
      'components/pos/ThriftPlusReturnDialog.tsx',
      'components/pos/ThriftMemberDialog.tsx',
      'components/pos/ReturnsPopup.tsx',
      'components/thriftplus/MemberCard.tsx',
      'components/thriftplus/MemberFind.tsx',
      'pages/pos/MembersLookupPage.tsx',
      'utils/thriftPlusRegister.ts',
      'utils/posReceipt.ts',
    ];
    expect(files.flatMap((f) => cardHits(f))).toEqual([]);
  });

  it("the terminal's Thrift+ words never say card; its payment-card words stay", () => {
    expect(cardHits('pages/pos/TerminalPage.tsx', /Thrift\+|member|re-ring|ThriftBucks/i)).toEqual([]);
    const terminal = readFileSync(join(SRC, 'pages/pos/TerminalPage.tsx'), 'utf8');
    expect(terminal).toMatch(/Scan a SKU or a Thrift\+ member QR/);
  });

  it('the check catches a card in Thrift+ words and lets payment cards through', () => {
    const sample = ['Do you have a card yet?', 'Take $5.00 by cash or card.', 'Card (debit)'].map((s) => s.replace(PAYMENT, ''));
    expect(sample.filter((s) => CARD.test(s))).toEqual(['Do you have a card yet?']);
  });
});
