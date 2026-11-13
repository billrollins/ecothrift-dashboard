/**
 * The staff window's Schedule and time tab (#136): this week's shifts and clocked hours, and the last two weeks of
 * punches. Read only; the Schedule and Time & payroll pages are where they change.
 */
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO, startOfWeek, subDays } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getScheduleWeek } from '../../api/schedule.api';
import { getTimeEntries } from '../../api/hr.api';
import { Section, Stat } from '../objects/windowParts';
import { useOptionalObjectModal } from '../objects/ObjectModal';

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

function hoursText(h: number | string | null | undefined): string {
  const n = Number(h ?? 0);
  return `${Number.isFinite(n) ? n.toFixed(1).replace(/\.0$/, '') : '0'} h`;
}

function clock(at: string | null): string {
  return at ? format(parseISO(at), 'h:mm a') : '';
}

export function StaffScheduleTime({ userId }: { userId: number }) {
  const navigate = useNavigate();
  const modal = useOptionalObjectModal();
  const monday = iso(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const week = useQuery({
    queryKey: ['schedule-week', monday],
    queryFn: async () => (await getScheduleWeek(monday)).data,
    staleTime: 60_000,
  });
  const from = iso(subDays(new Date(), 13));
  const entries = useQuery({
    queryKey: ['staff-window', 'time', userId, from],
    queryFn: async () => (await getTimeEntries({ employee: userId, date_from: from, page_size: 30, ordering: '-clock_in' })).data,
  });

  const go = (path: string) => {
    modal?.closeObject();
    navigate(path);
  };

  const me = week.data?.people.find((p) => p.id === userId);
  const shifts = (week.data?.shifts ?? []).filter((s) => s.employee === userId);
  const callIns = (week.data?.call_ins ?? []).filter((c) => c.employee === userId);
  const rows = entries.data?.results ?? [];

  return (
    <Stack spacing={2}>
      <Section
        title={`This week (from ${format(parseISO(monday), 'MMM d')})`}
        action={<Button size="small" onClick={() => go('/people/schedule')}>Open schedule</Button>}
      >
        {week.isLoading ? (
          <CircularProgress size={22} />
        ) : (
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap>
              <Stat label="Scheduled" value={hoursText(me?.hours ?? 0)} />
              <Stat label="Clocked" value={me?.actual_hours == null ? '-' : hoursText(me.actual_hours)} />
              <Stat label="Call-ins (90 days)" value={me?.call_ins ? me.call_ins.d90 : '-'} muted />
            </Stack>
            {shifts.length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No shifts this week.</Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 14 }}>
                {shifts.map((s) => (
                  <li key={s.id}>
                    {format(parseISO(s.date), 'EEE MMM d')}: {s.text}
                    {s.department_name ? ` · ${s.department_name}` : ''}
                    {s.note ? ` · ${s.note}` : ''}
                  </li>
                ))}
              </Box>
            )}
            {callIns.length ? (
              <Typography sx={{ fontSize: 13, color: 'warning.main' }}>
                {callIns.map((c) => `${c.kind_label} ${format(parseISO(c.shift_date), 'EEE')}`).join(' · ')}
              </Typography>
            ) : null}
          </Stack>
        )}
      </Section>

      <Section
        title="Punches, last two weeks"
        action={<Button size="small" onClick={() => go('/admin/time-payroll')}>Time & payroll</Button>}
      >
        {entries.isLoading ? (
          <CircularProgress size={22} />
        ) : rows.length === 0 ? (
          <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>No punches in the last two weeks.</Typography>
        ) : (
          // Its own scroll, so two busy weeks never stretch the window.
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />} sx={{ maxHeight: 220, overflowY: 'auto' }}>
            {rows.map((e) => (
              <Stack key={e.id} direction="row" spacing={1.5} sx={{ py: 0.6, fontSize: 14 }} alignItems="baseline">
                <Typography sx={{ fontSize: 14, width: 92, flexShrink: 0 }}>{format(parseISO(e.date), 'EEE MMM d')}</Typography>
                <Typography sx={{ fontSize: 14, flex: 1, minWidth: 0 }} noWrap>
                  {clock(e.clock_in)} - {e.clock_out ? clock(e.clock_out) : 'on the clock'}
                  {e.shift_label ? ` · ${e.shift_label}` : ''}
                </Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {e.total_hours != null ? hoursText(e.total_hours) : ''}
                </Typography>
                <Typography
                  sx={{ fontSize: 12, width: 64, textAlign: 'right', flexShrink: 0, color: e.status === 'flagged' ? 'error.main' : 'text.secondary' }}
                >
                  {e.status === 'approved' ? 'Approved' : e.status === 'flagged' ? 'Flagged' : 'Pending'}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </Section>
    </Stack>
  );
}
