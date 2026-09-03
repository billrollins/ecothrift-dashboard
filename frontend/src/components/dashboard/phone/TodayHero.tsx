import { Box, Card, Typography } from '@mui/material';
import { useState } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import type { SalesMetrics } from '../../../types/pos.types';
import { dashboardPalette, dashboardPhoneCardSx } from '../dashboardCardStyles';
import {
  formatDashboardCurrency,
  parseDashboardAmount,
} from '../dashboardFormatters';
import { SalesGoalDialog } from '../SalesGoalDialog';

export function TodayHero({ sales }: { sales: SalesMetrics }) {
  const { user } = useAuth();
  const isSuperuser = Boolean(user?.is_superuser);
  const [goalOpen, setGoalOpen] = useState(false);

  const today = parseDashboardAmount(sales.today);
  const last = parseDashboardAmount(sales.same_weekday_last_week);
  const delta = today - last;
  const lastDay = sales.daily_last_90_days.at(-1)?.day.slice(0, 3) ?? 'wk';
  const deltaLabel = delta === 0
    ? 'even'
    : `${delta > 0 ? '+' : '−'}${formatDashboardCurrency(String(Math.abs(delta)))}`;

  const thisWeek = sales.weekly_last_14_weeks.find((week) => week.label === 'This Week');
  const weekTotal = parseDashboardAmount(thisWeek?.week_total ?? '0');
  const goalAmount = sales.goal ? parseDashboardAmount(sales.goal.amount) : 0;
  const progress = goalAmount > 0 ? Math.min(100, (weekTotal / goalAmount) * 100) : 0;
  const canOpenGoal = Boolean(sales.goal) || isSuperuser;
  const goalLabel = sales.goal
    ? formatDashboardCurrency(sales.goal.amount)
    : isSuperuser
      ? 'Set goal'
      : 'No goal set';

  return (
    <>
      <Card elevation={0} sx={{ ...dashboardPhoneCardSx, overflow: 'hidden' }}>
        <Box sx={{ px: 2, pt: 2, pb: 1.75 }}>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: 'text.secondary',
              lineHeight: 1,
            }}
          >
            Today&apos;s sales
          </Typography>
          <Typography
            sx={{
              mt: 0.75,
              fontSize: '2.25rem',
              fontWeight: 900,
              letterSpacing: '-0.04em',
              lineHeight: 1,
              color: dashboardPalette.greenDark,
            }}
          >
            {formatDashboardCurrency(sales.today)}
          </Typography>
          <Typography
            sx={{
              mt: 0.75,
              minHeight: 20,
              fontSize: '0.8125rem',
              fontWeight: 700,
              color: 'text.secondary',
            }}
          >
            Last {lastDay} {formatDashboardCurrency(sales.same_weekday_last_week)}
            {' · '}
            <Box
              component="span"
              sx={{
                color: delta > 0
                  ? dashboardPalette.greenDark
                  : delta < 0
                    ? dashboardPalette.amber
                    : 'text.secondary',
              }}
            >
              {deltaLabel}
            </Box>
          </Typography>

          <Box
            component={canOpenGoal ? 'button' : 'div'}
            type={canOpenGoal ? 'button' : undefined}
            onClick={canOpenGoal ? () => setGoalOpen(true) : undefined}
            sx={{
              mt: 1.5,
              width: '100%',
              p: 0,
              border: 'none',
              background: 'none',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
              cursor: canOpenGoal ? 'pointer' : 'default',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  textTransform: 'uppercase',
                  color: dashboardPalette.goldDark,
                }}
              >
                Week vs goal
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', fontWeight: 800, color: dashboardPalette.goldDark }}>
                {formatDashboardCurrency(String(weekTotal))} · {goalLabel}
              </Typography>
            </Box>
            <Box
              sx={{
                mt: 0.75,
                height: 8,
                borderRadius: 99,
                bgcolor: 'rgba(189, 134, 24, 0.16)',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  width: `${progress}%`,
                  height: '100%',
                  bgcolor: dashboardPalette.gold,
                  borderRadius: 99,
                }}
              />
            </Box>
          </Box>
        </Box>
      </Card>

      <SalesGoalDialog
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        goal={sales.goal}
        isSuperuser={isSuperuser}
      />
    </>
  );
}
