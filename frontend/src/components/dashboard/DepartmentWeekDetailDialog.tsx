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
  todayIso?: string;
}

function GridCell({ value, isToday }: { value: string; isToday?: boolean }) {
  return (
    <Box
      sx={{
        minWidth: 0,
        py: 0.35,
        px: 0.25,
        border: '1px solid',
        borderColor: isToday ? dashboardPalette.green : 'rgba(91, 111, 95, 0.32)',
        borderRadius: 1,
        bgcolor: isToday ? dashboardPalette.greenSoft : 'transparent',
        textAlign: 'center',
      }}
    >
      <Typography variant="caption" fontWeight={isToday ? 900 : 700} sx={{ fontSize: '0.75rem', lineHeight: 1.2 }}>
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
  todayIso,
}: DepartmentWeekDetailDialogProps) {
  const orderedWeeks = [...weeks].reverse();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>{label} — weekly detail</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '44px repeat(7, minmax(0, 1fr))', gap: 0.35 }}>
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
              sx={{ display: 'grid', gridTemplateColumns: '44px repeat(7, minmax(0, 1fr))', gap: 0.35 }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={700}
                sx={{ fontSize: '0.65rem', alignSelf: 'center', textAlign: 'center' }}
              >
                {shortDate(week.week_start)}
              </Typography>
              {week.days.map((day) => (
                <GridCell
                  key={day.date}
                  value={getValue(day)}
                  isToday={!!todayIso && day.date === todayIso}
                />
              ))}
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
