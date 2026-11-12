/**
 * Dispute a manifest row from the queue (Dash Update #100): the form's rules, kept here so they are tested.
 */
import type { RowDisputeInput, RowDisputeReason } from '../../../api/rowDisputes.api';

export interface RowDisputeForm {
  reason: RowDisputeReason | '';
  units: string;
  pctLost: string;
  note: string;
  /** Photos of the problem, held until the dispute is sent (Dash Update #101). */
  photos: File[];
  /** A checked-in item the dispute is about (Dash Update #102); null = units not checked in. */
  itemId?: number | null;
}

/** Picked from Prior check-ins: the item came, so the window starts on "Arrived broken" for one unit. */
export function initialItemDisputeForm(itemId: number, defaultPct = 50): RowDisputeForm {
  return { reason: 'broken', units: '1', pctLost: String(defaultPct), note: '', photos: [], itemId };
}

export const PARTIAL_REASONS: RowDisputeReason[] = ['missing_parts', 'other'];

/** Bill: "we need to take photos if it is anything other than missing" (Dash Update #101). */
export function needsPhotos(reason: RowDisputeReason | ''): boolean {
  return reason !== '' && reason !== 'did_not_come';
}

/** Bill: "This is for rows that do not come", so the window starts there with every unit left. */
export function initialRowDisputeForm(remaining: number, defaultPct = 50): RowDisputeForm {
  return { reason: 'did_not_come', units: String(Math.max(0, remaining)), pctLost: String(defaultPct), note: '', photos: [] };
}

function wholeNumber(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number.parseInt(t, 10);
}

/** What still stops the dispute, first problem first, in plain words. */
export function rowDisputeProblems(form: RowDisputeForm, remaining: number): string[] {
  const out: string[] = [];
  const forItem = form.itemId != null;
  if (forItem) {
    if (form.reason === 'did_not_come') out.push('This item is checked in, so it came. Pick what is wrong with it.');
  } else {
    if (remaining <= 0) out.push('Nothing left on this row to dispute. Undo a dispute first, or dispute checked-in items.');
    const units = wholeNumber(form.units);
    if (units == null || units < 1) out.push('Say how many units (at least 1).');
    else if (units > remaining && remaining > 0) out.push(`Only ${remaining} unit${remaining === 1 ? '' : 's'} left on this row.`);
  }
  if (!form.reason) out.unshift('Pick what is wrong.');
  if (form.reason && PARTIAL_REASONS.includes(form.reason)) {
    const pct = wholeNumber(form.pctLost);
    if (pct == null || pct < 1 || pct > 100) out.push('How much of the value is lost: 1 to 100%.');
  }
  if (needsPhotos(form.reason) && form.photos.length === 0) {
    out.push('Add a photo of the problem. Every reason but "did not come" needs at least one.');
  }
  return out;
}

/** The photos that go with the dispute: none for "did not come" (nothing to take a picture of). */
export function rowDisputePhotos(form: RowDisputeForm): File[] {
  return needsPhotos(form.reason) ? form.photos : [];
}

export function rowDisputePayload(processingRowId: number, form: RowDisputeForm): RowDisputeInput {
  const reason = form.reason as RowDisputeReason;
  return {
    processing_row_id: processingRowId,
    ...(form.itemId != null ? { item_id: form.itemId } : {}),
    reason,
    units: form.itemId != null ? 1 : (wholeNumber(form.units) ?? 0),
    ...(PARTIAL_REASONS.includes(reason) ? { pct_lost: wholeNumber(form.pctLost) ?? 0 } : {}),
    ...(form.note.trim() ? { note: form.note.trim() } : {}),
  };
}

/** The money at stake, at the manifest unit retail, for the button and the line under it. */
export function disputeRetail(form: RowDisputeForm, unitRetail: string | null): number | null {
  const units = wholeNumber(form.units);
  const ur = unitRetail == null ? null : Number(unitRetail);
  if (units == null || ur == null || !Number.isFinite(ur)) return null;
  const share = form.reason && PARTIAL_REASONS.includes(form.reason) ? (wholeNumber(form.pctLost) ?? 0) / 100 : 1;
  return Math.round(units * ur * share * 100) / 100;
}
