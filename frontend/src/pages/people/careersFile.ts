import { dump as yamlDump, load as yamlLoad } from 'js-yaml';
import type { CareersDoc } from '../../api/hiring.api';

/** The careers file as YAML (the owner's preferred way to read and edit it). */
export function toYaml(doc: CareersDoc): string {
  return yamlDump(doc, { lineWidth: 110, noRefs: true });
}

export type ParseResult = { ok: true; doc: unknown } | { ok: false; error: string };

/**
 * Read what someone pasted: YAML or JSON, with chat prose or a ``` fence around it.
 * Only the shape is read here; the server checks every field and lists the changes.
 */
export function parseCareersText(text: string): ParseResult {
  let body = text.trim();
  if (!body) return { ok: false, error: 'Paste the file first.' };
  const fence = body.match(/```(?:ya?ml|json)?\s*\n([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const start = body.indexOf('{');
  const looksJson = body.startsWith('{') || (!fence && start >= 0 && /\{\s*"format"/.test(body));
  if (looksJson) {
    const end = body.lastIndexOf('}');
    try {
      return { ok: true, doc: JSON.parse(body.slice(start, end + 1)) };
    } catch (err) {
      return { ok: false, error: `Not valid JSON: ${(err as Error).message}` };
    }
  }
  try {
    const doc = yamlLoad(body);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
      return { ok: false, error: 'This does not look like the careers file (it should start with format:).' };
    }
    return { ok: true, doc };
  } catch (err) {
    const message = (err as Error).message.split('\n')[0];
    return { ok: false, error: `Not valid YAML: ${message}` };
  }
}

/** What "Copy for AI" puts on the clipboard: the brief, then the current file. */
export function aiBundle(brief: string, doc: CareersDoc): string {
  return `${brief.trim()}\n\nWhat I want changed:\n(write it here)\n\nThe current file:\n\`\`\`yaml\n${toYaml(doc)}\`\`\`\n`;
}

/** The public link that shows the careers page while it is hidden. */
export function previewUrl(previewKey: string, host = window.location.host): string {
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const base = local ? `${window.location.protocol}//${window.location.hostname}:5174` : 'https://ecothrift.us';
  return `${base}/careers?preview=${encodeURIComponent(previewKey)}`;
}
