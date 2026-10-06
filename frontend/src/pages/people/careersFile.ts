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

/**
 * What "Copy for AI" puts on the clipboard: a line for the request, then the same JSON bundle the
 * download gives (instructions, indexes, the current careers file).
 */
export function aiCopyText(bundle: unknown): string {
  return (
    'Follow the "instructions" and "how_to_return" inside this JSON, using only values from "indexes".\n' +
    'What I want changed:\n(write it here)\n\n```json\n' +
    `${JSON.stringify(bundle, null, 2)}\n\`\`\`\n`
  );
}

/** Save any JSON value as a pretty-printed .json file. */
export function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The public link that shows the careers page while it is hidden. */
function publicBase(host: string): string {
  const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  return local ? `${window.location.protocol}//${window.location.hostname}:5174` : 'https://ecothrift.us';
}

export function previewUrl(previewKey: string, host = window.location.host): string {
  return `${publicBase(host)}/careers?preview=${encodeURIComponent(previewKey)}`;
}

/** The real application form in practice mode: anything left blank gets a placeholder. */
export function practiceUrl(previewKey: string, roleSlug = '', host = window.location.host): string {
  const role = roleSlug ? `&role=${encodeURIComponent(roleSlug)}` : '';
  return `${publicBase(host)}/careers/apply?practice=${encodeURIComponent(previewKey)}${role}`;
}
