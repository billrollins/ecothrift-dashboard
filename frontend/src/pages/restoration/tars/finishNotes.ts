import type { RestorationBenchDisposition } from '../../../types/inventory.types';

export const FINISH_DESTINATIONS: { value: RestorationBenchDisposition; label: string }[] = [
  { value: 'processing', label: 'Processing' },
  { value: 'storage', label: 'Storage' },
  { value: 'salvage', label: 'Salvage' },
  { value: 'online_sales', label: 'Online Sales' },
];

export type FinishOutputLine = {
  seq: number;
  label: string;
  notes: string;
  destination: RestorationBenchDisposition;
};

export function emptyMainOutput(
  sku?: string,
  destination: RestorationBenchDisposition = 'processing',
): FinishOutputLine {
  return {
    seq: 0,
    label: sku || 'Whole item',
    notes: '',
    destination,
  };
}

export function emptyPartOutput(
  seq: number,
  destination: RestorationBenchDisposition = 'processing',
): FinishOutputLine {
  return { seq, label: '', notes: '', destination };
}

/** The backend refuses a finish with no work and no note. */
export function finishMainNoteReady(notes: string, hasActions: boolean): boolean {
  return hasActions || notes.trim() !== '';
}

export function lowestGrade(values: Record<string, number> | undefined): string {
  let best = '';
  let bestValue = Number.POSITIVE_INFINITY;
  for (const [name, raw] of Object.entries(values ?? {})) {
    const amount = Number(raw);
    if (!Number.isFinite(amount)) continue;
    if (amount < bestValue) {
      bestValue = amount;
      best = name;
    }
  }
  return best;
}
