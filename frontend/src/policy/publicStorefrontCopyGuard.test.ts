/**
 * Machine-enforced Online Sales policy copy for the public storefront.
 * Scans ../frontend-public/src (no vitest runner there) from the staff package.
 *
 * Forbidden customer-facing phrases must not appear unless the line is on the
 * explicit allowlist (negation prose, legacy technical identifiers, or a
 * `POLICY_COPY_OK` comment on that line).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_SRC = path.resolve(HERE, '../../../frontend-public/src');

const FORBIDDEN: { id: string; re: RegExp }[] = [
  { id: 'buy now', re: /\bbuy now\b/i },
  { id: 'place order', re: /\bplace order\b/i },
  { id: 'pay online', re: /\bpay online\b/i },
  { id: 'add to cart', re: /\badd to cart\b/i },
  { id: 'checkout', re: /\bcheckout\b/i },
  { id: 'shipping', re: /\bshipping\b/i },
  { id: 'delivery', re: /\bdelivery\b/i },
];

/** Narrow exceptions - keep this list short and commented. */
const ALLOW_LINE: RegExp[] = [
  /POLICY_COPY_OK/,
  // Negation prose: we promise we do NOT ship / deliver / take online payment.
  // Keep this narrow - a bare /no shipping/i would allow-list the whole line.
  /no shipping,\s*delivery/i,
  // Deprecated / ended messaging that steers customers to holds.
  /online checkout (has ended|is no longer available|disabled)/i,
  // Technical identifiers (CSS, routes, symbols) - not customer-facing copy.
  /class(Name)?=\{?["'`][^"'`]*checkout/i,
  /\.checkout[\w-]*/,
  /cartcheckout/,
  /\bCheckoutPage\b/,
  /path=["']checkout["']/,
  /pages\/CheckoutPage/,
  /\bfunction checkout\b/,
  /export async function checkout\b/,
  /to=["']\/checkout["']/,
  /`\/checkout`/,
  /\/checkout["'`]/,
  /checkout, order, 404/,
  /\(product cards, cart drawer, checkout\)/,
  /Phase 3: checkout/,
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function lineAllowed(line: string): boolean {
  return ALLOW_LINE.some((re) => re.test(line));
}

describe('public storefront policy copy guard', () => {
  it('flags forbidden commerce language in frontend-public/src', () => {
    expect(fs.existsSync(PUBLIC_SRC)).toBe(true);
    const hits: string[] = [];
    for (const file of walk(PUBLIC_SRC)) {
      const rel = path.relative(PUBLIC_SRC, file).replace(/\\/g, '/');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, idx) => {
        if (lineAllowed(line)) return;
        for (const { id, re } of FORBIDDEN) {
          if (re.test(line)) {
            hits.push(`${rel}:${idx + 1} [${id}] ${line.trim()}`);
          }
        }
      });
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});
