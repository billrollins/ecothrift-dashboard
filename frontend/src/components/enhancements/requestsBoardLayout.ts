import type {
  EnhancementArea,
  EnhancementPriority,
  EnhancementRequestDTO,
} from '../../types/enhancementRequests.types';

/**
 * One colour per area, used by every surface that names an area: the table, the
 * detail header, and both dropdowns. Amber is bench work, blue is the floor.
 */
export const AREA_PALETTE: Record<EnhancementArea, 'warning' | 'info'> = {
  restoration: 'warning',
  processing: 'info',
};

/** Drawer lip height. The pull tab rides on it, so both read as one object. */
export const REQUESTS_DRAWER_HEIGHT = '70vh';

/**
 * Summary columns. Header and rows share this so every cell lines up.
 *
 * The request cell is deliberately tight: it is a headline, and hovering a row
 * or opening it shows the whole thing.
 */
export const REQUEST_GRID_COLUMNS = '88px minmax(0, 1.1fr) 108px 58px 76px 36px';

export const REQUEST_COLUMN_HEADINGS = ['AREA', 'REQUEST', 'WHO', 'PRIORITY', 'TARGET', 'NOTES'] as const;

export const ROW_HEIGHT = 36;
export const DETAIL_MIN_HEIGHT = 260;
export const NOTE_COMPOSER_HEIGHT = 40;

/** One-line composer: Area, the request field, and File share this height. */
export const COMPOSER_FIELD_HEIGHT = 40;

/**
 * Priority colour from the palette. Unset is a muted dash rather than a gap,
 * so the column keeps its width whether or not the owner has ranked it.
 */
export function priorityTone(priority: EnhancementPriority): string {
  if (priority === 'high') return 'error.main';
  if (priority === 'medium') return 'warning.dark';
  if (priority === 'low') return 'info.main';
  return 'text.disabled';
}

export function statusTone(status: EnhancementRequestDTO['status']): string {
  if (status === 'done') return 'success.dark';
  if (status === 'declined') return 'text.disabled';
  if (status === 'planned') return 'info.dark';
  return 'text.primary';
}

/** First line of the request, for the summary cell. */
export function requestHeadline(request: EnhancementRequestDTO): string {
  const firstLine = request.body.split('\n').find((line) => line.trim() !== '');
  return (firstLine ?? request.body).trim();
}

/** Note count as a word, never a bare zero that reads like an error. */
export function noteCountLabel(request: EnhancementRequestDTO): string {
  const count = request.notes.length;
  return count === 0 ? '—' : String(count);
}
