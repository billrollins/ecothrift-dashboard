/** A time entry's change trail (owner 2026-10-21): who changed it, when, and what it was before. */
import { Box, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { getTimeEntryHistory, type TimeEntryChangeRow } from '../../api/hr.api';

const LABELS: Record<string, string> = {
  clock_in: 'In',
  clock_out: 'Out',
  break_minutes: 'Break',
  status: 'Status',
  total_hours: 'Hours',
  shift: 'Shift',
  notes: 'Note',
  date: 'Day',
};

function shown(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if ((field === 'clock_in' || field === 'clock_out') && typeof value === 'string') {
    return format(parseISO(value), 'MMM d, h:mm a');
  }
  if (field === 'break_minutes') return `${value} min`;
  return String(value);
}

/** "Out 5:00 PM to 6:30 PM, Hours 8.00 to 9.50": only what changed. */
export function changeText(row: TimeEntryChangeRow): string {
  if (!row.before || Object.keys(row.before).length === 0) return '';
  return Object.keys(LABELS)
    .filter((field) => JSON.stringify(row.before[field]) !== JSON.stringify(row.after[field]))
    .map((field) => `${LABELS[field]} ${shown(field, row.before[field])} to ${shown(field, row.after[field])}`)
    .join(', ');
}

export function TimeEntryHistory({ entryId }: { entryId: number }) {
  const query = useQuery({
    queryKey: ['timeEntryHistory', entryId],
    queryFn: async () => (await getTimeEntryHistory(entryId)).data,
  });
  const rows = query.data ?? [];
  return (
    <Box data-testid="time-entry-history">
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>Changes</Typography>
      {rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {query.isLoading ? 'Loading…' : 'No changes since the punch.'}
        </Typography>
      ) : rows.map((row, i) => (
        <Box key={`${row.at}-${i}`} sx={{ py: 0.5, borderTop: i ? 1 : 0, borderColor: 'divider' }}>
          <Typography variant="body2">
            <b>{row.label}</b>
            {row.by ? ` by ${row.by}` : ''} · {format(parseISO(row.at), 'MMM d, h:mm a')}
          </Typography>
          {changeText(row) ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{changeText(row)}</Typography>
          ) : null}
          {row.note ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{row.note}</Typography>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
