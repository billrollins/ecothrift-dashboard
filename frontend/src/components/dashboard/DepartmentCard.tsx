/**
 * One department card, the same on a desk and a phone (owner 2026-10-22). Front: the metric this week against its
 * goal, and this week's days. Back (the corner button): the same numbers for past weeks. Tap the Actual, a day or a
 * week total for what is behind it.
 */
import { Box, Card, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../types/pos.types';
import {
  dashboardAccentLeftSx,
  dashboardPalette,
  dashboardPhoneCardSx,
  dashboardRaisedDeptCardSx,
  failLetterColors,
  isFailLetter,
} from './dashboardCardStyles';
import { DepartmentCardGrid } from './DepartmentCardGrid';
import { FlipCard } from './FlipCard';
import { DepartmentWeekStrip } from './phone/DepartmentWeekStrip';
import { useDashboardLayout } from './useDashboardLayout';

export interface DepartmentCardProps {
  label: string;
  /** What the number is: "Purchased inventory". */
  metricLabel: string;
  accent: string;
  icon: ReactNode;
  goalDisplay: string;
  actualDisplay: string;
  actualNote?: string;
  /** Actual as a share of the goal (1 = met); null hides the bar (no goal, or a letter grade). */
  progress?: number | null;
  placeholder?: boolean;
  goalMet?: boolean;
  onGoalClick: () => void;
  onActualClick?: () => void;
  weeks: DepartmentDailyWeek[];
  currentWeek: DepartmentDailyWeek | null;
  getValue: (day: DepartmentDailyMetric) => string;
  getWeekTotal: (week: DepartmentDailyWeek) => string;
  getCellState?: (day: DepartmentDailyMetric) => 'scheduled' | 'achieved' | undefined;
  getWeekAchieved?: (week: DepartmentDailyWeek) => boolean;
  todayIso?: string;
  onCellClick?: (day: DepartmentDailyMetric) => void;
  isCellClickable?: (day: DepartmentDailyMetric) => boolean;
  cellAriaLabel?: (day: DepartmentDailyMetric, value: string) => string;
  onWeekClick?: (week: DepartmentDailyWeek) => void;
}

/** Shrink long values so the band keeps one height on every card. */
function actualFontSize(value: string, isMobile: boolean) {
  const len = value.trim().length;
  if (isMobile) return len >= 9 ? '1.2rem' : '1.45rem';
  if (len >= 9) return '1.7rem';
  if (len >= 6) return '2.1rem';
  return '2.55rem';
}

function CardFace({
  accent,
  goalMet,
  children,
}: {
  accent: string;
  goalMet: boolean;
  children: ReactNode;
}) {
  const { isMobile } = useDashboardLayout();
  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...(isMobile ? dashboardPhoneCardSx : { borderRadius: 3, ...dashboardRaisedDeptCardSx }),
        ...(goalMet
          ? {
              borderColor: 'rgba(189, 134, 24, 0.72)',
              borderLeft: `4px solid ${dashboardPalette.gold}`,
              // Opaque stops only: a see-through middle let the dark page show through and muddied the card.
              background: `linear-gradient(145deg, #fff9dc 0%, #fcf0c8 48%, ${dashboardPalette.surface} 100%)`,
            }
          : dashboardAccentLeftSx(accent)),
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 1, md: 0.75 },
          px: { xs: 1.75, md: 1.5 },
          pt: { xs: 1.5, md: 1.25 },
          pb: { xs: 1.25, md: 1 },
        }}
      >
        {children}
      </Box>
    </Card>
  );
}

