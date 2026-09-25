import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/** Thrift+ words to avoid (owner's design, 09-25). */
const AVOID = [/\bfees?\b/i, /\bdues\b/i, /\bunlock/i, /\bcash ?back\b/i, /\bpoints\b/i, /\bbonus/i, /\bclawback/i];

describe('Thrift+ scanner copy', () => {
  it('never uses the words the program avoids', () => {
    const files = [
      ...readdirSync(__dirname)
        .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
        .map((f) => join(__dirname, f)),
      join(__dirname, '../../../api/thriftPlusMock.ts'),
    ];
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const re of AVOID) {
        const m = text.match(re);
        if (m) hits.push(`${file.split(/[\\/]/).pop()}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
