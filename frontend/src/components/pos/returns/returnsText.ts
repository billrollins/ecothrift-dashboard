import { format, parseISO } from 'date-fns';

/** Plain words the Return window shows, in one place (owner 2026-10-20: SMOOTH, CLEAR, SIMPLE). */
export const GLANCE = "Glance: not broken or heavily used since the sale. Don't ask why.";

/** The window's big buttons. */
export const BIG = { minHeight: 56, fontSize: '1.1rem', fontWeight: 700, borderRadius: 2 } as const;

/** A clear ring for the keyboard (with `disableFocusRipple`): MUI's pulsing ripple reads as half disabled. */
export const FOCUS_RING = { '&.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.dark', outlineOffset: 2 } } as const;

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
