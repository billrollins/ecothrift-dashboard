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
        py: 0.35,
        px: 0.25,
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
        textAlign: 'center',
      }}
    >
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
    </Box>
  );
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
}: DepartmentWeekDetailDialogProps) {
  const orderedWeeks = [...weeks].reverse();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>{label} — weekly detail</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))', gap: 0.35 }}>
            <Box />
            {DAY_HEADS.map((head) => (
              <Typography
                key={head}
                variant="caption"
                color="text.secondary"
                textAlign="center"
                sx={{ fontSize: '0.65rem', fontWeight: 800 }}
              >
                {head}
              </Typography>
            ))}
          </Box>
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
                  sx={{ fontSize: '0.65rem', lineHeight: 1.15, display: 'block' }}
                >
                  {shortDate(week.week_start)}
                </Typography>
                <Typography
                  variant="caption"
                  fontWeight={900}
                  sx={{ fontSize: '0.6rem', lineHeight: 1.15, display: 'block' }}
                >
                  {getWeekAchieved?.(week) ? `★ ${getWeekTotal(week)}` : getWeekTotal(week)}
                </Typography>
              </Box>
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
      </DialogContent>
    </Dialog>
  );
}
