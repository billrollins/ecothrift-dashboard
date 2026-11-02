export type ParseResult = { ok: true; doc: unknown } | { ok: false; error: string };

/** Read what someone pasted: the JSON, with chat prose or a ``` fence around it. */
export function parseDashFixText(text: string): ParseResult {
  let body = text.trim();
  if (!body) return { ok: false, error: 'Paste the file first.' };
  const fence = body.match(/```(?:json)?\s*\n([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) return { ok: false, error: 'This does not look like JSON.' };
  try {
    return { ok: true, doc: JSON.parse(body.slice(start, end + 1)) };
  } catch (err) {
    return { ok: false, error: `Not valid JSON: ${(err as Error).message}` };
  }
}

/** What "Copy for AI" puts on the clipboard. */
export function aiCopyText(bundle: unknown): string {
  return (
    'Follow the "instructions" and "how_to_return" inside this JSON.\n' +
    'What I want changed:\n(write it here)\n\n```json\n' +
    `${JSON.stringify(bundle, null, 2)}\n\`\`\`\n`
  );
}