function CardHeader({
  label,
  caption,
  accent,
  icon,
  goalMet,
  flipButton,
}: {
  label: string;
  caption: string;
  accent: string;
  icon: ReactNode;
  goalMet: boolean;
  flipButton: ReactNode;
}) {
  const ink = goalMet ? dashboardPalette.goldDark : accent;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0, minWidth: 0 }}>
      <Box
        sx={{
          width: { xs: 32, md: 28 },
          height: { xs: 32, md: 28 },
          flexShrink: 0,
          borderRadius: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: ink,
          bgcolor: goalMet ? dashboardPalette.goldSoft : `${accent}1A`,
          border: '1px solid',
          borderColor: goalMet ? 'rgba(189, 134, 24, 0.4)' : `${accent}40`,
          '& svg': { fontSize: { xs: 18, md: 17 } },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          component="h3"
          sx={{
            m: 0,
            fontWeight: 900,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            fontSize: { xs: '0.8rem', md: '0.74rem' },
            lineHeight: 1.1,
            color: ink,
          }}
        >
          {label}
        </Typography>
        <Typography noWrap title={caption} sx={{ fontSize: { xs: '0.75rem', md: '0.72rem' }, fontWeight: 700, color: 'text.secondary', lineHeight: 1.25 }}>
          {caption}
        </Typography>
      </Box>
      {goalMet ? (
        <Box
          sx={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.35,
            px: 0.8,
            py: 0.25,
            borderRadius: 99,
            bgcolor: dashboardPalette.goldBright,
            color: dashboardPalette.goldDark,
            fontSize: '0.6rem',
            fontWeight: 900,
            letterSpacing: 0.4,
            lineHeight: 1,
          }}
        >
          <Box component="span" aria-hidden>
            🏆
          </Box>
          GOAL HIT
        </Box>
      ) : null}
      {flipButton}
    </Box>
  );
}

/** How far this week's Actual is toward the goal. */
function GoalBar({ progress, goalMet, accent }: { progress: number; goalMet: boolean; accent: string }) {
  const pct = Math.max(0, Math.round(progress * 100));
  return (
    <Box sx={{ flexShrink: 0 }}>
      <Box
        role="meter"
        aria-label="Share of the week's goal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(pct, 100)}
        aria-valuetext={`${pct}% of goal`}
        sx={{ height: 6, borderRadius: 99, bgcolor: 'rgba(189, 134, 24, 0.16)', overflow: 'hidden' }}
      >
        <Box sx={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 99, bgcolor: goalMet || pct >= 100 ? dashboardPalette.gold : accent }} />
      </Box>
      <Typography sx={{ mt: 0.35, fontSize: { xs: '0.72rem', md: '0.66rem' }, fontWeight: 800, color: 'text.secondary', lineHeight: 1 }}>
        {pct}% of goal
      </Typography>
    </Box>
  );
}

