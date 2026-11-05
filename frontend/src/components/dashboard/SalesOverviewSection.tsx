import { Box, Button, ButtonGroup, Card, CardContent, IconButton, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { canAccess } from '../../auth/access';
import { useAuth } from '../../hooks/useAuth';
import { t } from '../../i18n/routines';
import type { SalesMetrics } from '../../types/pos.types';
import {
  formatDashboardCurrency,
  formatDashboardCurrencyExact,
  parseDashboardAmount,
  shortDate,
} from './dashboardFormatters';
import { SalesGoalDialog } from './SalesGoalDialog';
import { SalesTrendChart } from './SalesTrendChart';
import {
  buildSalesChartData,
  buildWeekBands,
  mondayTickDates,
  salesChartMax,
  salesDailyPoints,
  salesFiveKTicks,
  salesTrendWindow,
} from './salesChartData';
import { useDashboardLayout } from './useDashboardLayout';
import {
  dashboardCardHoverLiftSx,
  dashboardPalette,
  dashboardRaisedCardSx,
} from './dashboardCardStyles';

interface SalesOverviewSectionProps {
  sales: SalesMetrics;
  /** The flip button, in the header's corner (owner 2026-10-22). */
  action?: ReactNode;
}

const RED = '#b3261e';

/** Shared shape of the two boxes (owner 2026-11-05: Rolling 7 days looks like the Weekly Goal box). */
const statBoxSx = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  width: '100%',
  minWidth: 0,
  px: 1.25,
  py: 0.85,
  borderRadius: 2.5,
  border: '1px solid',
  overflow: 'hidden',
  textAlign: 'left',
  font: 'inherit',
  color: 'inherit',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 3px rgba(20, 30, 24, 0.14), 0 4px 12px rgba(20, 30, 24, 0.12)',
} as const;

