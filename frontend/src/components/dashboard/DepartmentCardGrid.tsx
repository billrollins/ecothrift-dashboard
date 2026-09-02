import { Box, Typography } from '@mui/material';
import { useLayoutEffect, useRef, useState } from 'react';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../types/pos.types';
import {
  formatDashboardCurrencyCompact,
  parseDashboardAmount,
  shortDate,
} from './dashboardFormatters';
import { dashboardPalette } from './dashboardCardStyles';

/** Visible week rows in the card scroller - matches the pre-history 2-week layout. */
const VISIBLE_WEEK_ROWS = 2;

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

/** True when a retail day cell has a grade to open. */
export function retailDayIsClickable(day: DepartmentDailyMetric): boolean {
  return !day.is_future && Boolean(day.retail);
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
    // Fixed row geometry across all department cards (touch target on phone).
    minHeight: { xs: 44, md: 28 },
    height: { xs: 44, md: 28 },
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
      title={value}
      sx={{
        // Longer retail strings (e.g. B·1/2) shrink; cell box stays fixed.
        fontSize:
          value.length >= 6
            ? { xs: '0.58rem', md: '0.48rem' }
            : value.length >= 4
              ? { xs: '0.64rem', md: '0.52rem' }
              : { xs: '0.7rem', md: '0.56rem' },
        lineHeight: 1.15,
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
        alignSelf: 'stretch',
        textAlign: 'center',
        minWidth: 0,
        px: 0.1,
        py: 0.25,
        borderRadius: 0.75,
        bgcolor: achieved ? dashboardPalette.goldSoft : 'transparent',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        fontWeight={700}
        noWrap
        sx={{ fontSize: { xs: '0.65rem', md: '0.53rem' }, lineHeight: 1.1, display: 'block' }}
      >
        {weekRowLabel(week)}
      </Typography>
      <Typography
        variant="caption"
        fontWeight={900}
        noWrap
        title={total}
        sx={{
          fontSize:
            total.length >= 7
              ? { xs: '0.5rem', md: '0.42rem' }
              : { xs: '0.6rem', md: '0.5rem' },
          lineHeight: 1.1,
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | undefined>();

  // Size the scroller to exactly VISIBLE_WEEK_ROWS so the card matches the old 2-week look.
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const measure = () => {
      const rows = root.querySelectorAll<HTMLElement>('[data-week-row]');
      if (rows.length === 0) {
        setViewportHeight(undefined);
        return;
      }
      const styles = getComputedStyle(root);
      const gap = Number.parseFloat(styles.rowGap || styles.gap || '0') || 0;
      const rowsToMeasure = Math.min(VISIBLE_WEEK_ROWS, rows.length);
      let height = gap * Math.max(0, rowsToMeasure - 1);
      for (let i = 0; i < rowsToMeasure; i += 1) {
        height += rows[i].getBoundingClientRect().height;
      }
      setViewportHeight(height);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll('[data-week-row]').forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [orderedWeeks.length]);

  const snapToTop = () => {
    const root = scrollRef.current;
    if (!root || root.scrollTop === 0) return;
    root.scrollTop = 0;
  };

  return (
    <Box
      onMouseLeave={snapToTop}
      onPointerLeave={snapToTop}
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
          alignItems: 'center',
          height: { xs: onDayHeadsClick ? 36 : 20, md: 18 },
          flexShrink: 0,
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
        ref={scrollRef}
        sx={{
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          // Fallback until measured: ~2 week rows (xs touch cells / md compact cells).
          maxHeight: viewportHeight ?? { xs: 94, md: 64 },
          height: viewportHeight ?? { xs: 94, md: 64 },
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
            data-week-row=""
            sx={{
              display: 'grid',
              gridTemplateColumns: '34px repeat(7, minmax(0, 1fr))',
              gap: 0.25,
              alignItems: 'stretch',
              height: { xs: 44, md: 28 },
              flexShrink: 0,
            }}
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
  return day.is_future ? '-' : formatDashboardCurrencyCompact(day.buying);
}

export function buyingWeekTotal(week: DepartmentDailyWeek): string {
  return formatDashboardCurrencyCompact(
    String(sumDepartmentWeek(week, (day) => parseDashboardAmount(day.buying))),
  );
}

export function processingGridValue(day: DepartmentDailyMetric): string {
  return day.is_future ? '-' : formatDashboardCurrencyCompact(day.processing);
}

export function processingWeekTotal(week: DepartmentDailyWeek): string {
  return formatDashboardCurrencyCompact(
    String(sumDepartmentWeek(week, (day) => parseDashboardAmount(day.processing))),
  );
}

export function restorationGridValue(day: DepartmentDailyMetric): string {
  return day.is_future ? '-' : String(day.restoration);
}

export function restorationWeekTotal(week: DepartmentDailyWeek): string {
  return String(sumDepartmentWeek(week, (day) => day.restoration));
}

/**
 * The day's Retail QA letter. A letter, not a count: how much got submitted is
 * not the question the card is asked, and a day where everything was done is
 * an A whether that took three routines or six.
 */
export function retailGridValue(day: DepartmentDailyMetric): string {
  if (day.is_future) return '-';
  return day.retail || '-';
}

export function retailGoalCellState(
  day: DepartmentDailyMetric,
): 'scheduled' | 'achieved' | undefined {
  if (!day.retail_scheduled || day.is_future) {
    return day.retail_scheduled ? 'scheduled' : undefined;
  }
  return day.retail_grade_met ? 'achieved' : 'scheduled';
}

export function retailWeekGoalAchieved(week: DepartmentDailyWeek): boolean {
  return Boolean(week.retail_week_goal_met);
}

/** The week's letter under the week label: the days and the cross-checks combined. */
export function retailWeekTotal(week: DepartmentDailyWeek): string {
  return week.retail_week_grade || '-';
}

export function retailCellAriaLabel(day: DepartmentDailyMetric, value: string): string {
  const dateLabel = shortDate(day.date);
  if (!day.retail) return `${dateLabel} - ${value}`;
  const score = day.retail_score != null ? `, scored ${day.retail_score}` : '';
  return `${dateLabel} - grade ${day.retail}${score}`;
}
