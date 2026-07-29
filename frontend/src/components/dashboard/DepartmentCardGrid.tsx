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
  /** When set, day cells with content become buttons that call this. */
  onCellClick?: (day: DepartmentDailyMetric, event: React.MouseEvent<HTMLElement>) => void;
  /** Predicate: should this day cell be clickable? */
  isCellClickable?: (day: DepartmentDailyMetric) => boolean;
  /** Optional handler when the sticky day-head row is tapped (e.g. open week detail). */
  onDayHeadsClick?: () => void;
  cellAriaLabel?: (day: DepartmentDailyMetric, value: string) => string;
}

/** True when a retail day cell can deep-link (has submitted audit ids). */
export function retailDayIsClickable(day: DepartmentDailyMetric): boolean {
  return !day.is_future && Array.isArray(day.retail_audit_ids) && day.retail_audit_ids.length > 0;
}

function GridCell({
  value,
  isToday,
  goalState,
  clickable,
  onClick,
  ariaLabel,
}: {
  value: string;
  isToday?: boolean;
  goalState?: 'scheduled' | 'achieved';
  clickable?: boolean;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  ariaLabel?: string;
}) {
  const achieved = goalState === 'achieved';
  const scheduled = goalState === 'scheduled';
  const cellSx = {
    minWidth: 0,
    width: '100%',
    py: { xs: 0.45, md: 0.15 },
    px: 0.1,
    minHeight: { xs: 44, md: 'auto' },
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
    textAlign: 'center' as const,
    boxShadow: achieved
      ? '0 0 0 1px rgba(189,134,24,0.28), inset 0 1px 0 rgba(255,255,255,0.8)'
      : isToday
        ? '0 0 0 1px rgba(47, 122, 72, 0.5), inset 0 1px 0 rgba(255,255,255,0.45)'
        : 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...(clickable
      ? {
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
          appearance: 'none' as const,
          WebkitAppearance: 'none' as const,
          transition: 'box-shadow 0.15s ease, transform 0.15s ease',
          '@media (hover: hover)': {
            '&:hover': {
              boxShadow: '0 0 0 2px rgba(47, 103, 173, 0.45)',
            },
          },
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: dashboardPalette.blue,
            outlineOffset: 1,
          },
        }
      : {}),
  };

  const content = (
    <Typography
      variant="caption"
      fontWeight={isToday || achieved ? 900 : 800}
      noWrap
      sx={{
        fontSize: { xs: '0.7rem', md: '0.56rem' },
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
  );

  if (clickable && onClick) {
    return (
      <Box
        component="button"
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        sx={cellSx}
      >
        {content}
      </Box>
    );
  }

  return <Box sx={cellSx}>{content}</Box>;
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
        sx={{ fontSize: { xs: '0.65rem', md: '0.53rem' }, lineHeight: 1.15, display: 'block' }}
      >
        {weekRowLabel(week)}
      </Typography>
      <Typography
        variant="caption"
        fontWeight={900}
        noWrap
        sx={{
          fontSize: { xs: '0.6rem', md: '0.5rem' },
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
  onCellClick,
  isCellClickable,
  onDayHeadsClick,
  cellAriaLabel,
}: DepartmentCardGridProps) {
  // Newest week first so the scroller opens on the current week.
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
        minHeight: 0,
      }}
    >
      <Box
        component={onDayHeadsClick ? 'button' : 'div'}
        type={onDayHeadsClick ? 'button' : undefined}
        onClick={onDayHeadsClick}
        aria-label={onDayHeadsClick ? 'Open full week detail' : undefined}
        sx={{
          display: 'grid',
          gridTemplateColumns: '34px repeat(7, minmax(0, 1fr))',
          gap: 0.25,
          ...(onDayHeadsClick
            ? {
                p: 0,
                m: 0,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
                width: '100%',
                borderRadius: 0.75,
                minHeight: { xs: 36, md: 'auto' },
                '&:focus-visible': {
                  outline: '2px solid',
                  outlineColor: dashboardPalette.blue,
                  outlineOffset: 1,
                },
              }
            : {}),
        }}
      >
        <Box />
        {DAY_HEADS.map((head, idx) => (
          <Typography
            key={`${head}-${idx}`}
            variant="caption"
            color="text.secondary"
            textAlign="center"
            sx={{
              fontSize: { xs: '0.65rem', md: '0.52rem' },
              fontWeight: 900,
              lineHeight: 1.2,
              letterSpacing: 0.2,
            }}
          >
            {head}
          </Typography>
        ))}
      </Box>
      <Box
        sx={{
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          maxHeight: { xs: 168, md: 132 },
          display: 'flex',
          flexDirection: 'column',
          gap: 0.25,
          pr: 0.15,
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: `${dashboardPalette.muted}52`,
            borderRadius: 999,
          },
        }}
      >
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
            {week.days.map((day) => {
              const value = getValue(day);
              const clickable = Boolean(isCellClickable?.(day) && onCellClick);
              return (
                <GridCell
                  key={day.date}
                  value={value}
                  isToday={!!todayIso && day.date === todayIso}
                  goalState={getCellState?.(day)}
                  clickable={clickable}
                  onClick={clickable ? (event) => onCellClick?.(day, event) : undefined}
                  ariaLabel={cellAriaLabel?.(day, value)}
                />
              );
            })}
          </Box>
        ))}
      </Box>
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

export function retailCellAriaLabel(day: DepartmentDailyMetric, value: string): string {
  const ids = day.retail_audit_ids ?? [];
  const count = ids.length;
  const dateLabel = shortDate(day.date);
  if (count === 0) return `${dateLabel} — ${value}`;
  return `${dateLabel} — grade ${day.retail ?? value}, ${count} audit${count === 1 ? '' : 's'}`;
}
