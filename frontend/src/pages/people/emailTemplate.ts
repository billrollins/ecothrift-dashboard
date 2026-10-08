import type { JSONContent } from '@tiptap/react';

/**
 * Plain-text email templates ⇄ the review editor's document.
 * Each line is a paragraph; a {placeholder} Dash fills in is a "field" chip; words typed over a chip carry the
 * "typedOver" mark (so the screen can say the value is no longer from Dash).
 */

const PLACEHOLDER = /\{([a-z_]+)\}/g;

export function placeholdersIn(text: string): string[] {
  return [...(text || '').matchAll(PLACEHOLDER)].map((m) => m[1]);
}

function lineContent(line: string, fields: Record<string, string>): JSONContent[] {
  const out: JSONContent[] = [];
  let last = 0;
  for (const match of line.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!(name in fields)) continue; // an unknown {word} stays as typed
    const at = match.index ?? 0;
    if (at > last) out.push({ type: 'text', text: line.slice(last, at) });
    out.push({ type: 'field', attrs: { name } });
    last = at + match[0].length;
  }
  if (last < line.length) out.push({ type: 'text', text: line.slice(last) });
  return out;
}

export function templateToDoc(text: string, fields: Record<string, string>): JSONContent {
  return {
    type: 'doc',
    content: (text || '').replace(/\r\n/g, '\n').split('\n').map((line) => {
      const content = lineContent(line, fields);
      return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
    }),
  };
}

export function docToTemplate(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => (node.type === 'field' ? `{${node.attrs?.name}}` : node.type === 'text' ? node.text ?? '' : ''))
        .join(''),
    )
    .join('\n');
}

const norm = (text: string) =>
  (text || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

/** The words differ from the template (this email only). */
export function isEdited(template: { subject: string; body: string }, subject: string, body: string): boolean {
  return norm(template.subject) !== norm(subject) || norm(template.body) !== norm(body);
}

/** Values the template fills that these words no longer link to. */
export function typedOver(template: { subject: string; body: string }, subject: string, body: string): string[] {
  const now = new Set(placeholdersIn(`${subject}\n${body}`));
  return [...new Set(placeholdersIn(`${template.subject}\n${template.body}`))].filter((name) => !now.has(name));
}

// Characters a plain text message carries 160 at a time (GSM-7); anything else (emoji, curly quotes) drops it to 70.
const GSM = /^[A-Za-z0-9 \n\r@£$¥èéùìòÇØøÅå_ÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** A text's length and how many texts it costs (a long one is split into parts). */
export function textStats(text: string): { length: number; parts: number; plain: boolean } {
  const plain = GSM.test(text);
  const [one, part] = plain ? [160, 153] : [70, 67];
  const length = [...text].length;
  return { length, parts: length <= one ? 1 : Math.ceil(length / part), plain };
}

/** The words as they go out (for Copy text): every linked value filled in. */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return (text || '').replace(PLACEHOLDER, (all, name: string) => (name in values ? values[name] : all));
}
