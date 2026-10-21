/** My week (owner 2026-10-21): my shifts this week and next, from the schedule managers build. */
import { Box, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { getMyWeek, type ScheduledShift } from '../../api/schedule.api';

export function groupByWeek(start: string, shifts: ScheduledShift[]): Array<{ label: string; shifts: ScheduledShift[] }> {
  const first = parseISO(start);
  const nextStart = format(new Date(first.getFullYear(), first.getMonth(), first.getDate() + 7), 'yyyy-MM-dd');
  return [
    { label: 'This week', shifts: shifts.filter((s) => s.date < nextStart) },
    { label: 'Next week', shifts: shifts.filter((s) => s.date >= nextStart) },
  ];
}

export function MyWeek() {
  const query = useQuery({ queryKey: ['schedule', 'my-week'], queryFn: async () => (await getMyWeek()).data, staleTime: 60_000 });
  if (query.isLoading) return <Typography variant="body2" color="text.secondary">Loading…</Typography>;
  if (query.isError || !query.data) return <Typography variant="body2" color="text.secondary">Could not load your week.</Typography>;
  const weeks = groupByWeek(query.data.start, query.data.shifts);
  const flexible = query.data.shifts.some((s) => s.flexible);
  return (
    <Box data-testid="my-week">
      {weeks.map((week) => (
        <Box key={week.label} sx={{ mb: 1 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>{week.label.toUpperCase()}</Typography>
          {week.shifts.length ? week.shifts.map((s) => (
            <Box key={s.id} sx={{ display: 'flex', gap: 1, py: 0.25, flexWrap: 'wrap' }}>
              <Typography variant="body2" fontWeight={700} sx={{ minWidth: 92 }}>{format(parseISO(s.date), 'EEE MMM d')}</Typography>
              <Typography variant="body2" sx={{ flex: 1 }}>
                {s.flexible ? 'About ' : ''}{s.text}{s.department_name ? ` · ${s.department_name}` : ''}{s.note ? ` · ${s.note}` : ''}
              </Typography>
            </Box>
          )) : (
            <Typography variant="body2" color="text.secondary">Nothing scheduled yet.</Typography>
          )}
        </Box>
      ))}
      {flexible ? (
        <Typography variant="caption" color="text.secondary">
          &quot;About&quot; times flex: you may leave early on a slow day or stay later on a busy one, as your manager says.
        </Typography>
      ) : null}
    </Box>
  );
}
