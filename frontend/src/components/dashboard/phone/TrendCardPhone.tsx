import { Box, Card, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import type { SalesMetrics } from '../../../types/pos.types';
import { dashboardPalette, dashboardPhoneCardSx } from '../dashboardCardStyles';
import { formatDashboardCurrency, parseDashboardAmount } from '../dashboardFormatters';
import { SalesTrendChart } from '../SalesTrendChart';
import {
  buildSalesChartData,
  buildWeekBands,
  mondayTickDates,
  salesChartMax,
  salesDailyPoints,
  sliceSalesDailyWindow,
} from '../salesChartData';

type WindowWeeks = 4 | 13;

const WINDOW_DAYS: Record<WindowWeeks, number> = {
  4: 28,
  13: 90,
};

export function TrendCardPhone({ sales }: { sales: SalesMetrics }) {
  const [weeks, setWeeks] = useState<WindowWeeks>(4);
  const goalAmount = sales.goal ? parseDashboardAmount(sales.goal.amount) : null;
  const windowDays = WINDOW_DAYS[weeks];

  const daily = useMemo(
    () => sliceSalesDailyWindow(sales.daily_last_90_days, windowDays),
    [sales.daily_last_90_days, windowDays],
  );
  const points = useMemo(() => salesDailyPoints(daily), [daily]);
  const chartData = useMemo(() => buildSalesChartData(points, goalAmount), [points, goalAmount]);
  const weekBands = useMemo(() => buildWeekBands(points), [points]);
  const ticks = useMemo(() => mondayTickDates(daily, 1), [daily]);
  const chartMax = useMemo(() => salesChartMax(points, goalAmount), [points, goalAmount]);

  const goalCaption = goalAmount == null
    ? 'No weekly goal on this chart'
    : `Goal ${formatDashboardCurrency(String(goalAmount))}`;

  return (
    <Card elevation={0} sx={{ ...dashboardPhoneCardSx, overflow: 'hidden' }}>
      <Box sx={{ px: 2, pt: 1.75, pb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: 0.8,
                textTransform: 'uppercase',
                color: 'text.secondary',
                lineHeight: 1,
              }}
            >
              Weekly trend
            </Typography>
            <Typography sx={{ mt: 0.4, fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.2 }}>
              {weeks === 4 ? '4-week' : '13-week'} sales
            </Typography>
          </Box>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={weeks}
            onChange={(_event, next: WindowWeeks | null) => {
              if (next) setWeeks(next);
            }}
            sx={{
              height: 36,
              flexShrink: 0,
              '& .MuiToggleButton-root': {
                px: 1.1,
                py: 0,
                height: 36,
                fontSize: '0.75rem',
                fontWeight: 800,
                textTransform: 'none',
              },
            }}
          >
            <ToggleButton value={4}>4 wk</ToggleButton>
            <ToggleButton value={13}>13 wk</ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Typography
          sx={{
            mt: 0.75,
            minHeight: 18,
            fontSize: '0.75rem',
            fontWeight: 700,
            color: dashboardPalette.goldDark,
          }}
        >
          {goalCaption}
        </Typography>
        <Typography sx={{ mt: 0.25, fontSize: '0.75rem', color: 'text.secondary', minHeight: 18 }}>
          Solid = trailing 7-day total. Dotted = 4-week average.
        </Typography>
        <Box sx={{ mt: 1, height: 190, minHeight: 190, minWidth: 0 }}>
          <SalesTrendChart
            data={chartData}
            weekBands={weekBands}
            ticks={ticks}
            chartMax={chartMax}
            goalAmount={goalAmount}
            yAxisWidth={36}
          />
        </Box>
      </Box>
    </Card>
  );
}
