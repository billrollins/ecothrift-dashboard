/**
 * Dispute a manifest row from the queue (Dash Update #100): the form's rules, kept here so they are tested.
 */
import type { RowDisputeInput, RowDisputeReason } from '../../../api/rowDisputes.api';

export interface RowDisputeForm {
  reason: RowDisputeReason | '';
  units: string;
  pctLost: string;
  note: string;
}

export const PARTIAL_REASONS: RowDisputeReason[] = ['missing_parts', 'other'];

/** Bill: "This is for rows that do not come", so the window starts there with every unit left. */
export function initialRowDisputeForm(remaining: number, defaultPct = 50): RowDisputeForm {
  return { reason: 'did_not_come', units: String(Math.max(0, remaining)), pctLost: String(defaultPct), note: '' };
}

function wholeNumber(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  return Number.parseInt(t, 10);
}

/** What still stops the dispute, first problem first, in plain words. */
export function rowDisputeProblems(form: RowDisputeForm, remaining: number): string[] {
  const out: string[] = [];
  if (remaining <= 0) out.push('Nothing left on this row to dispute. Undo a dispute first, or dispute checked-in items.');
  if (!form.reason) out.push('Pick what is wrong.');
  const units = wholeNumber(form.units);
  if (units == null || units < 1) out.push('Say how many units (at least 1).');
  else if (units > remaining && remaining > 0) out.push(`Only ${remaining} unit${remaining === 1 ? '' : 's'} left on this row.`);
  if (form.reason && PARTIAL_REASONS.includes(form.reason)) {
    const pct = wholeNumber(form.pctLost);
    if (pct == null || pct < 1 || pct > 100) out.push('How much of the value is lost: 1 to 100%.');
  }
  return out;
}

export function rowDisputePayload(processingRowId: number, form: RowDisputeForm): RowDisputeInput {
  const reason = form.reason as RowDisputeReason;
  return {
    processing_row_id: processingRowId,
    reason,
    units: wholeNumber(form.units) ?? 0,
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
