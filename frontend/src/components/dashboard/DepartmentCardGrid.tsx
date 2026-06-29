import { Box, Typography } from '@mui/material';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../types/pos.types';
import {
  formatDashboardCurrencyCompact,
  parseDashboardAmount,
  shortDate,
} from './dashboardFormatters';
import { dashboardPalette } from './dashboardCardStyles';

const DAY_HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface DepartmentCardGridProps {
  weeks: DepartmentDailyWeek[];
  getValue: (day: DepartmentDailyMetric) => string;
  getWeekTotal: (week: DepartmentDailyWeek) => string;
  todayIso?: string;
}

function GridCell({ value, isToday }: { value: string; isToday?: boolean }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        py: 0.15,
        px: 0.1,
        border: '1px solid',
        borderColor: isToday ? dashboardPalette.green : 'rgba(91, 111, 95, 0.32)',
        borderRadius: 0.75,
        bgcolor: isToday ? dashboardPalette.greenSoft : 'transparent',
        textAlign: 'center',
        boxShadow: isToday ? '0 0 0 1px rgba(47, 122, 72, 0.5), inset 0 1px 0 rgba(255,255,255,0.45)' : 'none',
      }}
    >
      <Typography
        variant="caption"
        fontWeight={isToday ? 900 : 800}
        noWrap
        sx={{ fontSize: '0.56rem', lineHeight: 1.2, color: isToday ? dashboardPalette.greenDark : 'inherit' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function weekRowLabel(week: DepartmentDailyWeek): string {
  return shortDate(week.week_start);
}

function WeekLabelCell({ week, total }: { week: DepartmentDailyWeek; total: string }) {
  return (
    <Box sx={{ alignSelf: 'center', textAlign: 'center', minWidth: 0, px: 0.1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={700}
        noWrap
        sx={{ fontSize: '0.53rem', lineHeight: 1.15, display: 'block' }}
      >
        {weekRowLabel(week)}
      </Typography>
      <Typography
        variant="caption"
        fontWeight={900}
        noWrap
        sx={{ fontSize: '0.5rem', lineHeight: 1.15, display: 'block', color: 'text.primary' }}
      >
        {total}
      </Typography>
    </Box>
  );
}

export function sumDepartmentWeek(
  week: DepartmentDailyWeek,
  pick: (day: DepartmentDailyMetric) => number,
): number {
  return week.days.reduce((sum, day) => (day.is_future ? sum : sum + pick(day)), 0);
}

export function DepartmentCardGrid({ weeks, getValue, getWeekTotal, todayIso }: DepartmentCardGridProps) {
  const orderedWeeks = [...weeks].reverse();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        pt: 0.35,
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: '34px repeat(7, minmax(0, 1fr))', gap: 0.25 }}>
        <Box />
        {DAY_HEADS.map((head, idx) => (
          <Typography
            key={`${head}-${idx}`}
            variant="caption"
            color="text.secondary"
            textAlign="center"
            sx={{ fontSize: '0.52rem', fontWeight: 900, lineHeight: 1.2, letterSpacing: 0.2 }}
          >
            {head}
          </Typography>
        ))}
      </Box>
      {orderedWeeks.map((week) => (
        <Box
          key={week.week_start}
          sx={{ display: 'grid', gridTemplateColumns: '34px repeat(7, minmax(0, 1fr))', gap: 0.25 }}
        >
          <WeekLabelCell week={week} total={getWeekTotal(week)} />
          {week.days.map((day) => (
            <GridCell key={day.date} value={getValue(day)} isToday={!!todayIso && day.date === todayIso} />
          ))}
        </Box>
      ))}
    </Box>
  );
}

export function buyingGridValue(day: DepartmentDailyMetric): string {
  return day.is_future ? '—' : formatDashboardCurrencyCompact(day.buying);
}

export function buyingWeekTotal(week: DepartmentDailyWeek): string {
  return formatDashboardCurrencyCompact(
    String(sumDepartmentWeek(week, (day) => parseDashboardAmount(day.buying))),
  );
}

export function processingGridValue(day: DepartmentDailyMetric): string {
  return day.is_future ? '—' : formatDashboardCurrencyCompact(day.processing);
}

export function processingWeekTotal(week: DepartmentDailyWeek): string {
  return formatDashboardCurrencyCompact(
    String(sumDepartmentWeek(week, (day) => parseDashboardAmount(day.processing))),
  );
}

export function restorationGridValue(day: DepartmentDailyMetric): string {
  return day.is_future ? '—' : String(day.restoration);
}

export function restorationWeekTotal(week: DepartmentDailyWeek): string {
  return String(sumDepartmentWeek(week, (day) => day.restoration));
}

export function retailGridValue(day: DepartmentDailyMetric): string {
  return day.is_future ? '—' : (day.retail ?? '—');
}
