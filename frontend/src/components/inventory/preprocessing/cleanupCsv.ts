import type { CleanupCsvApplyRowPayload } from '../../../api/inventory.api';

/** Narrow cleanup CSV columns (must match backend upload_cleanup_csv). */
export const CLEANUP_CSV_FIELDS = [
  'row_id',
  'ai_title',
  'ai_brand',
  'ai_model',
  'category',
  'condition',
  'proposed_price',
] as const;

export type ParseCleanupCsvResult =
  | { ok: true; rows: CleanupCsvApplyRowPayload[] }
  | { ok: false; error: string };

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  let inQ = false;
  while (i < line.length) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i += 1;
      continue;
    }
    if (c === ',') {
      out.push(cur);
      cur = '';
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  out.push(cur);
  return out;
}

/** Parse UTF-8 narrow cleanup CSV text into row payloads suitable for JSON apply. */
export function parseNarrowCleanupCsv(text: string): ParseCleanupCsvResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  if (!lines.length) return { ok: false, error: 'CSV is empty.' };
  const headerCells = splitCsvLine(lines[0]).map((c) => c.trim());
  if (headerCells.length !== CLEANUP_CSV_FIELDS.length) {
    return {
      ok: false,
      error: `Expected ${CLEANUP_CSV_FIELDS.length} columns in header, got ${headerCells.length}.`,
    };
  }
  for (let i = 0; i < CLEANUP_CSV_FIELDS.length; i += 1) {
    if (headerCells[i] !== CLEANUP_CSV_FIELDS[i]) {
      return {
        ok: false,
        error: `Invalid header: expected "${CLEANUP_CSV_FIELDS.join(',')}".`,
      };
    }
  }

  const rows: CleanupCsvApplyRowPayload[] = [];
  for (let li = 1; li < lines.length; li += 1) {
    const cells = splitCsvLine(lines[li]);
    if (cells.length !== CLEANUP_CSV_FIELDS.length) {
      return {
        ok: false,
        error: `Line ${li + 1}: expected ${CLEANUP_CSV_FIELDS.length} columns, got ${cells.length}.`,
      };
    }
    const rawId = cells[0].trim();
    const n = Number.parseInt(rawId, 10);
    if (!Number.isFinite(n)) {
      return { ok: false, error: `Line ${li + 1}: row_id must be an integer.` };
    }
    rows.push({
      row_id: n,
      ai_title: cells[1].trim(),
      ai_brand: cells[2].trim(),
      ai_model: cells[3].trim(),
      category: cells[4].trim(),
      condition: cells[5].trim(),
      proposed_price: cells[6].trim(),
    });
  }

  return { ok: true, rows };
}
