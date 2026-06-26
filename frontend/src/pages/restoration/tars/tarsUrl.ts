/** URL helpers shared across the TARS parts/order UIs. */

/** Extract a clean hostname (no scheme, no www) for compact display. */
export function urlDomain(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  try {
    const u = new URL(v.startsWith('http') ? v : `https://${v}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return v;
  }
}

/**
 * Return an absolute URL suitable for an <a href>. Bare-domain URLs (e.g.
 * "amazon.com/p") are prefixed with https:// so the browser doesn't resolve
 * them as relative paths against the current route.
 */
export function absoluteUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}
