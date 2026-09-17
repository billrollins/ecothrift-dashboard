import { Box, Dialog, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Tooltip, Typography } from '@mui/material';
import { addDays, format, parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import type { RoutineRun } from '../../../api/routines.api';
import { dutyColors } from '../../../components/duty/tokens';
import { useQaRoutines } from '../../../hooks/useRetailQa';
import { weekMonday } from '../routines/gradeWeek';
import { qaStatusWord } from './qaStatus';

export function WeekRoutinesModal({
  open,
  onClose,
  week,
}: {
  open: boolean;
  onClose: () => void;
  week: string;
}) {
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [person, setPerson] = useState('');
  const query = useQaRoutines({ week, type: kind || undefined, status: status || undefined });
  const monday = weekMonday(week);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const rows = (query.data?.routines ?? []).filter((row) => {
    if (!person) return true;
    return String(row.assigned_to) === person || String(row.completed_by) === person;
  });
  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of query.data?.routines ?? []) {
      if (row.assigned_to && row.assigned_to_name) map.set(String(row.assigned_to), row.assigned_to_name);
      if (row.completed_by && row.completed_by_name) map.set(String(row.completed_by), row.completed_by_name);
    }
    return [...map.entries()];
  }, [query.data]);
  const grouped = useMemo(() => {
    const map = new Map<string, RoutineRun[]>();
    for (const row of rows) {
      const key = `${row.system_key || row.kind}:${row.title}:${row.section_name || ''}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Routines this week</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Type</InputLabel>
            <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="checklist">Checklist</MenuItem>
              <MenuItem value="section_tally">Tally</MenuItem>
              <MenuItem value="section_audit">Cross-check</MenuItem>
              <MenuItem value="owner_spot">Owner spot</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="open">Open</MenuItem>
              <MenuItem value="done">Done</MenuItem>
              <MenuItem value="missed">Missed</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Person</InputLabel>
            <Select label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
              <MenuItem value="">All</MenuItem>
              {people.map(([id, name]) => (
                <MenuItem key={id} value={id}>{name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1.4fr) repeat(7, minmax(0, 1fr))', gap: 0.5 }}>
          <Box />
          {days.map((day) => (
            <Typography key={day.toISOString()} sx={{ fontSize: 11, fontWeight: 700, color: dutyColors.ink40, textAlign: 'center' }}>
              {format(day, 'EEE d')}
            </Typography>
          ))}
          {grouped.map(([key, runs]) => (
            <RoutineWeekRow key={key} title={runs[0].title} section={runs[0].section_name} runs={runs} days={days} />
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function RoutineWeekRow({
  title,
  section,
  runs,
  days,
}: {
  title: string;
  section?: string | null;
  runs: RoutineRun[];
  days: Date[];
}) {
  return (
    <>
      <Typography sx={{ fontSize: 12.5, fontWeight: 650, py: 0.4 }}>
        {title}{section ? ` · ${section}` : ''}
      </Typography>
      {days.map((day) => {
        const key = format(day, 'yyyy-MM-dd');
        const run = runs.find((row) => row.period_key === key);
        const status = run ? qaStatusWord(run.status) : '';
        const color = status === 'Done'
          ? dutyColors.brand
          : status === 'Missed' ? dutyColors.red
            : status === 'Overdue' || run?.is_overdue ? dutyColors.amberBg
              : status ? dutyColors.ink40 : dutyColors.ink08;
        const tip = run
          ? `${status || qaStatusWord(run.status)}${run.completed_at ? ` ${format(parseISO(run.completed_at), 'HH:mm')}` : ''}${run.completed_by_name ? ` by ${run.completed_by_name}` : ''}`
          : 'No run';
        return (
          <Tooltip key={key} title={tip}>
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 0.6 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
            </Box>
          </Tooltip>
        );
      })}
    </>
  );
}
