/** Build a Google Shopping-style query from listing identity fields. */

export function buildProcessingGoogleQuery(parts: {
  brand?: string;
  title?: string;
  model?: string;
  searchTags?: string[];
}): string {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const text = value.trim();
    if (!text || text.toLowerCase() === 'generic') return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  };
  add(parts.brand ?? '');
  add(parts.title ?? '');
  add(parts.model ?? '');
  for (const tag of parts.searchTags ?? []) add(tag);
  return out.join(' ').slice(0, 200);
}

export function googleSearchUrl(query: string): string {
  const q = query.trim();
  if (!q) return '';
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export const MAX_SEARCH_TAGS = 12;

export function parseSearchTagsCsv(raw: string | undefined | null): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TAGS);
}

export function formatSearchTagsCsv(tags: string[] | undefined | null): string {
  return (tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, MAX_SEARCH_TAGS).join(',');
}

export function addSearchTag(tags: string[], token: string): string[] {
  const piece = token.trim();
  if (!piece) return tags;
  if (tags.some((t) => t.toLowerCase() === piece.toLowerCase())) return tags;
  return [...tags, piece].slice(0, MAX_SEARCH_TAGS);
}
