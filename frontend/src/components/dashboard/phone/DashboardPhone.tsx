import { Box } from '@mui/material';
import type { DashboardMetrics } from '../../../types/pos.types';
import { DepartmentMetricCards } from '../DepartmentMetricCards';
import { SectionHeader } from '../SectionHeader';
import { PastWeeksCard } from './PastWeeksCard';
import { ThisWeekCard } from './ThisWeekCard';
import { TodayHero } from './TodayHero';
import { TrendCardPhone } from './TrendCardPhone';

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
        hint="Daily completed POS sales, with this week and the last 14 weeks."
      />
      <TrendCardPhone sales={metrics.sales} />
      <ThisWeekCard
        weeks={metrics.sales.weekly_last_14_weeks}
        todayIso={todayIso}
        todayDay={todayDay}
      />
      <PastWeeksCard
        weeks={metrics.sales.weekly_last_14_weeks}
        todayIso={todayIso}
        todayDay={todayDay}
      />
      <SectionHeader
        title="Departments"
        hintMobile="Per-department weekly metrics."
      />
      <DepartmentMetricCards metrics={metrics.department_metrics} />
    </Box>
  );
}
