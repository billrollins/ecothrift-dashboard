/** The {{blank}} fill-ins of a text template: part of the e-sign package (D22), so its tests need no host page. */
import type { EsignField, EsignSection } from './api';

const BLANK = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g;
const PARTY = /^party_\d_(name|title|role)$/;
const BUILTIN = ['signer_name', 'signer_title', 'signer_email', 'company_name', 'agreement_date'];

/** The blanks in the text, in order, minus the built-ins the app fills itself. */
export function blanksIn(sections: EsignSection[]): string[] {
  const seen: string[] = [];
  for (const s of sections) {
    for (const m of `${s.heading}\n${s.body}`.matchAll(BLANK)) {
      if (!seen.includes(m[1]) && !BUILTIN.includes(m[1]) && !PARTY.test(m[1])) seen.push(m[1]);
    }
  }
  return seen;
}

/** Keep the field settings of blanks still in the text; new blanks start as required text. */
export function syncFields(sections: EsignSection[], fields: EsignField[]): EsignField[] {
  return blanksIn(sections).map(
    (key) => fields.find((f) => f.key === key) ?? { key, label: key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), kind: 'text', required: true, options: [], default: '' },
  );
}