function StatBoxText({ label, value, ink, labelInk, aside }: {
  label: string;
  value: string;
  ink: string;
  labelInk?: string;
  aside: ReactNode;
}) {
  return (
    <>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="span"
          display="block"
          noWrap
          sx={{ color: labelInk ?? ink, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 900, lineHeight: 1.1, mb: 0.4 }}
        >
          {label}
        </Typography>
        <Typography
          component="span"
          display="block"
          sx={{ color: ink, fontSize: '1.2rem', fontWeight: 900, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </Typography>
      </Box>
      {aside}
    </>
  );
}

type RollingTone = 'over' | 'near' | 'under' | 'plain';

function rollingTone(pct: number | null): RollingTone {
  if (pct == null) return 'plain';
  if (pct >= 100) return 'over';
  return pct >= 80 ? 'near' : 'under';
}

/** Rolling 7 days, shaped like the Weekly Goal box and decorated by how it compares to the goal (owner 2026-11-05):
 * gold with a trophy at or over the goal, green from 80%, red under 80%. The percent of goal is the hover: it
 * takes the icon's place inside the box (a fixed slot), so it never covers anything and nothing moves. */
function RollingStat({ value, goal }: { value: string; goal: number | null }) {
  const amount = parseDashboardAmount(value);
  // Floor, so 99.6% never reads "100%" and 79.9% never reads "80%" in a red box.
  const pct = goal ? Math.floor((amount / goal) * 100) : null;
  const tone = rollingTone(pct);
  const look = {
    over: {
      ink: dashboardPalette.goldDark,
      border: dashboardPalette.gold,
      bg: 'linear-gradient(145deg, #fff8dc, rgba(242, 201, 76, 0.38))',
      icon: <EmojiEventsIcon />,
    },
    near: {
      ink: dashboardPalette.greenDark,
      border: dashboardPalette.green,
      bg: 'linear-gradient(145deg, rgba(255,253,247,0.98), rgba(47,122,72,0.16))',
      icon: <TrendingUpIcon />,
    },
    under: {
      ink: RED,
      border: RED,
      bg: 'linear-gradient(145deg, rgba(255,253,247,0.98), rgba(179,38,30,0.13))',
      icon: <TrendingDownIcon />,
    },
    plain: {
      ink: dashboardPalette.greenDark,
      border: dashboardPalette.softBorderStrong,
      bg: dashboardPalette.surface,
      icon: null,
    },
  }[tone];
  const aside = pct == null ? null : (
    <Box
      sx={{
        display: 'grid',
        justifyItems: 'end',
        alignItems: 'center',
        minWidth: '2.6em',
        color: look.ink,
        '& > *': { gridArea: '1 / 1', transition: 'opacity 120ms ease' },
      }}
    >
      <Box aria-hidden className="rolling-icon" sx={{ display: 'flex', opacity: 0.85, '& svg': { fontSize: 22 } }}>
        {look.icon}
      </Box>
      <Box data-testid="sales-rolling-7-hover" className="rolling-pct" sx={{ opacity: 0, textAlign: 'right', lineHeight: 1 }}>
        <Typography component="span" display="block" sx={{ fontWeight: 900, fontSize: '1rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {pct}%
        </Typography>
        <Typography component="span" display="block" sx={{ fontWeight: 800, fontSize: '0.6rem', letterSpacing: 0.6, textTransform: 'uppercase', mt: 0.25 }}>
          of goal
        </Typography>
      </Box>
    </Box>
  );
  return (
    <Box
      data-testid="sales-rolling-7"
      data-tone={tone}
      tabIndex={pct == null ? undefined : 0}
      aria-label={pct == null ? undefined : `Rolling 7 days ${formatDashboardCurrency(value)}, ${pct}% of goal`}
      sx={{
        ...statBoxSx,
        borderColor: look.border,
        background: look.bg,
        cursor: pct == null ? 'default' : 'help',
        '&:hover .rolling-icon, &:focus-visible .rolling-icon': { opacity: 0 },
        '&:hover .rolling-pct, &:focus-visible .rolling-pct': { opacity: 1 },
        '&:focus-visible': { outline: `2px solid ${look.ink}`, outlineOffset: 1 },
      }}
    >
      <StatBoxText label="Rolling 7 days" value={formatDashboardCurrency(value)} ink={look.ink} aside={aside} />
    </Box>
  );
}

/** The weekly goal: the calm reference (plain ink, a gold flag), so gold on the card means "over goal" only. */
function GoalStat({ amountLabel, onClick }: { amountLabel: string; onClick: () => void }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      data-testid="sales-weekly-goal"
      sx={{
        ...statBoxSx,
        borderColor: dashboardPalette.softBorderStrong,
        background: dashboardPalette.surface,
        cursor: 'pointer',
        '&:hover': { borderColor: dashboardPalette.gold },
        '&:focus-visible': { outline: `2px solid ${dashboardPalette.gold}`, outlineOffset: 1 },
      }}
    >
      <StatBoxText
        label="Weekly goal"
        value={amountLabel}
        ink="#1f2a22"
        labelInk={dashboardPalette.muted}
        aside={(
          <Box aria-hidden sx={{ display: 'flex', color: dashboardPalette.gold, '& svg': { fontSize: 22 } }}>
            <FlagOutlinedIcon />
          </Box>
        )}
      />
    </Box>
  );
}

/** One sales line (owner 2026-11-05): a label, the number, and last week's number beside it on the same baseline.
 * Today's line is big; the week's line has the same shape, smaller. */
function SalesLine({ label, value, lastLabel, lastValue, size, testId, children }: {
  label: string;
  value: string;
  lastLabel: string;
  lastValue: string;
  size: 'big' | 'mid';
  testId: string;
  children?: ReactNode;
}) {
  const big = size === 'big';
  return (
    <Box data-testid={testId} sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        noWrap
        sx={{ fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', lineHeight: 1.2, fontSize: '0.64rem', mb: 0.4 }}
      >
        {label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: big ? 2 : 1.5 }}>
        <Typography
          component="span"
          sx={{
            fontSize: big ? { xs: '1.9rem', md: '2.4rem' } : { xs: '1.1rem', md: '1.3rem' },
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: big ? '-0.02em' : 0,
            fontVariantNumeric: 'tabular-nums',
            color: 'text.primary',
          }}
        >
          {formatDashboardCurrency(value)}
        </Typography>
        <Typography
          component="span"
          noWrap
          sx={{ fontSize: big ? '0.82rem' : '0.76rem', fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
        >
          {lastLabel}{' '}
          <Box component="span" sx={{ fontWeight: 800 }}>{formatDashboardCurrency(lastValue)}</Box>
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

/** Today's returns and Thrift+ revenue, one small line under today's number (owner 2026-11-05: they belong with
 * today's sales). Whole dollars like every other figure on the card. */
/** On the wide card, today's returns or Thrift+ as a small figure in today's row, lined up with the box below it
 * (same inset as the box's text). Hidden on the narrow card, where they sit under today's number instead. */
function WideExtra({ area, label, value, minus = false }: { area: string; label: string; value: string; minus?: boolean }) {
  const text = formatDashboardCurrency(value);
  return (
    <Box data-area={area} sx={{ gridArea: area, display: 'none', px: 1.25, alignSelf: 'end', pb: 0.5 }}>
      <Typography
        component="span"
        display="block"
        noWrap
        sx={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'text.secondary', mb: 0.4 }}
      >
        {label}
      </Typography>
      <Typography
        component="span"
        display="block"
        sx={{ fontSize: '1.05rem', fontWeight: 800, color: 'text.primary', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}
      >
        {minus ? text.replace(/^-/, '−') : text}
      </Typography>
    </Box>
  );
}

function TodayExtras({ returns, thriftplusRevenue }: { returns?: string; thriftplusRevenue?: string }) {
  if (returns === undefined && thriftplusRevenue === undefined) return null;
  const part = (label: string, value: string) => (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      {label}{' '}
      <Box component="span" sx={{ fontWeight: 900, color: 'text.primary' }}>{value}</Box>
    </Box>
  );
  return (
    <Box
      data-testid="sales-sub-lines"
      aria-label="Today: returns and Thrift+ revenue"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 1.5,
        mt: 0.35,
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'text.secondary',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {/* A true minus sign: the hyphen sits apart from the "$" in this font. */}
      {part('Returns', formatDashboardCurrency(returns ?? '0').replace(/^-/, '−'))}
      {part('Thrift+', formatDashboardCurrency(thriftplusRevenue ?? '0'))}
    </Box>
  );
}

/** A short line naming the chart's lines (solid 7-day total, dashed 4-week average, gold goal). */
function ChartLegend({ goalAmount }: { goalAmount: number | null }) {
  const item = (swatch: ReactNode, text: string) => (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}>
      {swatch}
      {text}
    </Box>
  );
  const line = (color: string, dashed = false) => (
    <Box
      component="span"
      aria-hidden
      sx={{ width: 16, borderTop: `${dashed ? 2 : 2.5}px ${dashed ? 'dashed' : 'solid'} ${color}` }}
    />
  );
  return (
    <Box
      data-testid="sales-trend-legend"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 1.75,
        rowGap: 0.25,
        justifyContent: 'center',
        px: 0.5,
        mt: 0.5,
        fontSize: '0.68rem',
        fontWeight: 700,
        color: 'text.secondary',
      }}
    >
      {item(line(dashboardPalette.green), '7-day sales')}
      {item(line(dashboardPalette.greenDark, true), '4-week average')}
      {goalAmount != null ? item(line(dashboardPalette.gold), `Goal ${formatDashboardCurrency(String(goalAmount))}`) : null}
    </Box>
  );
}

export function SalesOverviewSection({ sales, action }: SalesOverviewSectionProps) {
  const { user } = useAuth();
  const { isCompact, isMobile } = useDashboardLayout();
  const isSuperuser = canAccess(user, ['dashboard.goals:write', 'admin:full']);
  const lang = user?.language === 'es' ? 'es' : 'en';
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  // The week's running total, big (Carrie, 2026-11-02): the same number as This Week on the back of the card.
  const weekTotal = sales.weekly_last_14_weeks.find((week) => week.label === 'This Week')?.week_total ?? '0';

  const goalAmount = sales.goal ? parseDashboardAmount(sales.goal.amount) : null;
  const canOpenGoal = Boolean(sales.goal) || isSuperuser;
  const goalAmountLabel = sales.goal ? formatDashboardCurrency(sales.goal.amount) : isSuperuser ? 'Set' : '-';

  // The trend (owner 2026-11-05): 12 weeks by default, zoom out to 36, scroll back to the start of 2026.
  const [trendWeeks, setTrendWeeks] = useState<12 | 36>(12);
  const [backWeeks, setBackWeeks] = useState(0);
  const history = sales.daily_history?.length ? sales.daily_history : sales.daily_last_90_days;
  const maxBack = Math.max(0, Math.ceil((history.length - trendWeeks * 7) / 7));
  const back = Math.min(backWeeks, maxBack);
  const shownDays = useMemo(
    () => salesTrendWindow(history, trendWeeks, back),
    [history, trendWeeks, back],
  );

  const dailyPoints = useMemo(() => salesDailyPoints(shownDays), [shownDays]);

  const chartData = useMemo(
    () => buildSalesChartData(dailyPoints, goalAmount),
    [dailyPoints, goalAmount],
  );

  const weekBands = useMemo(() => buildWeekBands(dailyPoints), [dailyPoints]);

  // Date labels thin out when the card is narrow (the 1440 column): a label every 2 weeks under ~560 px.
  const chartBoxRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => setChartWidth(entries[0]?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const narrow = isCompact || (chartWidth > 0 && chartWidth < 560);
  const mondayTicks = useMemo(
    () => mondayTickDates(shownDays, trendWeeks === 36 ? (narrow ? 6 : 4) : (narrow ? 2 : 1)),
    [shownDays, trendWeeks, narrow],
  );

  const lastDay = history.length ? history[history.length - 1] : null;
  const todayShort = lastDay ? lastDay.day.slice(0, 3) : '';
  const rolling7 = lastDay?.rolling_week_total ?? '0';

  const yTicks = useMemo(
    () => salesFiveKTicks(salesChartMax(dailyPoints, goalAmount)),
    [dailyPoints, goalAmount],
  );
  const chartMax = yTicks[yTicks.length - 1];
  // Owner 2026-11-05: the mouse wheel over the chart moves it back and forth, a week a notch (up = earlier).
  const wheelRef = useRef({ maxBack, acc: 0 });
  wheelRef.current.maxBack = maxBack;
  useEffect(() => {
    const el = chartBoxRef.current;
    if (!el) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      const state = wheelRef.current;
      state.acc += event.deltaY;
      if (Math.abs(state.acc) < 60) return;
      const step = state.acc < 0 ? 1 : -1;
      state.acc = 0;
      setBackWeeks((current) => Math.max(0, Math.min(state.maxBack, current + step)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const rangeLabel = shownDays.length
    ? `${shortDate(shownDays[0].date)} – ${shortDate(shownDays[shownDays.length - 1].date)}`
    : '';

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
          {/* One title line, like the department cards beside it (owner 2026-10-22: the flip button in its corner). */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
            <Box
              sx={{
                width: 28,
                height: 28,
                flexShrink: 0,
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: dashboardPalette.green,
                bgcolor: dashboardPalette.greenSoft,
                border: '1px solid',
                borderColor: `${dashboardPalette.green}40`,
                '& svg': { fontSize: 17 },
              }}
            >
              <PointOfSaleIcon />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                component="h3"
                sx={{ m: 0, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase', fontSize: '0.74rem', lineHeight: 1.1, color: dashboardPalette.green }}
              >
                Weekly sales
              </Typography>
              <Typography noWrap sx={{ fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', lineHeight: 1.25 }}>
                Store sales · today and the week
              </Typography>
            </Box>
            {action}
          </Box>
          {/* Owner 2026-11-05: today big with the same day last week beside it, and today's returns and Thrift+
              revenue with today; then this week against last week to date in the same shape, smaller; then Rolling 7
              days and the goal, side by side. */}
          {/* Narrow card (the 1440 column): today, the week, then the two boxes on their own line. Wide card
              (1920): the week line and the two boxes share one line, so the card's width is used evenly. */}
          <Box sx={{ containerType: 'inline-size', mb: 1.25 }}>
            <Box
              data-testid="sales-week-to-date"
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                gridTemplateAreas: canOpenGoal
                  ? '"today today" "rule rule" "week week" "roll goal"'
                  : '"today today" "rule rule" "week week" "roll roll"',
                columnGap: 1.25,
                rowGap: 0,
                alignItems: 'center',
                '@container (min-width: 600px)': {
                  gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr) minmax(0, 1fr)',
                  // Today's returns and Thrift+ move into today's row, over the two boxes' columns.
                  gridTemplateAreas: canOpenGoal
                    ? '"today ret tp" "rule rule rule" "week roll goal"'
                    : '"today ret tp" "rule rule rule" "week roll roll"',
                  '& > [data-area="roll"], & > [data-area="goal"]': { mt: 0 },
                  '& [data-area="extras-inline"]': { display: 'none' },
                  '& > [data-area="ret"], & > [data-area="tp"]': { display: 'block' },
                },
              }}
            >
              {!isMobile ? (
                <>
                  <WideExtra area="ret" label="Returns today" value={sales.today_returns ?? '0'} minus />
                  <WideExtra area="tp" label="Thrift+ today" value={sales.today_thriftplus_revenue ?? '0'} />
                </>
              ) : null}
              <Box sx={{ gridArea: 'today' }}>
                <SalesLine
                  testId="sales-today"
                  size="big"
                  label={todayShort ? `Today · ${todayShort}` : 'Today'}
                  value={sales.today}
                  lastLabel={todayShort ? `Last ${todayShort}` : 'Last wk'}
                  lastValue={sales.same_weekday_last_week}
                >
                  {!isMobile ? (
                    <Box data-area="extras-inline">
                      <TodayExtras returns={sales.today_returns} thriftplusRevenue={sales.today_thriftplus_revenue} />
                    </Box>
                  ) : null}
                </SalesLine>
              </Box>
              <Box sx={{ gridArea: 'rule', borderTop: '1px solid', borderColor: 'divider', my: 1.25 }} />
              <Box sx={{ gridArea: 'week' }}>
                <SalesLine
                  testId="sales-this-week"
                  size="mid"
                  label={t('thisWeek', lang)}
                  value={weekTotal}
                  lastLabel="Last wk to date"
                  lastValue={sales.last_week_to_date ?? '0'}
                />
              </Box>
              <Box data-area="roll" sx={{ gridArea: 'roll', mt: 1.5 }}>
                <RollingStat value={rolling7} goal={goalAmount} />
              </Box>
              {canOpenGoal && (
                <Box data-area="goal" sx={{ gridArea: 'goal', mt: 1.5 }}>
                  <GoalStat amountLabel={goalAmountLabel} onClick={() => setGoalDialogOpen(true)} />
                </Box>
              )}
            </Box>
          </Box>
          <Box
            data-testid="sales-trend-controls"
            sx={{ display: 'flex', alignItems: 'center', gap: 0.25, mb: 0.25 }}
          >
            <IconButton
              size="small"
              aria-label="Earlier weeks"
              disabled={back >= maxBack}
              onClick={() => setBackWeeks(Math.min(maxBack, back + 4))}
              sx={{ color: 'text.primary' }}
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Typography
              variant="caption"
              sx={{ fontWeight: 800, minWidth: 0, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}
              noWrap
            >
              {rangeLabel}
            </Typography>
            <IconButton
              size="small"
              aria-label="Later weeks"
              disabled={back === 0}
              onClick={() => setBackWeeks(Math.max(0, back - 4))}
              sx={{ color: 'text.primary' }}
            >
              <ChevronRightIcon fontSize="small" />
            </IconButton>
            {back > 0 && (
              <Button size="small" onClick={() => setBackWeeks(0)} sx={{ minWidth: 0, px: 0.75, fontWeight: 800 }}>
                Now
              </Button>
            )}
            <Box sx={{ flex: 1 }} />
            <ButtonGroup size="small" aria-label="Weeks shown">
              {([12, 36] as const).map((w) => (
                <Button
                  key={w}
                  variant={trendWeeks === w ? 'contained' : 'outlined'}
                  onClick={() => setTrendWeeks(w)}
                  sx={{ px: 1, minWidth: 0, fontWeight: 800 }}
                >
                  {w} wk
                </Button>
              ))}
            </ButtonGroup>
          </Box>
          <Box
            ref={chartBoxRef}
            data-testid="sales-trend-chart"
            sx={{
              width: '100%',
              flex: 1,
              minHeight: { xs: 200, md: 140 },
              minWidth: 0,
              overflow: 'hidden',
              pt: 0.5,
            }}
          >
            <SalesTrendChart
              data={chartData}
              weekBands={weekBands}
              ticks={mondayTicks}
              chartMax={chartMax}
              yTicks={yTicks}
              goalAmount={goalAmount}
              goalLabel={null}
              desktop
            />
          </Box>
          <ChartLegend goalAmount={goalAmount} />
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
