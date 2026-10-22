import { Box } from '@mui/material';
import type { DashboardMetrics } from '../../../types/pos.types';
import { DepartmentMetricCards } from '../DepartmentMetricCards';
import { FlipCard } from '../FlipCard';
import { SectionHeader } from '../SectionHeader';
import { PastWeeksCard } from './PastWeeksCard';
import { TodayHero } from './TodayHero';
import { TrendCardPhone } from './TrendCardPhone';

/**
 * The phone Dashboard (owner 2026-10-22): today's sales, the Sales card (trend; its back lists every week), then the
 * four department cards stacked. Everyone sees the same page.
 */
export function DashboardPhone({ metrics }: { metrics: DashboardMetrics }) {
  const todayIso = metrics.sales.daily_last_90_days.at(-1)?.date;
  const todayDay = metrics.sales.daily_last_90_days.at(-1)?.day;

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth: 560,
        mx: 'auto',
        px: 2,
        pt: 2,
        pb: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      <TodayHero sales={metrics.sales} />
      <SectionHeader
        title="Sales"
        hint="Net item sales (after Thrift+ returns). The corner button lists every week."
      />
      <FlipCard
        name="Sales"
        backLabel="past weeks"
        frontLabel="the trend"
        front={(button) => <TrendCardPhone sales={metrics.sales} action={button} />}
        back={(button) => (
          <PastWeeksCard
            weeks={metrics.sales.weekly_last_14_weeks}
            todayIso={todayIso}
            todayDay={todayDay}
            action={button}
          />
        )}
      />
      <SectionHeader
        title="Departments"
        hintMobile="This week against each goal. Tap a number for details; the corner button shows past weeks."
      />
      <DepartmentMetricCards metrics={metrics.department_metrics} />
    </Box>
  );
}
