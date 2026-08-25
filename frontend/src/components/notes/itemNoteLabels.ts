import type { ItemNoteDTO, ItemNoteSurface } from '../../types/inventory.types';

export const ITEM_NOTE_SURFACE_LABELS: Record<ItemNoteSurface, string> = {
  check_in: 'Check-in',
  handoff: 'Handoff',
  queue: 'Queue',
  action: 'Action',
  hold: 'Hold',
  send_back: 'Send back',
  reject: 'Reject',
  finish: 'Finish',
  output: 'Output',
  processing_return: 'Processing',
  manual: 'Note',
};

export function formatNoteWhen(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** First line of a Recent notes row: who, then when. */
export function formatNoteWhoWhen(note: Pick<ItemNoteDTO, 'author_name' | 'occurred_at'>): string {
  const when = formatNoteWhen(note.occurred_at);
  const who = note.author_name?.trim();
  return who ? `${who} · ${when}` : when;
}

/** The notes API is oldest first. Live previews want the newest active row. */
export function latestActiveNote(notes: ItemNoteDTO[]): ItemNoteDTO | null {
  for (let i = notes.length - 1; i >= 0; i -= 1) {
    if (notes[i].status === 'active') return notes[i];
  }
  return null;
}

/** Newest active notes first. Pass `limit` to cap the preview. */
export function recentVisibleNotes(notes: ItemNoteDTO[], limit?: number): ItemNoteDTO[] {
  const active = notes.filter((note) => note.status === 'active').reverse();
  return limit == null ? active : active.slice(0, limit);
}
