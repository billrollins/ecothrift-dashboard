/** Words for Close the truck and its count-down (Dash Update #88). The sums are done on the server. */
import type { TruckCloseDTO } from '../../../api/truckClose.api';

export type DueTone = 'default' | 'warning' | 'error';

/** "due in 2 days" / "due today" / "past due" (business days). */
export function dueWords(daysLeft: number | null | undefined): { text: string; tone: DueTone } {
  if (daysLeft == null) return { text: 'no due day', tone: 'default' };
  if (daysLeft < 0) return { text: 'past due', tone: 'error' };
  if (daysLeft === 0) return { text: 'due today', tone: 'error' };
  if (daysLeft === 1) return { text: 'due in 1 day', tone: 'error' };
  return { text: `due in ${daysLeft} days`, tone: 'warning' };
}

export function wholeDollars(v: string | number | null | undefined): string {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? '-' : `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * The header's count-down: "Dispute not filed: $412, due in 2 days". Once the day has passed it is no longer a
 * count-down: it says plainly what was missed ("Dispute day passed, $412 not filed").
 */
export function notFiledLine(
  worth: string | null | undefined, daysLeft: number | null | undefined,
): { text: string; missed: boolean } | null {
  if (!worth || Number(worth) <= 0) return null;
  if (daysLeft != null && daysLeft < 0) return { text: `Dispute day passed, ${wholeDollars(worth)} not filed`, missed: true };
  return { text: `Dispute not filed: ${wholeDollars(worth)}${daysLeft == null ? '' : `, ${dueWords(daysLeft).text}`}`, missed: false };
}

/** "2 of 21 pallets not closed, 30 items waiting" */
export function openWork(data: TruckCloseDTO): string {
  const w = data.working;
  const parts = [];
  if (w.pallets_open > 0) parts.push(`${w.pallets_open} of ${w.pallets_total} pallets not closed`);
  if (w.pending_items > 0) parts.push(`${w.pending_items} ${w.pending_items === 1 ? 'item' : 'items'} waiting`);
  return parts.join(', ');
}

/** Pallets not marked done or items still waiting: "not received" still holds what is only not checked in yet. */
export function isStillWorking(data: TruckCloseDTO): boolean {
  const w = data.working;
  return Boolean(w && (w.pallets_open > 0 || w.pending_items > 0));
}

/**
 * The stepper's active step (What came, The dispute, Filed, Money back, Closed; 0-based): the claim to file is 1,
 * waiting for the money is 3, ready to close is 4, closed is 5 (all done).
 */
export function activeStep(data: TruckCloseDTO): number {
  if (data.finalized.at) return 5;
  if (data.state === 'nothing' || data.state === 'answered') return 4;
  if (data.state === 'filed') return 3;
  // Still being worked: what came is not settled yet, so the first step is not ticked.
  return isStillWorking(data) ? 0 : 1;
}

/** $1,234.50: the standing line shows the dispute to the cent, the same as the boxes under it. */
function cents(v: string | number | null | undefined): string {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return '-';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The one line that says where the truck stands. */
export function standing(data: TruckCloseDTO): string {
  if (data.finalized.at) return 'This truck is closed.';
  if (data.state === 'nothing') {
    return isStillWorking(data)
      ? `Nothing to dispute so far. The truck is still being worked: ${openWork(data)}.`
      : 'Nothing to dispute on this truck. It can be closed now.';
  }
  if (data.state === 'to_file') {
    const late = data.due.days_left != null && data.due.days_left < 0;
    if (isStillWorking(data)) {
      return late
        ? `Dispute day passed, ${cents(data.numbers.worth)} not filed. The truck is still being worked: ${openWork(data)}.`
        : `This truck is still being worked. Closed today, the dispute would be ${cents(data.numbers.worth)}.`;
    }
    if (late) return `Dispute day passed, ${cents(data.numbers.worth)} not filed. Close the truck.`;
    return `A dispute of ${cents(data.numbers.worth)} is ready to file on B-Stock.`;
  }
  if (data.state === 'filed') return `Filed for ${cents(data.claim.amount_asked)}. Waiting for the money.`;
  // The money is settled; whether the truck can be closed still depends on the work.
  const then = isStillWorking(data) ? 'The truck is still being worked.' : 'The truck can be closed.';
  if (Number(data.claim.amount_back) === 0) return `B-Stock said no to the ${cents(data.claim.amount_asked)} asked. ${then}`;
  return `B-Stock sent back ${cents(data.claim.amount_back)} of ${cents(data.claim.amount_asked)} asked. ${then}`;
}