export function DepartmentCard(props: DepartmentCardProps) {
  const { isMobile } = useDashboardLayout();
  const {
    label,
    metricLabel,
    accent,
    icon,
    goalDisplay,
    actualDisplay,
    actualNote,
    progress = null,
    placeholder = false,
    goalMet = false,
    onGoalClick,
    onActualClick,
    weeks,
    currentWeek,
    getValue,
    getWeekTotal,
    getCellState,
    getWeekAchieved,
    todayIso,
    onCellClick,
    isCellClickable,
    cellAriaLabel,
    onWeekClick,
  } = props;

  const actualInk = placeholder
    ? 'text.secondary'
    : isFailLetter(actualDisplay)
      ? failLetterColors.text
      : goalMet
        ? dashboardPalette.goldDark
        : accent;

  const front = (flipButton: ReactNode) => (
    <CardFace accent={accent} goalMet={goalMet}>
      <CardHeader
        label={label}
        caption={`${metricLabel} · this week`}
        accent={accent}
        icon={icon}
        goalMet={goalMet}
        flipButton={flipButton}
      />
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 1.5, flexShrink: 0 }}>
        <Box
          component="button"
          type="button"
          onClick={onGoalClick}
          aria-label={`${label} goal ${goalDisplay}`}
          sx={{
            p: 0,
            minHeight: { xs: 44, md: 'auto' },
            minWidth: 0,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            font: 'inherit',
            color: 'inherit',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            '&:focus-visible': { outline: '2px solid', outlineColor: dashboardPalette.blue, outlineOffset: 2 },
          }}
        >
          <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.6rem' }, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', color: dashboardPalette.gold, lineHeight: 1 }}>
            Goal
          </Typography>
          <Typography
            noWrap
            title={goalDisplay}
            sx={{
              mt: 0.4,
              fontSize: { xs: '1.2rem', md: '1.4rem' },
              fontWeight: 900,
              color: dashboardPalette.gold,
              lineHeight: 1,
              textDecoration: 'underline',
              textDecorationColor: 'rgba(189, 134, 24, 0.35)',
              textUnderlineOffset: 4,
            }}
          >
            {goalDisplay}
          </Typography>
        </Box>
        <Box
          component={onActualClick ? 'button' : 'div'}
          type={onActualClick ? 'button' : undefined}
          onClick={onActualClick}
          aria-label={onActualClick ? `Actual ${actualDisplay}: ${label} details this week` : undefined}
          sx={{
            minWidth: 0,
            p: 0,
            border: 'none',
            background: 'none',
            cursor: onActualClick ? 'pointer' : 'default',
            font: 'inherit',
            color: 'inherit',
            textAlign: 'right',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            '&:focus-visible': { outline: '2px solid', outlineColor: dashboardPalette.blue, outlineOffset: 2 },
          }}
        >
          <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.6rem' }, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1 }}>
            Actual
          </Typography>
          <Typography
            noWrap
            title={actualDisplay}
            sx={{
              mt: 0.4,
              fontSize: actualFontSize(actualDisplay, isMobile),
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: '-0.02em',
              textDecoration: onActualClick ? 'underline' : 'none',
              textDecorationColor: 'rgba(91, 111, 95, 0.35)',
              textUnderlineOffset: 4,
              color: actualInk,
            }}
          >
            {actualDisplay}
          </Typography>
        </Box>
      </Box>
      <Typography
        noWrap
        title={actualNote || ''}
        sx={{ minHeight: 16, fontSize: { xs: '0.75rem', md: '0.68rem' }, fontWeight: 700, lineHeight: 1.25, color: 'text.secondary', flexShrink: 0 }}
      >
        {actualNote || ' '}
      </Typography>
      {progress != null ? <GoalBar progress={progress} goalMet={goalMet} accent={accent} /> : null}
      <Box sx={{ mt: 'auto', flexShrink: 0 }}>
        <DepartmentWeekStrip
          week={currentWeek}
          getValue={getValue}
          getCellState={getCellState}
          todayIso={todayIso}
          onCellClick={onCellClick}
          isCellClickable={isCellClickable}
          cellAriaLabel={cellAriaLabel}
        />
      </Box>
    </CardFace>
  );

  const back = (flipButton: ReactNode) => (
    <CardFace accent={accent} goalMet={false}>
      <CardHeader
        label={label}
        caption={`${metricLabel} · past ${weeks.length} weeks`}
        accent={accent}
        icon={icon}
        goalMet={false}
        flipButton={flipButton}
      />
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          // A phone card is as tall as its front; the weeks scroll inside.
          maxHeight: { xs: 180, md: 'none' },
        }}
      >
        <DepartmentCardGrid
          fill
          weeks={weeks}
          getValue={getValue}
          getWeekTotal={getWeekTotal}
          getCellState={getCellState}
          getWeekAchieved={getWeekAchieved}
          todayIso={todayIso}
          onCellClick={onCellClick}
          isCellClickable={isCellClickable}
          cellAriaLabel={cellAriaLabel}
          onWeekClick={onWeekClick}
        />
      </Box>
    </CardFace>
  );

  return <FlipCard name={label} front={front} back={back} sx={{ height: '100%', width: '100%' }} />;
}
