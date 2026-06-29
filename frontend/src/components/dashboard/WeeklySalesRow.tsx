import type { ReactElement } from 'react';
import { Box, Tooltip, Typography, useMediaQuery } from '@mui/material';
import type { SalesWeeklyRow as SalesWeeklyRowType } from '../../types/pos.types';
import {
  compactWeekDateRange,
  dayMonthTitle,
  formatDashboardCurrency,
  longDayTitle,
  weekDateRange,
} from './dashboardFormatters';
import { dashboardPalette } from './dashboardCardStyles';
import { SalesDayDetailContent } from './SalesDayDetailContent';

interface WeeklySalesRowProps {
  week: SalesWeeklyRowType;
  isThisWeek?: boolean;
  todayIso?: string;
  todayDay?: string;
}

type DailyVariant = 'default' | 'today' | 'thisWeek' | 'sameDow';

const cellSx = {
  minWidth: 0,
  px: 0.35,
  py: 0.25,
  border: '1px solid',
  borderRadius: 1,
  display: 'flex',
  flexDirection: 'column' as const,
  justifyContent: 'center',
  gap: 0,
  textAlign: 'center' as const,
  cursor: 'default',
};

const DAILY_VARIANT_SX: Record<DailyVariant, { bgcolor: string; borderColor: string }> = {
  default: { bgcolor: 'transparent', borderColor: 'rgba(91, 111, 95, 0.32)' },
  thisWeek: { bgcolor: dashboardPalette.goldSoft, borderColor: 'rgba(189, 134, 24, 0.5)' },
  sameDow: { bgcolor: dashboardPalette.blueSoft, borderColor: 'rgba(47, 103, 173, 0.48)' },
  today: { bgcolor: dashboardPalette.greenSoft, borderColor: dashboardPalette.green },
};

function SalesHoverTooltip({
  headline,
  subheadline,
  salesLabel,
  revenue,
  itemsSold,
  children,
}: {
  headline: string;
  subheadline?: string;
  salesLabel: string;
  revenue: string;
  itemsSold: number;
  children: ReactElement;
}) {
  const hoverCapable = useMediaQuery('(hover: hover)');

  return (
    <Tooltip
      followCursor={hoverCapable}
      disableInteractive
      disableHoverListener={!hoverCapable}
      disableTouchListener={false}
      enterDelay={250}
      leaveDelay={0}
      slotProps={{
        tooltip: {
          sx: {
            bgcolor: '#fff',
            color: '#0f172a',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
            border: '1px solid rgba(91, 111, 95, 0.22)',
            borderRadius: 1.5,
            px: 1.25,
            py: 1,
            maxWidth: 280,
            pointerEvents: 'none',
          },
        },
      }}
      title={
        <SalesDayDetailContent
          headline={headline}
          subheadline={subheadline}
          salesLabel={salesLabel}
          revenue={revenue}
          itemsSold={itemsSold}
        />
      }
    >
      {children}
    </Tooltip>
  );
}

function WeekTotalCell({
  label,
  value,
  weekStart,
  weekEnd,
  revenue,
  itemsSold,
}: {
  label: string;
  value: string;
  weekStart: string;
  weekEnd: string;
  revenue: string;
  itemsSold: number;
}) {
  const cell = (
    <Box
      sx={{
        ...cellSx,
        borderColor: 'rgba(47, 122, 72, 0.58)',
        color: dashboardPalette.textOnBackdrop,
        bgcolor: dashboardPalette.green,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
      }}
    >
      <Typography variant="caption" lineHeight={1} noWrap sx={{ fontSize: '0.6rem', fontWeight: 800, m: 0, letterSpacing: 0.2 }}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        lineHeight={1}
        noWrap
        sx={{ fontSize: '0.5rem', fontWeight: 700, m: 0, opacity: 0.92, letterSpacing: 0.05 }}
      >
        {compactWeekDateRange(weekStart, weekEnd)}
      </Typography>
      <Typography variant="body2" fontWeight={900} lineHeight={1.05} noWrap sx={{ m: 0, fontSize: '0.82rem' }}>
        {value}
      </Typography>
    </Box>
  );

  return (
    <SalesHoverTooltip
      headline={label}
      subheadline={weekDateRange(weekStart, weekEnd)}
      salesLabel="Weekly Sales"
      revenue={revenue}
      itemsSold={itemsSold}
    >
      {cell}
    </SalesHoverTooltip>
  );
}

function DailyCell({
  title,
  value,
  variant,
  dayName,
  date,
  revenue,
  itemsSold,
}: {
  title: string;
  value: string;
  variant: DailyVariant;
  dayName: string;
  date: string;
  revenue: string;
  itemsSold: number;
}) {
  const variantSx = DAILY_VARIANT_SX[variant];
  const emphasized = variant !== 'default';
  const cell = (
    <Box
      sx={{
        ...cellSx,
        borderColor: variantSx.borderColor,
        bgcolor: variantSx.bgcolor,
        ...(emphasized ? { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)' } : {}),
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        lineHeight={1}
        noWrap
        sx={{ fontSize: '0.58rem', fontWeight: 800, m: 0, letterSpacing: 0.1 }}
      >
        {title}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={variant === 'today' ? 900 : 800}
        lineHeight={1.08}
        noWrap
        sx={{ m: 0, color: variant === 'today' ? dashboardPalette.greenDark : 'inherit' }}
      >
        {value}
      </Typography>
    </Box>
  );

  return (
    <SalesHoverTooltip
      headline={longDayTitle(dayName, date)}
      salesLabel="Daily Sales"
      revenue={revenue}
      itemsSold={itemsSold}
    >
      {cell}
    </SalesHoverTooltip>
  );
}

export function WeeklySalesRow({
  week,
  isThisWeek = false,
  todayIso,
  todayDay,
}: WeeklySalesRowProps) {
  const variantFor = (d: SalesWeeklyRowType['days'][number]): DailyVariant => {
    if (todayIso && d.date === todayIso) return 'today';
    if (isThisWeek) return 'thisWeek';
    if (todayDay && d.day === todayDay) return 'sameDow';
    return 'default';
  };

  const weekItemsSold =
    week.week_items_sold ?? week.days.reduce((sum, d) => sum + (d.items_sold ?? 0), 0);

  return (
    <Box sx={{ p: 0.45 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1.3fr repeat(7, 1fr)',
          gap: 0.25,
          alignItems: 'stretch',
        }}
      >
        <WeekTotalCell
          label={week.label}
          value={formatDashboardCurrency(week.week_total)}
          weekStart={week.week_start}
          weekEnd={week.week_end}
          revenue={week.week_total}
          itemsSold={weekItemsSold}
        />
        {week.days.map((d) => (
          <DailyCell
            key={d.date}
            title={dayMonthTitle(d.day, d.date)}
            value={formatDashboardCurrency(d.revenue)}
            variant={variantFor(d)}
            dayName={d.day}
            date={d.date}
            revenue={d.revenue}
            itemsSold={d.items_sold ?? 0}
          />
        ))}
      </Box>
    </Box>
  );
}
