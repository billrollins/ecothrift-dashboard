/** Pure helpers for the Ready today Holds tab. */

export type PickupFilterRow = {
  status: string;
  expires_at?: string | null;
  confirmed_at?: string | null;
};

/**
 * Today's pickup queue: ready_for_pickup always, plus confirmed holds whose
 * expiry or confirm date falls on `today` (local). Null expires_at alone does
 * not qualify a confirmed hold.
 */
export function isTodaysPickupRow(
  row: PickupFilterRow,
  today: Date = new Date(),
): boolean {
  const todayKey = today.toDateString();
  if (row.status === 'ready_for_pickup') return true;
  if (row.status !== 'confirmed') return false;
  if (row.expires_at && new Date(row.expires_at).toDateString() === todayKey) {
    return true;
  }
  if (row.confirmed_at && new Date(row.confirmed_at).toDateString() === todayKey) {
    return true;
  }
  return false;
}
