import { describe, expect, it } from 'vitest';

// The package's own files, as text (tests included): what packages/esign ships.
const files = import.meta.glob('./*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('the e-sign package', () => {
  it('imports nothing from the host app but its HTTP client, the one seam (api.ts)', () => {
    expect(Object.keys(files).length).toBeGreaterThan(5);
    const outside = Object.entries(files).flatMap(([name, text]) =>
      [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1])
        .filter((from) => from.startsWith('@/') || from.startsWith('../'))
        .filter((from) => !(name === './api.ts' && from === '@/services/api'))
        .map((from) => `${name}: ${from}`));
    expect(outside).toEqual([]);
  });
});
