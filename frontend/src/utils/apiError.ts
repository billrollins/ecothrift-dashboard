/**
 * The words to show when an API call fails: the server's own message, never "Request failed with status code 403".
 *
 * The API client (api/client.ts) already puts these words on every failed request's `message`, so
 * `err.message` reads right everywhere; `apiErrorMessage(err, fallback)` is the helper for new code.
 */
import { isAxiosError } from 'axios';

/** View as answers every edit with 403 `VIEW_AS_READ_ONLY` (apps/accounts/middleware.py). */
export const VIEW_AS_READ_ONLY_TEXT = 'View as is read-only. Use Back to make changes.';

/** The server's message in an error body: View as's sentence, else `detail`, `error` or the first non-field error. */
export function serverErrorText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as { code?: unknown; detail?: unknown; error?: unknown; non_field_errors?: unknown };
  if (body.code === 'VIEW_AS_READ_ONLY') return VIEW_AS_READ_ONLY_TEXT;
  for (const value of [body.detail, body.error, body.non_field_errors]) {
    const text = Array.isArray(value) ? value.find((v) => typeof v === 'string' && v.trim()) : value;
    if (typeof text === 'string' && text.trim()) return text.trim();
  }
  return null;
}

/** axios's own wording ("Request failed with status code 500"): never shown to staff. */
function isGenericAxiosText(message: string): boolean {
  return /^Request failed with status code \d+$/.test(message);
}

/** What a toast says when `err` failed: the server's words, else the error's own message, else `fallback`. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError(err)) {
    const text = serverErrorText(err.response?.data);
    if (text) return text;
    return err.message && !isGenericAxiosText(err.message) ? err.message : fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
