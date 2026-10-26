/**
 * Restoration estimates (owner, 2026-10-26: "All items processing is sending to restoration requires estimates").
 * The rules Add item has had since 2026-10-22, shared by every check-in that can send an item to Restoration.
 * Server: `apps/inventory/services/restoration_estimate.py` (it refuses without them too).
 */
import type { RestorationEstimatePayload, RestorationWork } from '../../../types/inventory.types';

export const WORK_OPTIONS: Array<{ value: RestorationWork; label: string }> = [
  { value: 'test', label: 'Test' },
  { value: 'assemble', label: 'Assemble' },
  { value: 'repair', label: 'Repair' },
  { value: 'salvage', label: 'Salvage' },
];

export interface RestorationEstimateForm {
  work: RestorationWork[];
  hours: string;
  partsCost: string;
  valueAfter: string;
}

export const EMPTY_ESTIMATE: RestorationEstimateForm = { work: [], hours: '', partsCost: '', valueAfter: '' };

function amount(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim().replace(/[$,\s]/g, '');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** What still stops it, in the order the fields show. */
export function estimateProblems(form: RestorationEstimateForm): string[] {
  const out: string[] = [];
  if (!form.work.length) out.push('Pick the work it needs.');
  if (!(amount(form.hours) || amount(form.partsCost))) out.push('Give the hours or the parts cost.');
  if (!amount(form.valueAfter)) out.push('Give what it is worth after the work.');
  return out;
}

export function estimatePayload(form: RestorationEstimateForm): RestorationEstimatePayload {
  return {
    work: form.work,
    hours: form.hours.trim() || undefined,
    parts_cost: form.partsCost.trim() || undefined,
    value_after: form.valueAfter.trim(),
  };
}

/** The estimate a check-in already has (its defaults), ready to edit. */
export function estimateFromSaved(saved: Partial<RestorationEstimatePayload> | null | undefined): RestorationEstimateForm {
  if (!saved) return EMPTY_ESTIMATE;
  const work = WORK_OPTIONS.map((o) => o.value).filter((w) => (saved.work ?? []).includes(w));
  return { work, hours: saved.hours ?? '', partsCost: saved.parts_cost ?? '', valueAfter: saved.value_after ?? '' };
}

export function toggleWork(form: RestorationEstimateForm, work: RestorationWork): RestorationEstimateForm {
  return {
    ...form,
    work: form.work.includes(work) ? form.work.filter((w) => w !== work) : [...form.work, work],
  };
}
