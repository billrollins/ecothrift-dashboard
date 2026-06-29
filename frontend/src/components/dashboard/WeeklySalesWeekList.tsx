import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Popover,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { SalesWeeklyRow as SalesWeeklyRowType } from '../../types/pos.types';
import { dashboardPalette } from './dashboardCardStyles';
import {
  formatDashboardCurrency,
  formatItemsSold,
  longDayTitle,
  weekDateRange,
} from './dashboardFormatters';
import { SalesDayDetailContent } from './SalesDayDetailContent';

interface WeeklySalesWeekListProps {
  weeks: SalesWeeklyRowType[];
  todayIso?: string;
  todayDay?: string;
}

type DailyVariant = 'default' | 'today' | 'thisWeek' | 'sameDow';

const VARIANT_SX: Record<DailyVariant, { bgcolor: string; borderColor: string }> = {
  default: { bgcolor: 'transparent', borderColor: 'rgba(91, 111, 95, 0.32)' },
  thisWeek: { bgcolor: dashboardPalette.goldSoft, borderColor: 'rgba(189, 134, 24, 0.5)' },
  sameDow: { bgcolor: dashboardPalette.blueSoft, borderColor: 'rgba(47, 103, 173, 0.48)' },
  today: { bgcolor: dashboardPalette.greenSoft, borderColor: dashboardPalette.green },
};

function variantFor(
  d: SalesWeeklyRowType['days'][number],
  opts: { isThisWeek: boolean; todayIso?: string; todayDay?: string },
): DailyVariant {
  if (opts.todayIso && d.date === opts.todayIso) return 'today';
  if (opts.isThisWeek) return 'thisWeek';
  if (opts.todayDay && d.day === opts.todayDay) return 'sameDow';
  return 'default';
}

interface DayRowProps {
  dayName: string;
  date: string;
  revenue: string;
  itemsSold: number;
  variant: DailyVariant;
  salesLabel: string;
}

function DayRow({ dayName, date, revenue, itemsSold, variant, salesLabel }: DayRowProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const variantSx = VARIANT_SX[variant];
  const open = Boolean(anchor);

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: 1,
          alignItems: 'center',
          width: '100%',
          px: 1,
          py: 0.75,
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
        <Box>
          <Typography variant="body2" fontWeight={variant === 'today' ? 800 : 700} lineHeight={1.2}>
            {dayName.slice(0, 3)}
          </Typography>
          <Typography variant="caption" color="text.secondary" lineHeight={1.1}>
            {date.slice(5).replace('-', '/')}
          </Typography>
        </Box>
        <Typography variant="body2" fontWeight={800} sx={{ minWidth: 64, textAlign: 'right' }}>
          {formatDashboardCurrency(revenue)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36, textAlign: 'right' }}>
          {formatItemsSold(itemsSold)}
        </Typography>
      </Box>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              px: 1.5,
              py: 1.25,
              maxWidth: 280,
              borderRadius: 1.5,
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
            },
          },
        }}
      >
        <SalesDayDetailContent
          headline={longDayTitle(dayName, date)}
          salesLabel={salesLabel}
          revenue={revenue}
          itemsSold={itemsSold}
        />
      </Popover>
    </>
  );
}

function WeekDayList({
  week,
  isThisWeek,
  todayIso,
  todayDay,
  salesLabel,
}: {
  week: SalesWeeklyRowType;
  isThisWeek: boolean;
  todayIso?: string;
  todayDay?: string;
  salesLabel: string;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {week.days.map((d) => (
        <DayRow
          key={d.date}
          dayName={d.day}
          date={d.date}
          revenue={d.revenue}
          itemsSold={d.items_sold ?? 0}
          variant={variantFor(d, { isThisWeek, todayIso, todayDay })}
          salesLabel={salesLabel}
        />
      ))}
    </Box>
  );
}

export function WeeklySalesWeekList({ weeks, todayIso, todayDay }: WeeklySalesWeekListProps) {
  const thisWeek = weeks.find((w) => w.label === 'This Week');
  const pastWeeks = weeks.filter((w) => w.label !== 'This Week');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {thisWeek ?
        <Box>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              mb: 0.75,
              px: 0.25,
            }}
          >
            <Typography variant="subtitle2" fontWeight={800}>
              This Week
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {weekDateRange(thisWeek.week_start, thisWeek.week_end)}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 1,
              px: 1,
              pb: 0.35,
            }}
          >
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              Day
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textAlign: 'right' }}>
              Sales
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ textAlign: 'right' }}>
              Items
            </Typography>
          </Box>
          <WeekDayList
            week={thisWeek}
            isThisWeek
            todayIso={todayIso}
            todayDay={todayDay}
            salesLabel="Daily Sales"
          />
          <Box
            sx={{
              mt: 0.75,
              px: 1,
              py: 0.65,
              borderRadius: 1.5,
              bgcolor: dashboardPalette.green,
              color: dashboardPalette.textOnBackdrop,
            }}
          >
            <Typography variant="caption" fontWeight={800} display="block" lineHeight={1}>
              Week total
            </Typography>
            <Typography variant="body1" fontWeight={900}>
              {formatDashboardCurrency(thisWeek.week_total)}
            </Typography>
          </Box>
        </Box>
      : null}

      {pastWeeks.length > 0 ?
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ mb: 0.5, display: 'block' }}>
            Past weeks
          </Typography>
          {pastWeeks.map((week) => (
            <Accordion
              key={week.week_start}
              disableGutters
              elevation={0}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: '8px !important',
                mb: 0.5,
                '&:before': { display: 'none' },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', pr: 1 }}>
                  <Typography variant="body2" fontWeight={700}>
                    {week.label}
                  </Typography>
                  <Typography variant="body2" fontWeight={800}>
                    {formatDashboardCurrency(week.week_total)}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0, pb: 1 }}>
                <WeekDayList
                  week={week}
                  isThisWeek={false}
                  todayIso={todayIso}
                  todayDay={todayDay}
                  salesLabel="Daily Sales"
                />
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      : null}
    </Box>
  );
}
