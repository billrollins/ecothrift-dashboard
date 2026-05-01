import type { CleanupCsvApplyRowPayload } from '../../../api/inventory.api';

/** Narrow cleanup CSV columns (legacy 7-col; must match backend narrow path). */
export const CLEANUP_CSV_FIELDS = [
  'row_id',
  'ai_title',
  'ai_brand',
  'ai_model',
  'category',
  'condition',
  'proposed_price',
] as const;

/** Grok / offline helper 12-column response (see upload-pipeline-handoff.md §5). */
export const GROK_CLEANUP_CSV_FIELDS = [
  'row_id',
  'row_number',
  'title',
  'brand',
  'model',
  'category',
  'condition',
  'proposed_price',
  'description',
  'notes',
  'specifications_json',
  'search_tags_json',
] as const;

/** Optional trailing column on Grok `.cleaned.csv` from clean-grok.mjs. */
export const GROK_CLEANUP_AI_STATUS_HEADER = 'ai_status' as const;

export type ParseCleanupCsvResult =
  | { ok: true; rows: CleanupCsvApplyRowPayload[]; format: 'narrow' | 'grok12' | 'grok13' }
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

  return { ok: true, rows, format: 'narrow' };
}

function mapGrokRowCells(cells: string[]): CleanupCsvApplyRowPayload {
  const rawId = cells[0].trim();
  const n = Number.parseInt(rawId, 10);
  const rawRn = cells[1].trim();
  let row_number: number | undefined;
  if (rawRn) {
    const rn = Number.parseInt(rawRn, 10);
    if (Number.isFinite(rn)) row_number = rn;
  }
  const base: CleanupCsvApplyRowPayload = {
    row_id: n,
    row_number,
    ai_title: cells[2].trim(),
    ai_brand: cells[3].trim(),
    ai_model: cells[4].trim(),
    category: cells[5].trim(),
    condition: cells[6].trim(),
    proposed_price: cells[7].trim(),
    description: cells[8].trim(),
    notes: cells[9].trim(),
    specifications_json: cells[10].trim(),
    search_tags_json: cells[11].trim(),
  };
  if (cells.length >= 13) {
    const rawStatus = cells[12].trim();
    if (rawStatus) {
      base.ai_status = rawStatus;
    }
  }
  return base;
}

function parseGrokWideCleanupCsv(text: string, withAiStatus: boolean): ParseCleanupCsvResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  if (!lines.length) return { ok: false, error: 'CSV is empty.' };
  const expectedLen = withAiStatus ? GROK_CLEANUP_CSV_FIELDS.length + 1 : GROK_CLEANUP_CSV_FIELDS.length;
  const headerCells = splitCsvLine(lines[0]).map((c) => c.trim());
  if (headerCells.length !== expectedLen) {
    return {
      ok: false,
      error: `Expected ${expectedLen} columns in header, got ${headerCells.length}.`,
    };
  }
  for (let i = 0; i < GROK_CLEANUP_CSV_FIELDS.length; i += 1) {
    if (headerCells[i] !== GROK_CLEANUP_CSV_FIELDS[i]) {
      return {
        ok: false,
        error: `Invalid Grok header at column ${i + 1}: expected "${GROK_CLEANUP_CSV_FIELDS[i]}", got "${headerCells[i]}".`,
      };
    }
  }
  if (withAiStatus && headerCells[GROK_CLEANUP_CSV_FIELDS.length] !== GROK_CLEANUP_AI_STATUS_HEADER) {
    return {
      ok: false,
      error: `Invalid Grok header at column ${GROK_CLEANUP_CSV_FIELDS.length + 1}: expected "${GROK_CLEANUP_AI_STATUS_HEADER}", got "${headerCells[GROK_CLEANUP_CSV_FIELDS.length]}".`,
    };
  }

  const rows: CleanupCsvApplyRowPayload[] = [];
  for (let li = 1; li < lines.length; li += 1) {
    const cells = splitCsvLine(lines[li]);
    if (cells.length !== expectedLen) {
      return {
        ok: false,
        error: `Line ${li + 1}: expected ${expectedLen} columns, got ${cells.length}.`,
      };
    }
    const rawId = cells[0].trim();
    if (!Number.isFinite(Number.parseInt(rawId, 10))) {
      return { ok: false, error: `Line ${li + 1}: row_id must be an integer.` };
    }
    rows.push(mapGrokRowCells(cells));
  }

  return { ok: true, rows, format: withAiStatus ? 'grok13' : 'grok12' };
}

/** Detect 12- vs 13-column Grok vs legacy 7-column narrow by header width. */
export function parseCleanupCsv(text: string): ParseCleanupCsvResult {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((ln) => ln.trim().length > 0);
  if (!lines.length) return { ok: false, error: 'CSV is empty.' };
  const headerCells = splitCsvLine(lines[0]).map((c) => c.trim());
  const grok13Len = GROK_CLEANUP_CSV_FIELDS.length + 1;
  if (
    headerCells.length === grok13Len &&
    headerCells[grok13Len - 1] === GROK_CLEANUP_AI_STATUS_HEADER
  ) {
    return parseGrokWideCleanupCsv(text, true);
  }
  if (headerCells.length === GROK_CLEANUP_CSV_FIELDS.length) {
    return parseGrokWideCleanupCsv(text, false);
  }
  if (headerCells.length === CLEANUP_CSV_FIELDS.length) {
    return parseNarrowCleanupCsv(text);
  }
  return {
    ok: false,
    error: `Unexpected column count ${headerCells.length}. Expected ${grok13Len} (Grok + ${GROK_CLEANUP_AI_STATUS_HEADER}), ${GROK_CLEANUP_CSV_FIELDS.length} (Grok), or ${CLEANUP_CSV_FIELDS.length} (narrow legacy).`,
  };
}
