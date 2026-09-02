/** Case-insensitive contains across a row's searchable text. Empty query matches everything. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => (field || '').toLowerCase().includes(needle));
}
