/**
 * Search the row on the vendor's own site and on Google, in new tabs (Dash Update #223, Bill 11-24: "Title and photo
 * are what do it for processor in seconds ... if has to manually type and navigate web pages takes minutes").
 *
 * The words: the row's search tags when it has them (Truck Prep's `search_tags`), else brand + model + title.
 */
import { googleSearchUrl } from './processingGoogleQuery';

/** Vendor site searches by a word in the vendor's name or code. A vendor not listed gets Google only. */
const VENDOR_SEARCHES: Array<{ match: RegExp; name: string; url: (q: string) => string }> = [
  { match: /walmart|wlmrt/i, name: 'Walmart', url: (q) => `https://www.walmart.com/search?q=${q}` },
  { match: /target|trget|tgt/i, name: 'Target', url: (q) => `https://www.target.com/s?searchTerm=${q}` },
  { match: /amazon|amz0n|amzn/i, name: 'Amazon', url: (q) => `https://www.amazon.com/s?k=${q}` },
  { match: /wayfair|wayfr/i, name: 'Wayfair', url: (q) => `https://www.wayfair.com/keyword.php?keyword=${q}` },
  { match: /costco/i, name: 'Costco', url: (q) => `https://www.costco.com/CatalogSearch?keyword=${q}` },
  { match: /home ?depot|hmdpt/i, name: 'Home Depot', url: (q) => `https://www.homedepot.com/s/${q}` },
  { match: /lowe'?s|lowes/i, name: "Lowe's", url: (q) => `https://www.lowes.com/search?searchTerm=${q}` },
  { match: /best ?buy|bstby/i, name: 'Best Buy', url: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${q}` },
  { match: /kohl'?s/i, name: "Kohl's", url: (q) => `https://www.kohls.com/search.jsp?search=${q}` },
  { match: /macy'?s/i, name: "Macy's", url: (q) => `https://www.macys.com/shop/featured/${q}` },
];

export interface RowSearchParts {
  brand?: string | null;
  model?: string | null;
  title?: string | null;
  searchTags?: string[];
}

const MAX_WORDS = 10;

/** The words to search with: search tags when the row has them, else brand + model + title (no repeats, no "Generic"). */
export function rowSearchWords(parts: RowSearchParts): string {
  const tags = (parts.searchTags ?? []).map((t) => t.trim()).filter(Boolean);
  const source = tags.length ? tags : [parts.brand ?? '', parts.model ?? '', parts.title ?? ''];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const piece of source) {
    for (const w of piece.split(/\s+/)) {
      const key = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key || key === 'generic' || seen.has(key)) continue;
      seen.add(key);
      words.push(w);
    }
  }
  return words.slice(0, MAX_WORDS).join(' ');
}

export function vendorSearch(vendor: { name?: string | null; code?: string | null }): { name: string; url: (q: string) => string } | null {
  const hay = `${vendor.name ?? ''} ${vendor.code ?? ''}`;
  return VENDOR_SEARCHES.find((v) => v.match.test(hay)) ?? null;
}

/** The tabs to open: the vendor's search (when known) and Google, both for the same words. */
export function rowSearchTabs(parts: RowSearchParts, vendor: { name?: string | null; code?: string | null }): Array<{ label: string; href: string }> {
  const words = rowSearchWords(parts);
  if (!words) return [];
  const site = vendorSearch(vendor);
  const tabs = [];
  if (site) tabs.push({ label: site.name, href: site.url(encodeURIComponent(words)) });
  tabs.push({ label: 'Google', href: googleSearchUrl(words) });
  return tabs;
}

/** Open the tabs; returns how many the browser blocked (a pop-up blocker lets only one through per click). */
export function openRowSearchTabs(tabs: Array<{ href: string }>): number {
  let blocked = 0;
  for (const tab of tabs) {
    const w = window.open(tab.href, '_blank');
    if (w) w.opener = null; // the vendor page gets no handle back on Dash
    else blocked += 1;
  }
  return blocked;
}

const AUTO_OPEN_KEY = 'processing.autoOpenRowSearch';

/** "Open the search on every row I open": remembered per person (the signed-in user) in this browser. */
export function readAutoOpenRowSearch(userId: number | null | undefined): boolean {
  try {
    return window.localStorage.getItem(`${AUTO_OPEN_KEY}:${userId ?? 'anon'}`) === '1';
  } catch {
    return false;
  }
}

export function writeAutoOpenRowSearch(userId: number | null | undefined, on: boolean): void {
  try {
    window.localStorage.setItem(`${AUTO_OPEN_KEY}:${userId ?? 'anon'}`, on ? '1' : '0');
  } catch {
    /* private mode: the switch just does not stick */
  }
}
