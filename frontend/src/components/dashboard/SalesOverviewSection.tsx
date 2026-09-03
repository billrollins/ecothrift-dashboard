import { Box, Card, CardContent, Stack, Tooltip, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import type { SalesMetrics } from '../../types/pos.types';
import {
  formatDashboardCurrency,
  formatDashboardCurrencyExact,
  parseDashboardAmount,
} from './dashboardFormatters';
import { SalesGoalDialog } from './SalesGoalDialog';
import { SalesTrendChart } from './SalesTrendChart';
import {
  buildSalesChartData,
  buildWeekBands,
  mondayTickDates,
  salesChartMax,
  salesDailyPoints,
} from './salesChartData';
import { useDashboardLayout } from './useDashboardLayout';
import {
  dashboardCardHoverLiftSx,
  dashboardPalette,
  dashboardRaisedCardSx,
  dashboardRaisedStatSx,
} from './dashboardCardStyles';

interface SalesOverviewSectionProps {
  sales: SalesMetrics;
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        px: 1.15,
        py: 0.75,
        minWidth: 86,
        borderRadius: 2,
        ...dashboardRaisedStatSx,
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        lineHeight={1}
        sx={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 700 }}
      >
        {label}
      </Typography>
      <Typography variant="subtitle2" fontWeight={800} lineHeight={1.35}>
        {formatDashboardCurrency(value)}
      </Typography>
    </Box>
  );
}

function GoalStat({
  amountLabel,
  onClick,
}: {
  amountLabel: string;
  onClick: () => void;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        position: 'relative',
        px: 1.25,
        py: 0.75,
        minWidth: 102,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: 'rgba(189, 134, 24, 0.46)',
        background:
          `linear-gradient(145deg, rgba(255,250,224,0.98), ${dashboardPalette.goldSoft} 48%, rgba(255,253,247,0.96)), linear-gradient(90deg, rgba(255,255,255,0.55), rgba(255,255,255,0))`,
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.90), inset 0 -1px 0 rgba(189,134,24,0.12), 0 2px 5px rgba(20, 30, 24, 0.25), 0 8px 20px rgba(20, 30, 24, 0.32)',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: '0 auto 0 0',
          width: 4,
          background: `linear-gradient(180deg, #fff0b8, ${dashboardPalette.goldBright} 45%, ${dashboardPalette.goldDark})`,
        },
      }}
    >
      <Typography
        variant="caption"
        display="block"
        lineHeight={1}
        sx={{
          color: dashboardPalette.goldDark,
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: 1.1,
          fontWeight: 900,
        }}
      >
        Weekly Goal
      </Typography>
      <Typography variant="subtitle2" fontWeight={950} lineHeight={1.35} sx={{ color: dashboardPalette.goldDark }}>
        {amountLabel}
      </Typography>
    </Box>
  );
}

export function SalesOverviewSection({ sales }: SalesOverviewSectionProps) {
  const { user } = useAuth();
  const { isCompact, isMobile } = useDashboardLayout();
  const isSuperuser = Boolean(user?.is_superuser);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);

  const goalAmount = sales.goal ? parseDashboardAmount(sales.goal.amount) : null;
  const canOpenGoal = Boolean(sales.goal) || isSuperuser;
  const goalAmountLabel = sales.goal ? formatDashboardCurrency(sales.goal.amount) : isSuperuser ? 'Set' : '-';

  const dailyPoints = useMemo(
    () => salesDailyPoints(sales.daily_last_90_days),
    [sales.daily_last_90_days],
  );

  const chartData = useMemo(
    () => buildSalesChartData(dailyPoints, goalAmount),
    [dailyPoints, goalAmount],
  );

  const weekBands = useMemo(() => buildWeekBands(dailyPoints), [dailyPoints]);

  const mondayTicks = useMemo(
    () => mondayTickDates(sales.daily_last_90_days, isCompact ? 3 : 1),
    [sales.daily_last_90_days, isCompact],
  );

  const todayShort = dailyPoints.length
    ? dailyPoints[dailyPoints.length - 1].day.slice(0, 3)
    : '';

  const chartMax = useMemo(
    () => salesChartMax(dailyPoints, goalAmount),
    [dailyPoints, goalAmount],
  );

  const goalLabel = goalAmount == null
    ? null
    : isCompact
      ? `GOAL ${formatDashboardCurrency(String(goalAmount))}`
      : `GOAL ${formatDashboardCurrencyExact(String(goalAmount))}`;

  return (
    <>
      <Card
        elevation={0}
        sx={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 3,
          overflow: 'hidden',
          ...dashboardRaisedCardSx,
          ...dashboardCardHoverLiftSx,
        }}
      >
        <CardContent
          sx={{
            p: 1.5,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            '&:last-child': { pb: 1.5 },
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              justifyContent: 'space-between',
              alignItems: { xs: 'stretch', sm: 'flex-start' },
              mb: 1.25,
              gap: { xs: 1, sm: 2 },
            }}
          >
            <Tooltip
              title="90 days: solid = trailing 7-day sales total. Dotted = sum of past 4 weeks ÷ 4 (avg weekly)."
              arrow
            >
              <Box sx={{ cursor: 'default' }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ fontWeight: 800, letterSpacing: 0.9, textTransform: 'uppercase', lineHeight: 1 }}
                >
                  Weekly Sales
                </Typography>
                <Typography variant="h6" fontWeight={800} lineHeight={1.15}>
                  90-Day Weekly Trend
                </Typography>
              </Box>
            </Tooltip>
            <Stack
              direction="row"
              spacing={2}
              sx={{
                flexShrink: 0,
                ...(isCompact
                  ? {
                      overflowX: 'auto',
                      flexWrap: 'nowrap',
                      pb: 0.25,
                      px: 0.25,
                      WebkitOverflowScrolling: 'touch',
                      '& > *': { flexShrink: 0 },
                    }
                  : {}),
              }}
            >
              {canOpenGoal && (
                <GoalStat
                  amountLabel={goalAmountLabel}
                  onClick={() => setGoalDialogOpen(true)}
                />
              )}
              <CompactStat
                label={todayShort ? `Last ${todayShort}` : 'Last wk'}
                value={sales.same_weekday_last_week}
              />
              {!isMobile && (
                <CompactStat
                  label={todayShort ? `Today (${todayShort})` : 'Today'}
                  value={sales.today}
                />
              )}
            </Stack>
          </Box>
          <Box
            sx={{
              width: '100%',
              flex: 1,
              minHeight: { xs: 200, md: 140 },
              minWidth: 0,
              overflow: 'hidden',
              pt: 0.5,
              pr: 0.5,
            }}
          >
            <SalesTrendChart
              data={chartData}
              weekBands={weekBands}
              ticks={mondayTicks}
              chartMax={chartMax}
              goalAmount={goalAmount}
              goalLabel={goalLabel}
            />
          </Box>
        </CardContent>
      </Card>

      <SalesGoalDialog
        open={goalDialogOpen}
        onClose={() => setGoalDialogOpen(false)}
        goal={sales.goal}
        isSuperuser={isSuperuser}
      />
    </>
  );
}
