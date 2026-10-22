/**
 * Desk Sales card (owner 2026-10-22): the 90-day trend in front, the 14-week calendar on the back. The corner button
 * turns it over, so the column beside the department cards holds one card, not two.
 */
import type { SxProps, Theme } from '@mui/material';
import type { SalesMetrics } from '../../types/pos.types';
import { FlipCard } from './FlipCard';
import { SalesOverviewSection } from './SalesOverviewSection';
import { WeeklySalesList } from './WeeklySalesList';

export function SalesFlipCard({ sales, sx }: { sales: SalesMetrics; sx?: SxProps<Theme> }) {
  const today = sales.daily_last_90_days.at(-1);
  return (
    <FlipCard
      name="Sales"
      backLabel="past weeks"
      frontLabel="the trend"
      sx={sx}
      front={(button) => <SalesOverviewSection sales={sales} action={button} />}
      back={(button) => (
        <WeeklySalesList
          weeks={sales.weekly_last_14_weeks}
          todayIso={today?.date}
          todayDay={today?.day}
          action={button}
        />
      )}
    />
  );
}
