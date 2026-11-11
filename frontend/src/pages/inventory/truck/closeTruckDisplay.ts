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

/** The header's count-down: "Dispute due in 2 days, $412 not filed". */
export function notFiledLine(worth: string | null | undefined, daysLeft: number | null | undefined): string | null {
  if (!worth || Number(worth) <= 0) return null;
  const when = daysLeft == null ? 'Dispute' : `Dispute ${dueWords(daysLeft).text}`;
  return `${when}, ${wholeDollars(worth)} not filed`;
}

/**
 * The stepper's active step (What came, The claim, Filed, Money back, Closed; 0-based): the claim to file is 1,
 * waiting for the money is 3, ready to close is 4, closed is 5 (all done).
 */
export function activeStep(data: TruckCloseDTO): number {
  if (data.finalized.at) return 5;
  if (data.state === 'nothing' || data.state === 'answered') return 4;
  if (data.state === 'filed') return 3;
  return 1;
}

/** $1,234.50: the standing line shows the claim to the cent, the same as the boxes under it. */
function cents(v: string | number | null | undefined): string {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) return '-';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The one line that says where the truck stands. */
export function standing(data: TruckCloseDTO): string {
  if (data.finalized.at) return 'This truck is closed.';
  if (data.state === 'nothing') return 'Nothing to claim on this truck. It can be closed now.';
  if (data.state === 'to_file') return `A claim of ${cents(data.numbers.worth)} is ready to file on B-Stock.`;
  if (data.state === 'filed') return `Filed for ${cents(data.claim.amount_asked)}. Waiting for the money.`;
  return `B-Stock sent back ${cents(data.claim.amount_back)} of ${cents(data.claim.amount_asked)} asked. The truck can be closed.`;
}
