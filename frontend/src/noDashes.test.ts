import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const EM = '\u2014';
const EN = '\u2013';

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

describe('no em or en dashes in src', () => {
  it('keeps labels and comments in ASCII punctuation', () => {
    const root = join(__dirname);
    const hits: string[] = [];
    for (const file of walk(root)) {
      const text = readFileSync(file, 'utf8');
      if (text.includes(EM) || text.includes(EN)) {
        hits.push(file.slice(root.length + 1).replace(/\\/g, '/'));
      }
    }
    expect(hits).toEqual([]);
  });
});
