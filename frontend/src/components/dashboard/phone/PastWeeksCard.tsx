import { Box, Button, Card, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import type { SalesWeeklyRow } from '../../../types/pos.types';
import { dashboardPalette, dashboardPhoneCardSx } from '../dashboardCardStyles';
import {
  formatDashboardCurrency,
  formatItemsSold,
  longDayTitle,
  parseDashboardAmount,
  weekDateRange,
} from '../dashboardFormatters';
import { DashboardPhoneSheet } from './DashboardPhoneSheet';
import { DayDetailSheet } from './DayDetailSheet';
import { VARIANT_SX, variantFor } from './salesDayVariant';

const PREVIEW_COUNT = 4;

export function PastWeeksCard({
  weeks,
  todayIso,
  todayDay,
}: {
  weeks: SalesWeeklyRow[];
  todayIso?: string;
  todayDay?: string;
}) {
  const pastWeeks = useMemo(
    () =>
      weeks
        .filter((week) => week.label !== 'This Week')
        .slice()
        .sort((a, b) => (a.week_start < b.week_start ? 1 : -1)),
    [weeks],
  );
  const preview = pastWeeks.slice(0, PREVIEW_COUNT);
  const maxTotal = Math.max(...pastWeeks.map((week) => parseDashboardAmount(week.week_total)), 1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<SalesWeeklyRow | null>(null);
  const [detail, setDetail] = useState<{
    headline: string;
    revenue: string;
    itemsSold: number;
  } | null>(null);

  const closeSheet = () => {
    setSheetOpen(false);
    setSelected(null);
  };

  return (
    <>
      <Card elevation={0} sx={{ ...dashboardPhoneCardSx, overflow: 'hidden' }}>
        <Box sx={{ px: 2, pt: 1.75, pb: 1.25 }}>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.2 }}>
            Past weeks
          </Typography>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {preview.map((week) => (
              <WeekRow
                key={week.week_start}
                week={week}
                maxTotal={maxTotal}
                onClick={() => {
                  setSelected(week);
                  setSheetOpen(true);
                }}
              />
            ))}
          </Box>
          <Button
            fullWidth
            onClick={() => {
              setSelected(null);
              setSheetOpen(true);
            }}
            sx={{ mt: 1, minHeight: 44, fontWeight: 800, textTransform: 'none' }}
          >
            All {pastWeeks.length} weeks
          </Button>
        </Box>
      </Card>

      <DashboardPhoneSheet
        open={sheetOpen}
        title={selected ? selected.label : 'Past weeks'}
        onClose={closeSheet}
        onBack={selected ? () => setSelected(null) : undefined}
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
              })
            }
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {pastWeeks.map((week) => (
              <WeekRow
                key={week.week_start}
                week={week}
                maxTotal={maxTotal}
                onClick={() => setSelected(week)}
              />
            ))}
          </Box>
        )}
      </DashboardPhoneSheet>

      <DayDetailSheet
        open={detail !== null}
        onClose={() => setDetail(null)}
        headline={detail?.headline ?? ''}
        salesLabel="Daily Sales"
        revenue={detail?.revenue ?? '0'}
        itemsSold={detail?.itemsSold ?? 0}
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

  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: 1,
        alignItems: 'center',
        width: '100%',
        minHeight: 44,
        px: 1,
        border: '1px solid',
        borderColor: 'rgba(91, 111, 95, 0.32)',
        borderRadius: 1.5,
        bgcolor: 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 800, lineHeight: 1.2 }}>
          {week.label}
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
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.5 }}>
        {weekDateRange(week.week_start, week.week_end)}
      </Typography>
      {week.days.map((day) => {
        const variant = variantFor(day, { isThisWeek: false, todayIso, todayDay });
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
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 700 }}>
              {day.day.slice(0, 3)} {day.date.slice(5).replace('-', '/')}
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 800 }}>
              {formatDashboardCurrency(day.revenue)}
            </Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {formatItemsSold(day.items_sold ?? 0)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
