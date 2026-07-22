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
  getCellState?: (day: DepartmentDailyMetric) => 'scheduled' | 'achieved' | undefined;
  getWeekAchieved?: (week: DepartmentDailyWeek) => boolean;
  todayIso?: string;
}

function GridCell({
  value,
  isToday,
  goalState,
}: {
  value: string;
  isToday?: boolean;
  goalState?: 'scheduled' | 'achieved';
}) {
  const achieved = goalState === 'achieved';
  const scheduled = goalState === 'scheduled';
  return (
    <Box
      sx={{
        minWidth: 0,
        py: 0.15,
        px: 0.1,
        border: '1px solid',
        borderColor: achieved
          ? dashboardPalette.gold
          : scheduled
            ? 'rgba(189, 134, 24, 0.55)'
            : isToday
              ? dashboardPalette.green
              : 'rgba(91, 111, 95, 0.32)',
        borderStyle: scheduled && !achieved ? 'dashed' : 'solid',
        borderRadius: 0.75,
        background: achieved
          ? `linear-gradient(145deg, #fff7cf, ${dashboardPalette.goldSoft} 55%, #fffdf7)`
          : isToday
            ? dashboardPalette.greenSoft
            : 'transparent',
        textAlign: 'center',
        boxShadow: achieved
          ? '0 0 0 1px rgba(189,134,24,0.28), inset 0 1px 0 rgba(255,255,255,0.8)'
          : isToday
            ? '0 0 0 1px rgba(47, 122, 72, 0.5), inset 0 1px 0 rgba(255,255,255,0.45)'
            : 'none',
      }}
    >
      <Typography
        variant="caption"
        fontWeight={isToday || achieved ? 900 : 800}
        noWrap
        sx={{
          fontSize: '0.56rem',
          lineHeight: 1.2,
          color: achieved
            ? dashboardPalette.goldDark
            : isToday
              ? dashboardPalette.greenDark
              : 'inherit',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function weekRowLabel(week: DepartmentDailyWeek): string {
  return shortDate(week.week_start);
}

function WeekLabelCell({
  week,
  total,
  achieved,
}: {
  week: DepartmentDailyWeek;
  total: string;
  achieved?: boolean;
}) {
  return (
    <Box
      sx={{
        alignSelf: 'center',
        textAlign: 'center',
        minWidth: 0,
        px: 0.1,
        py: achieved ? 0.25 : 0,
        borderRadius: 0.75,
        bgcolor: achieved ? dashboardPalette.goldSoft : 'transparent',
      }}
    >
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
        sx={{
          fontSize: '0.5rem',
          lineHeight: 1.15,
          display: 'block',
          color: achieved ? dashboardPalette.goldDark : 'text.primary',
        }}
      >
        {achieved ? `★ ${total}` : total}
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

export function DepartmentCardGrid({
  weeks,
  getValue,
  getWeekTotal,
  getCellState,
  getWeekAchieved,
  todayIso,
}: DepartmentCardGridProps) {
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
          <WeekLabelCell
            week={week}
            total={getWeekTotal(week)}
            achieved={getWeekAchieved?.(week)}
          />
          {week.days.map((day) => (
            <GridCell
              key={day.date}
              value={getValue(day)}
              isToday={!!todayIso && day.date === todayIso}
              goalState={getCellState?.(day)}
            />
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
  if (day.is_future) return '—';
  const grade = day.retail ?? '—';
  if (!day.retail_scheduled) return grade;
  const count = day.retail_count ?? 0;
  const required = day.retail_required ?? 0;
  return day.retail_goal_met ? `${grade} ✓` : `${grade}·${count}/${required}`;
}

export function retailGoalCellState(
  day: DepartmentDailyMetric,
): 'scheduled' | 'achieved' | undefined {
  if (!day.retail_scheduled || day.is_future) {
    return day.retail_scheduled ? 'scheduled' : undefined;
  }
  return day.retail_goal_met ? 'achieved' : 'scheduled';
}

export function retailWeekGoalAchieved(week: DepartmentDailyWeek): boolean {
  return Boolean(week.retail_week_goal_met);
}

/**
 * Retail QA week score under the week label.
 * Spec: LAST submitted grade in the week — never average, never highest.
 */
export function retailWeekTotal(week: DepartmentDailyWeek): string {
  if (week.retail_week_grade) return week.retail_week_grade;
  // Fallback if an older API payload omits retail_week_grade: last calendar day with a grade.
  for (let i = week.days.length - 1; i >= 0; i -= 1) {
    const day = week.days[i];
    if (!day.is_future && day.retail) return day.retail;
  }
  return '—';
}
