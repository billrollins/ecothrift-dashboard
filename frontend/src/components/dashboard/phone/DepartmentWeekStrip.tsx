import { Box, Typography } from '@mui/material';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../../types/pos.types';
import { dashboardPalette, failLetterColors, isFailLetter } from '../dashboardCardStyles';

const DAY_HEADS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function DepartmentWeekStrip({
  week,
  getValue,
  getCellState,
  todayIso,
  onCellClick,
  isCellClickable,
  cellAriaLabel,
}: {
  week: DepartmentDailyWeek | null;
  getValue: (day: DepartmentDailyMetric) => string;
  getCellState?: (day: DepartmentDailyMetric) => 'scheduled' | 'achieved' | undefined;
  todayIso?: string;
  onCellClick?: (day: DepartmentDailyMetric) => void;
  isCellClickable?: (day: DepartmentDailyMetric) => boolean;
  cellAriaLabel?: (day: DepartmentDailyMetric, value: string) => string;
}) {
  const days = week?.days ?? [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, px: 0.75, pt: 0.5, pb: 0.75 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 0.4,
        }}
      >
        {DAY_HEADS.map((head, idx) => (
          <Typography
            key={`${head}-${idx}`}
            sx={{
              fontSize: '0.75rem',
              fontWeight: 800,
              color: 'text.secondary',
              textAlign: 'center',
              lineHeight: 1.2,
            }}
          >
            {head}
          </Typography>
        ))}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 0.4,
        }}
      >
        {Array.from({ length: 7 }, (_, idx) => {
          const day = days[idx];
          if (!day) {
            return <Box key={`empty-${idx}`} sx={cellBoxSx} />;
          }
          const value = getValue(day);
          const goalState = getCellState?.(day);
          const achieved = goalState === 'achieved';
          const scheduled = goalState === 'scheduled';
          const isToday = Boolean(todayIso && day.date === todayIso);
          const clickable = Boolean(isCellClickable?.(day) && onCellClick);
          const muted = value === 'Closed' || value === '\u2014';
          const fail = isFailLetter(value);
          const showAchieved = achieved && !fail;
          const showScheduled = scheduled && !fail;
          return (
            <Box
              key={day.date}
              component={clickable ? 'button' : 'div'}
              type={clickable ? 'button' : undefined}
              aria-label={cellAriaLabel?.(day, value)}
              onClick={clickable ? () => onCellClick?.(day) : undefined}
              sx={{
                ...cellBoxSx,
                borderColor: fail
                  ? failLetterColors.border
                  : showAchieved
                    ? dashboardPalette.gold
                    : showScheduled
                      ? 'rgba(189, 134, 24, 0.55)'
                      : isToday
                        ? dashboardPalette.green
                        : 'rgba(91, 111, 95, 0.32)',
                borderStyle: showScheduled && !showAchieved ? 'dashed' : 'solid',
                background: fail
                  ? failLetterColors.bg
                  : showAchieved
                    ? `linear-gradient(145deg, #fff7cf, ${dashboardPalette.goldSoft} 55%, #fffdf7)`
                    : isToday
                      ? dashboardPalette.greenSoft
                      : 'transparent',
                cursor: clickable ? 'pointer' : 'default',
                font: 'inherit',
                color: 'inherit',
              }}
            >
              <Typography
                noWrap
                title={value === '\u2014' ? 'No activity' : value}
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: isToday || showAchieved ? 900 : 800,
                  lineHeight: 1.15,
                  color: fail
                    ? failLetterColors.text
                    : showAchieved
                      ? dashboardPalette.goldDark
                      : isToday
                        ? dashboardPalette.greenDark
                        : muted
                          ? 'text.secondary'
                          : 'inherit',
                }}
              >
                {value}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

const cellBoxSx = {
  minHeight: 48,
  height: 48,
  minWidth: 0,
  border: '1px solid',
  borderColor: 'rgba(91, 111, 95, 0.32)',
  borderRadius: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  px: 0.15,
} as const;
