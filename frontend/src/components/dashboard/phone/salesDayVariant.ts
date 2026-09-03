import type { SalesWeeklyRow } from '../../../types/pos.types';
import { dashboardPalette } from '../dashboardCardStyles';

export type DailyVariant = 'default' | 'today' | 'thisWeek' | 'sameDow';

export const VARIANT_SX: Record<DailyVariant, { bgcolor: string; borderColor: string }> = {
  default: { bgcolor: 'transparent', borderColor: 'rgba(91, 111, 95, 0.32)' },
  thisWeek: { bgcolor: dashboardPalette.goldSoft, borderColor: 'rgba(189, 134, 24, 0.5)' },
  sameDow: { bgcolor: dashboardPalette.blueSoft, borderColor: 'rgba(47, 103, 173, 0.48)' },
  today: { bgcolor: dashboardPalette.greenSoft, borderColor: dashboardPalette.green },
};

export function variantFor(
  d: SalesWeeklyRow['days'][number],
  opts: { isThisWeek: boolean; todayIso?: string; todayDay?: string },
): DailyVariant {
  if (opts.todayIso && d.date === opts.todayIso) return 'today';
  if (opts.isThisWeek) return 'thisWeek';
  if (opts.todayDay && d.day === opts.todayDay) return 'sameDow';
  return 'default';
}
