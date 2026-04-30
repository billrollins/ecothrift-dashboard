/**
 * Step 1 preprocessing diagnostics — logs whenever `import.meta.env.DEV` is true.
 * Filter DevTools console: `[Preprocessing:S1]`
 *
 * Payloads are JSON-stringified into the same log line so copy/paste and narrow
 * consoles show numbers — not a collapsed `Object`.
 */

function stringifyPrepPayload(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

export function prepS1(tag: string, data?: unknown): void {
  if (!import.meta.env.DEV) return;
  const ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) {
    console.info(`[Preprocessing:S1][${ts}] ${tag} ${stringifyPrepPayload(data)}`);
  } else {
    console.info(`[Preprocessing:S1][${ts}] ${tag}`);
  }
}

/** Multi-line JSON for huge payloads (manifest rows); still prefixed for filtering. */
export function prepS1Pretty(tag: string, data: unknown): void {
  if (!import.meta.env.DEV) return;
  const ts = new Date().toISOString().slice(11, 23);
  try {
    console.info(`[Preprocessing:S1][${ts}] ${tag}\n${JSON.stringify(data, null, 2)}`);
  } catch {
    console.info(`[Preprocessing:S1][${ts}] ${tag}`, String(data));
  }
}
