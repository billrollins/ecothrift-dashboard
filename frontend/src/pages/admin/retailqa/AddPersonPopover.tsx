import { Button, MenuItem, Popover, Stack, TextField } from '@mui/material';
import { useMemo, useState } from 'react';
import type { RoutineAssignee } from '../../../api/routines.api';
import { useRosterShifts } from '../../../hooks/useRetailQa';

export function AddPersonPopover({
  date,
  people,
  onAdd,
}: {
  date: string;
  people: RoutineAssignee[];
  onAdd: (input: { user: number; shift: number; time_in: string; time_out: string }) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const shifts = useRosterShifts();
  const rows = useMemo(
    () => [...(shifts.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [shifts.data],
  );
  const [user, setUser] = useState('');
  const [shift, setShift] = useState('');
  const [timeIn, setTimeIn] = useState('09:00');
  const [timeOut, setTimeOut] = useState('18:00');
  const selected = rows.find((row) => String(row.id) === shift);

  return (
    <>
      <button
        type="button"
        className="act always"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        + Add person
      </button>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack spacing={1.25} sx={{ p: 1.5, width: 260 }}>
          <TextField
            select
            size="small"
            label="Person"
            value={user}
            onChange={(event) => setUser(event.target.value)}
          >
            {people.map((person) => (
              <MenuItem key={person.id} value={String(person.id)}>{person.full_name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Shift"
            value={shift}
            onChange={(event) => {
              const next = event.target.value;
              setShift(next);
              const row = rows.find((item) => String(item.id) === next);
              if (row?.time_in) setTimeIn(row.time_in.slice(0, 5));
              if (row?.time_out) setTimeOut(row.time_out.slice(0, 5));
            }}
          >
            {rows.map((row) => (
              <MenuItem key={row.id} value={String(row.id)}>{row.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            type="time"
            label="In"
            value={timeIn}
            onChange={(event) => setTimeIn(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            type="time"
            label="Out"
            value={timeOut}
            onChange={(event) => setTimeOut(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button
            size="small"
            variant="contained"
            disabled={!user || !shift}
            onClick={() => {
              onAdd({
                user: Number(user),
                shift: Number(shift),
                time_in: timeIn || selected?.time_in?.slice(0, 5) || '09:00',
                time_out: timeOut || selected?.time_out?.slice(0, 5) || '18:00',
              });
              setAnchor(null);
              setUser('');
              setShift('');
            }}
          >
            Add for {date}
          </Button>
        </Stack>
      </Popover>
    </>
  );
}
