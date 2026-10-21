// @vitest-environment node
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const EM = '\u2014';
const EN = '\u2013';

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : [];
  }));
  return nested.flat();
}

describe('no em or en dashes in src', () => {
  // It reads every source file (about 1,250), so under a loaded disk it gets the time a full read can take.
  it('keeps labels and comments in ASCII punctuation', async () => {
    const root = join(__dirname);
    const files = await walk(root);
    const hits: string[] = [];
    // A few dozen reads at a time: all at once can run out of file handles on Windows.
    for (let i = 0; i < files.length; i += 32) {
      const batch = files.slice(i, i + 32);
      const texts = await Promise.all(batch.map((file) => readFile(file, 'utf8')));
      texts.forEach((text, j) => {
        if (text.includes(EM) || text.includes(EN)) {
          hits.push(batch[j].slice(root.length + 1).replace(/\\/g, '/'));
        }
      });
    }
    expect(files.length).toBeGreaterThan(1000);
    expect(hits.sort()).toEqual([]);
  }, 60_000);
});
