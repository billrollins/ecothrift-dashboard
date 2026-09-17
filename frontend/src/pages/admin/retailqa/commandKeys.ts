const BLOCK = 'input, textarea, select, [contenteditable="true"], [role="dialog"]';

export type CommandKey =
  | { type: 'week'; delta: -1 | 1 }
  | { type: 'day'; index: number }
  | { type: 'escape' };

export function commandKeyAction(event: { key: string; target: EventTarget | null }): CommandKey | null {
  const target = event.target as HTMLElement | null;
  if (target && target.closest(BLOCK)) return null;
  if (event.key === 'Escape') return { type: 'escape' };
  if (event.key === 'ArrowLeft') return { type: 'week', delta: -1 };
  if (event.key === 'ArrowRight') return { type: 'week', delta: 1 };
  const num = Number(event.key);
  if (num >= 1 && num <= 7) return { type: 'day', index: num - 1 };
  return null;
}
