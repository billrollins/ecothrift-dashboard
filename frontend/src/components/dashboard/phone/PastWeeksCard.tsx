import { Box, Card, Typography } from '@mui/material';
import { useMemo, useState, type ReactNode } from 'react';
import type { SalesWeeklyRow } from '../../../types/pos.types';
import { dashboardPalette, dashboardPhoneCardSx } from '../dashboardCardStyles';
import {
  formatDashboardCurrency,
  formatItemsSold,
  longDayTitle,
  parseDashboardAmount,
  shortDate,
  weekDateRange,
} from '../dashboardFormatters';
import { SalesSubLines } from '../SalesSubLines';
import { DashboardPhoneSheet } from './DashboardPhoneSheet';
import { DayDetailSheet } from './DayDetailSheet';
import { VARIANT_SX, variantFor } from './salesDayVariant';

/**
 * The back of the phone Sales card (owner 2026-10-22): every week of the 14, this week first. Tap a week for its days
 * (with the week's returns and Thrift+ revenue), then a day for its numbers.
 */
export function PastWeeksCard({
  weeks,
  todayIso,
  todayDay,
  action,
}: {
  weeks: SalesWeeklyRow[];
  todayIso?: string;
  todayDay?: string;
  action?: ReactNode;
}) {
  const ordered = useMemo(
    () => weeks.slice().sort((a, b) => (a.week_start < b.week_start ? 1 : -1)),
    [weeks],
  );
  const maxTotal = Math.max(...ordered.map((week) => parseDashboardAmount(week.week_total)), 1);
  const [selected, setSelected] = useState<SalesWeeklyRow | null>(null);
  const [detail, setDetail] = useState<{
    headline: string;
    revenue: string;
    itemsSold: number;
    returns?: string;
    thriftplusRevenue?: string;
  } | null>(null);

  return (
    <>
      <Card elevation={0} sx={{ ...dashboardPhoneCardSx, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ px: 2, pt: 1.75, pb: 1.25, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
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
                Weekly sales
              </Typography>
              <Typography sx={{ mt: 0.4, fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.2 }}>
                Past {ordered.length} weeks
              </Typography>
            </Box>
            {action}
          </Box>
          <Box
            sx={{
              mt: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              flex: 1,
              minHeight: 0,
              // As tall as the trend side; the older weeks scroll.
              maxHeight: 224,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              pr: 0.25,
            }}
          >
            {ordered.map((week) => (
              <WeekRow key={week.week_start} week={week} maxTotal={maxTotal} onClick={() => setSelected(week)} />
            ))}
          </Box>
        </Box>
      </Card>

      <DashboardPhoneSheet
        open={selected !== null}
        title={selected ? selected.label : 'Week'}
        onClose={() => setSelected(null)}
        fullHeight
      >
        {selected ? (
          <WeekDayList
            week={selected}
            todayIso={todayIso}
            todayDay={todayDay}
            onPickDay={(day) =>
              setDetail({
                headline: longDayTitle(day.day, day.date),
                revenue: day.revenue,
                itemsSold: day.items_sold ?? 0,
                returns: day.returns,
                thriftplusRevenue: day.thriftplus_revenue,
              })
            }
          />
        ) : null}
      </DashboardPhoneSheet>

      <DayDetailSheet
        open={detail !== null}
        onClose={() => setDetail(null)}
        headline={detail?.headline ?? ''}
        salesLabel="Daily Sales"
        revenue={detail?.revenue ?? '0'}
        itemsSold={detail?.itemsSold ?? 0}
        returns={detail?.returns}
        thriftplusRevenue={detail?.thriftplusRevenue}
      />
    </>
  );
}

function WeekRow({
  week,
  maxTotal,
  onClick,
}: {
  week: SalesWeeklyRow;
  maxTotal: number;
  onClick: () => void;
}) {
  const total = parseDashboardAmount(week.week_total);
  const fill = Math.min(100, (total / maxTotal) * 100);
  const isThisWeek = week.label === 'This Week';

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={`${week.label}, ${weekDateRange(week.week_start, week.week_end)}: ${formatDashboardCurrency(week.week_total)}. Show its days`}
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 1,
        alignItems: 'center',
        width: '100%',
        minHeight: 44,
        flexShrink: 0,
        px: 1,
        border: '1px solid',
        borderColor: isThisWeek ? 'rgba(189, 134, 24, 0.5)' : 'rgba(91, 111, 95, 0.32)',
        borderRadius: 1.5,
        bgcolor: isThisWeek ? dashboardPalette.goldSoft : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 800, lineHeight: 1.2 }}>
          {week.label}
          <Box component="span" sx={{ ml: 0.75, fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
            {shortDate(week.week_start)}
          </Box>
        </Typography>
        <Box
          sx={{
            mt: 0.4,
            height: 6,
            borderRadius: 99,
            bgcolor: 'rgba(47, 122, 72, 0.12)',
            overflow: 'hidden',
          }}
        >
          <Box
            sx={{
              width: `${fill}%`,
              height: '100%',
              bgcolor: dashboardPalette.green,
              borderRadius: 99,
            }}
          />
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 800, flexShrink: 0 }}>
        {formatDashboardCurrency(week.week_total)}
      </Typography>
    </Box>
  );
}

function WeekDayList({
  week,
  todayIso,
  todayDay,
  onPickDay,
}: {
  week: SalesWeeklyRow;
  todayIso?: string;
  todayDay?: string;
  onPickDay: (day: SalesWeeklyRow['days'][number]) => void;
}) {
  const isThisWeek = week.label === 'This Week';
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.5 }}>
        {weekDateRange(week.week_start, week.week_end)}
      </Typography>
      {week.days.map((day) => {
        const variant = variantFor(day, { isThisWeek, todayIso, todayDay });
        const variantSx = VARIANT_SX[variant];
        return (
          <Box
            key={day.date}
            component="button"
            type="button"
            onClick={() => onPickDay(day)}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 1,
              alignItems: 'center',
              width: '100%',
              minHeight: 48,
              px: 1,
              border: '1px solid',
              borderColor: variantSx.borderColor,
              borderRadius: 1.5,
              bgcolor: variantSx.bgcolor,
              cursor: 'pointer',
              textAlign: 'left',
              font: 'inherit',
              color: 'inherit',
            }}
          >
            <Typography sx={{ fontSize: '0.875rem', fontWeight: variant === 'today' ? 800 : 700 }}>
              {day.day.slice(0, 3)} {day.date.slice(5).replace('-', '/')}
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 800 }}>
              {formatDashboardCurrency(day.revenue)}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', minWidth: 36, textAlign: 'right' }}>
              {formatItemsSold(day.items_sold ?? 0)}
            </Typography>
          </Box>
        );
      })}
      <Box
        sx={{
          mt: 0.5,
          px: 1.25,
          py: 0.85,
          minHeight: 48,
          borderRadius: 1.5,
          bgcolor: dashboardPalette.green,
          color: dashboardPalette.textOnBackdrop,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 800, lineHeight: 1 }}>Week total</Typography>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 900 }}>{formatDashboardCurrency(week.week_total)}</Typography>
        <SalesSubLines
          period={isThisWeek ? 'This week' : 'That week'}
          returns={week.week_returns}
          thriftplusRevenue={week.week_thriftplus_revenue}
          color="inherit"
        />
      </Box>
    </Box>
  );
}
