import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import type { DepartmentDailyMetric, DepartmentDailyWeek } from '../../types/pos.types';
import { dashboardPalette } from './dashboardCardStyles';
import { shortDate } from './dashboardFormatters';

const DAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface DepartmentWeekDetailDialogProps {
  open: boolean;
  onClose: () => void;
  label: string;
  weeks: DepartmentDailyWeek[];
  getValue: (day: DepartmentDailyMetric) => string;
  getWeekTotal: (week: DepartmentDailyWeek) => string;
  getCellState?: (day: DepartmentDailyMetric) => 'scheduled' | 'achieved' | undefined;
  getWeekAchieved?: (week: DepartmentDailyWeek) => boolean;
  todayIso?: string;
  onCellClick?: (day: DepartmentDailyMetric, event: React.MouseEvent<HTMLElement>) => void;
  isCellClickable?: (day: DepartmentDailyMetric) => boolean;
  cellAriaLabel?: (day: DepartmentDailyMetric, value: string) => string;
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
    py: 0.55,
    px: 0.25,
    minHeight: 44,
    border: '1px solid',
    borderColor: achieved
      ? dashboardPalette.gold
      : scheduled
        ? 'rgba(189, 134, 24, 0.55)'
        : isToday
          ? dashboardPalette.green
          : 'rgba(91, 111, 95, 0.32)',
    borderStyle: scheduled && !achieved ? 'dashed' : 'solid',
    borderRadius: 1,
    bgcolor: achieved
      ? dashboardPalette.goldSoft
      : isToday
        ? dashboardPalette.greenSoft
        : 'transparent',
    textAlign: 'center' as const,
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
          border: '1px solid',
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
      fontWeight={isToday || achieved ? 900 : 700}
      sx={{
        fontSize: '0.75rem',
        lineHeight: 1.2,
        color: achieved ? dashboardPalette.goldDark : 'inherit',
      }}
    >
      {value}
    </Typography>
  );

  if (clickable && onClick) {
    return (
      <Box component="button" type="button" onClick={onClick} aria-label={ariaLabel} sx={cellSx}>
        {content}
      </Box>
    );
  }
  return <Box sx={cellSx}>{content}</Box>;
}

export function DepartmentWeekDetailDialog({
  open,
  onClose,
  label,
  weeks,
  getValue,
  getWeekTotal,
  getCellState,
  getWeekAchieved,
  todayIso,
  onCellClick,
  isCellClickable,
  cellAriaLabel,
}: DepartmentWeekDetailDialogProps) {
  const orderedWeeks = [...weeks].reverse();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={false}>
      <DialogTitle sx={{ pb: 1 }}>{label} - weekly detail</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minHeight: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))', gap: 0.35 }}>
            <Box />
            {DAY_HEADS.map((head) => (
              <Typography
                key={head}
                variant="caption"
                color="text.secondary"
                textAlign="center"
                sx={{ fontSize: '0.7rem', fontWeight: 800 }}
              >
                {head}
              </Typography>
            ))}
          </Box>
          <Box
            sx={{
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              maxHeight: { xs: '60dvh', sm: 360 },
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              pr: 0.25,
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
                sx={{ display: 'grid', gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))', gap: 0.35 }}
              >
                <Box
                  sx={{
                    alignSelf: 'center',
                    textAlign: 'center',
                    borderRadius: 1,
                    py: getWeekAchieved?.(week) ? 0.35 : 0,
                    bgcolor: getWeekAchieved?.(week) ? dashboardPalette.goldSoft : 'transparent',
                  }}
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    fontWeight={700}
                    sx={{ fontSize: '0.7rem', lineHeight: 1.15, display: 'block' }}
                  >
                    {shortDate(week.week_start)}
                  </Typography>
                  <Typography
                    variant="caption"
                    fontWeight={900}
                    sx={{ fontSize: '0.65rem', lineHeight: 1.15, display: 'block' }}
                  >
                    {getWeekAchieved?.(week) ? `★ ${getWeekTotal(week)}` : getWeekTotal(week)}
                  </Typography>
                </Box>
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
      </DialogContent>
    </Dialog>
  );
}
