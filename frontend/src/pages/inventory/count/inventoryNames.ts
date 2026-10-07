/** How an inventory is named on screen: by the days it ran (one inventory can run over several days). */

export const dayLabel = (iso: string, withYear = false) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });

/** "Inventory Mon, Oct 5, 2026", or "Inventory Mon, Oct 5 to Tue, Oct 6, 2026" when it ran over several days.
 * A name someone typed when starting it wins over the default "Inventory <day>". */
export function inventoryName(d: { name: string; day: string | null; days_active?: string[] }): string {
  if (!d.day) return d.name;
  // The default names ("Inventory Tue 2026-10-06", and "Count Mon 2026-10-05" from the per-day version) read better as dates.
  if (d.name && !/^(Inventory|Count) \w{3} \d{4}-\d{2}-\d{2}$/.test(d.name)) return d.name;
  const days = d.days_active?.length ? d.days_active : [d.day];
  const first = days[0];
  const last = days[days.length - 1];
  return first === last ? `Inventory ${dayLabel(first, true)}` : `Inventory ${dayLabel(first)} to ${dayLabel(last, true)}`;
}
