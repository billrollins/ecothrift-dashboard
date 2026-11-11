import { format, parseISO } from 'date-fns';
import type { ReturnReasonOption, ReturnReasonPick } from '../../../api/thriftplusReturns.api';

/** Plain words the Return window shows, in one place (owner 2026-10-20: SMOOTH, CLEAR, SIMPLE). */
// Bill 2026-11-10 (#90): the cashier now records why each item came back, so "Don't ask why" is gone. The reason is a
// record for Processing; it never decides the return (any reason is fine, W1).
export const GLANCE = 'Glance: not broken or heavily used since the sale. Any reason is fine.';

/** The four steps, in order (#90): the window says where the cashier is. */
export const STEPS = ['Start a return', 'The ticket', 'Check', 'Return complete'] as const;

/** The reasons, if the server sent none (an older server): the same short list. */
export const REASONS_FALLBACK: ReturnReasonOption[] = [
  { value: 'not_working', label: 'Does not work' },
  { value: 'damaged', label: 'Broken or damaged' },
  { value: 'missing_parts', label: 'Missing parts' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'changed_mind', label: 'Changed mind' },
  { value: 'other', label: 'Other' },
];

/** "Does not work (buzzes when on)": a picked reason as the screens say it. */
export function reasonWords(pick: ReturnReasonPick | undefined, options: ReturnReasonOption[]): string {
  if (!pick) return '';
  const label = options.find((o) => o.value === pick.reason)?.label ?? '';
  const note = pick.note.trim();
  if (label && note) return `${label} (${note})`;
  return label || note;
}

/** How a sale was paid, in a word or two ('' when unknown). */
export function paidWith(method: string | undefined): string {
  switch (method) {
    case 'cash': return 'cash';
    case 'card': return 'card';
    case 'split': return 'split';
    case 'thrift': return 'Thrift+';
    case 'payroll': return 'payroll deduction';
    default: return '';
  }
}

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
