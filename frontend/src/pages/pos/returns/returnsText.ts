import { format, parseISO } from 'date-fns';

/** Plain words the Returns page shows, in one place (owner 2026-10-20: SMOOTH, CLEAR, SIMPLE). */
export const GLANCE = "Glance: not broken or heavily used since the sale. Don't ask why.";

export function dayTime(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEE MMM d, h:mm a');
  } catch {
    return '';
  }
}

export function dayOnly(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEE MMM d');
  } catch {
    return '';
  }
}
