import { Box, Card, CardContent, Stack, Tooltip, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import type { SalesMetrics } from '../../types/pos.types';
import {
  formatDashboardCurrency,
  formatDashboardCurrencyExact,
  parseDashboardAmount,
  shortDate,
} from './dashboardFormatters';
import { SalesGoalDialog } from './SalesGoalDialog';
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

interface WeekBand {
  x1: string;
  x2: string;
  shaded: boolean;
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

interface ChartTooltipPayloadItem {
  payload: {
    date: string;
    day: string;
    rollingWeekTotal: number;
    fourWeekWeeklyAvg: number;
  };
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: ChartTooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  if (!point.day) return null;
  return (
    <Box
      sx={{
        bgcolor: 'rgba(255,253,247,0.96)',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        px: 1.25,
        py: 0.75,
        boxShadow: '0 14px 30px rgba(15,23,42,0.16)',
      }}
    >
      <Typography variant="caption" color="text.secondary" display="block">
        {point.day} {shortDate(point.date)}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        7-day: {formatDashboardCurrencyExact(String(point.rollingWeekTotal))}
      </Typography>
      <Typography variant="caption" color="text.secondary" display="block">
        4-wk avg: {formatDashboardCurrencyExact(String(point.fourWeekWeeklyAvg))}
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
  const goalAmountLabel = sales.goal ? formatDashboardCurrency(sales.goal.amount) : isSuperuser ? 'Set' : '—';

  const dailyPoints = useMemo(
    () =>
      sales.daily_last_90_days.map((d) => ({
        date: d.date,
        day: d.day,
        weekStart: d.week_start,
        rolling: parseDashboardAmount(d.rolling_week_total),
        avg: parseDashboardAmount(d.four_week_weekly_avg),
      })),
    [sales.daily_last_90_days],
  );

  const chartData = useMemo(() => {
    const split = (v: number): { below: number | null; over: number | null } => ({
      below: goalAmount == null || v <= goalAmount ? v : null,
      over: goalAmount != null && v >= goalAmount ? v : null,
    });
    const makeRow = (
      date: string,
      day: string,
      weekStart: string,
      rolling: number,
      avg: number,
    ) => {
      const r = split(rolling);
      const a = split(avg);
      return {
        date,
        day,
        weekStart,
        rollingWeekTotal: rolling,
        fourWeekWeeklyAvg: avg,
        rollingBelow: r.below,
        rollingOver: r.over,
        avgBelow: a.below,
        avgOver: a.over,
      };
    };

    const rows: ReturnType<typeof makeRow>[] = [];
    for (let i = 0; i < dailyPoints.length; i += 1) {
      const p = dailyPoints[i];
      rows.push(makeRow(p.date, p.day, p.weekStart, p.rolling, p.avg));
      if (goalAmount == null || i === dailyPoints.length - 1) continue;

      const n = dailyPoints[i + 1];
      const crossings: { t: number; series: 'rolling' | 'avg' }[] = [];
      const addCross = (a: number, b: number, series: 'rolling' | 'avg') => {
        if ((a < goalAmount && b > goalAmount) || (a > goalAmount && b < goalAmount)) {
          crossings.push({ t: (goalAmount - a) / (b - a), series });
        }
      };
      addCross(p.rolling, n.rolling, 'rolling');
      addCross(p.avg, n.avg, 'avg');
      crossings.sort((x, y) => x.t - y.t);

      for (const c of crossings) {
        let rollingV = p.rolling + (n.rolling - p.rolling) * c.t;
        let avgV = p.avg + (n.avg - p.avg) * c.t;
        if (c.series === 'rolling') rollingV = goalAmount;
        else avgV = goalAmount;
        rows.push(makeRow('', '', p.weekStart, rollingV, avgV));
      }
    }
    return rows;
  }, [dailyPoints, goalAmount]);

  const weekBands = useMemo<WeekBand[]>(() => {
    const bands: WeekBand[] = [];
    const seen = new Set<string>();
    let shaded = false;
    let currentStart: string | null = null;
    dailyPoints.forEach((d, idx) => {
      if (!seen.has(d.weekStart)) {
        if (currentStart !== null) {
          bands.push({ x1: currentStart, x2: dailyPoints[idx - 1].date, shaded });
          shaded = !shaded;
        }
        seen.add(d.weekStart);
        currentStart = d.date;
      }
      if (idx === dailyPoints.length - 1 && currentStart !== null) {
        bands.push({ x1: currentStart, x2: d.date, shaded });
      }
    });
    return bands;
  }, [dailyPoints]);

  const mondayTicks = useMemo(
    () =>
      sales.daily_last_90_days
        .filter((d) => d.day === 'Monday')
        .filter((_, i) => !isCompact || i % 3 === 0)
        .map((d) => d.date),
    [sales.daily_last_90_days, isCompact],
  );

  const todayShort = dailyPoints.length
    ? dailyPoints[dailyPoints.length - 1].day.slice(0, 3)
    : '';

  const chartMax = useMemo(() => {
    const highestDataPoint = dailyPoints.reduce(
      (highest, point) => Math.max(highest, point.rolling, point.avg),
      0,
    );
    return Math.ceil(Math.max(highestDataPoint, goalAmount ?? 0) * 1.08);
  }, [dailyPoints, goalAmount]);

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
            <ResponsiveContainer width="99%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={dashboardPalette.green} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={dashboardPalette.green} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="goldHighlight" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={dashboardPalette.gold} />
                    <stop offset="35%" stopColor={dashboardPalette.goldBright} />
                    <stop offset="55%" stopColor="#fff8d6" />
                    <stop offset="75%" stopColor={dashboardPalette.goldBright} />
                    <stop offset="100%" stopColor={dashboardPalette.gold} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(99, 112, 102, 0.22)" />
                {weekBands
                  .filter((b) => b.shaded)
                  .map((b) => (
                    <ReferenceArea
                      key={b.x1}
                      x1={b.x1}
                      x2={b.x2}
                      fill="currentColor"
                      fillOpacity={0.035}
                    />
                  ))}
                <XAxis
                  dataKey="date"
                  ticks={mondayTicks}
                  tickFormatter={shortDate}
                  tick={{ fontSize: 11, fontWeight: 600, fill: dashboardPalette.muted }}
                  interval={0}
                />
                <YAxis
                  domain={[0, chartMax]}
                  tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                  tick={{ fontSize: 10, fill: dashboardPalette.muted }}
                  width={44}
                />
                <RechartsTooltip content={<ChartTooltip />} />
                {goalAmount != null && (
                  <ReferenceLine
                    y={goalAmount}
                    stroke={dashboardPalette.gold}
                    strokeWidth={1.5}
                    ifOverflow="extendDomain"
                    label={{
                      value: isCompact
                        ? `GOAL ${formatDashboardCurrency(String(goalAmount))}`
                        : `GOAL ${formatDashboardCurrencyExact(String(goalAmount))}`,
                      position: 'insideTopRight',
                      fill: dashboardPalette.goldDark,
                      fontSize: isCompact ? 10 : 11,
                      fontWeight: 900,
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="rollingWeekTotal"
                  stroke="none"
                  fill="url(#salesFill)"
                  name="7-day total"
                />
                <Line
                  type="monotone"
                  dataKey="rollingBelow"
                  stroke={dashboardPalette.green}
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  legendType="none"
                  tooltipType="none"
                />
                <Line
                  type="monotone"
                  dataKey="avgBelow"
                  stroke={dashboardPalette.greenDark}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                  legendType="none"
                  tooltipType="none"
                />
                {goalAmount != null && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="rollingOver"
                      stroke="#ffe08a"
                      strokeWidth={7}
                      strokeOpacity={0.55}
                      strokeLinecap="round"
                      dot={false}
                      connectNulls={false}
                      legendType="none"
                      isAnimationActive={false}
                      tooltipType="none"
                    />
                    <Line
                      type="monotone"
                      dataKey="rollingOver"
                      stroke="url(#goldHighlight)"
                      strokeWidth={3}
                      strokeLinecap="round"
                      dot={false}
                      connectNulls={false}
                      legendType="none"
                      isAnimationActive={false}
                      tooltipType="none"
                    />
                    <Line
                      type="monotone"
                      dataKey="avgOver"
                      stroke="url(#goldHighlight)"
                      strokeWidth={3}
                      strokeDasharray="5 5"
                      strokeLinecap="butt"
                      dot={false}
                      connectNulls={false}
                      legendType="none"
                      isAnimationActive={false}
                      tooltipType="none"
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
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
