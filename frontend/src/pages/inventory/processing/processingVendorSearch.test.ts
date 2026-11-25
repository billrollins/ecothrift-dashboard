import { afterEach, describe, expect, it, vi } from 'vitest';
import { openRowSearchTabs, readAutoOpenRowSearch, rowSearchTabs, rowSearchWords, writeAutoOpenRowSearch } from './processingVendorSearch';

describe('vendor + Google search for a row (#223)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the row\'s search tags when it has them, else brand + model + title, without repeats or "Generic"', () => {
    expect(rowSearchWords({ brand: 'Energizer', title: 'Energizer 2032 Batteries 2-Pack', searchTags: [] }))
      .toBe('Energizer 2032 Batteries 2-Pack');
    expect(rowSearchWords({ brand: 'Generic', model: 'X1', title: 'Bar Stool' })).toBe('X1 Bar Stool');
    expect(rowSearchWords({ brand: 'Energizer', title: 'long title', searchTags: ['cr2032', 'coin battery'] }))
      .toBe('cr2032 coin battery');
  });

  it('opens the vendor\'s own site search and Google for the same words', () => {
    const tabs = rowSearchTabs({ brand: 'Energizer', title: '2032 Batteries' }, { name: 'Walmart', code: 'WLMRT' });
    expect(tabs).toEqual([
      { label: 'Walmart', href: 'https://www.walmart.com/search?q=Energizer%202032%20Batteries' },
      { label: 'Google', href: 'https://www.google.com/search?q=Energizer%202032%20Batteries' },
    ]);
    expect(rowSearchTabs({ title: 'Sofa' }, { name: 'Wayfair' })[0].href).toBe('https://www.wayfair.com/keyword.php?keyword=Sofa');
    expect(rowSearchTabs({ title: 'Sofa' }, { name: 'Some Liquidator' }).map((t) => t.label)).toEqual(['Google']);
    expect(rowSearchTabs({ title: '' }, { name: 'Walmart' })).toEqual([]);
  });

  it('counts a tab the browser blocked', () => {
    const tab = { opener: 'dash' } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValueOnce(tab).mockReturnValueOnce(null);
    expect(openRowSearchTabs([{ href: 'a' }, { href: 'b' }])).toBe(1);
    expect(tab.opener).toBeNull();
  });

  it('remembers "search every row I open" per person', () => {
    writeAutoOpenRowSearch(7, true);
    expect(readAutoOpenRowSearch(7)).toBe(true);
    expect(readAutoOpenRowSearch(8)).toBe(false);
    writeAutoOpenRowSearch(7, false);
    expect(readAutoOpenRowSearch(7)).toBe(false);
  });
});
