import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useDeliveryDayMutations } from '../../../../hooks/useDelivery';
import { useUsers } from '../../../../hooks/useEmployees';
import type { DeliveryDayDetail } from '../../../../types/pos.types';
import { ecoFieldPrimaryButtonSx } from '../../../../theme/deliveryTheme';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Omit to create a new day. */
  day?: DeliveryDayDetail | null;
  onSaved?: (dayId: number) => void;
};

type FormState = {
  date: string;
  time_start: string;
  time_end: string;
  crew_size: string;
  assigned_to: string;
  primary_driver: string;
  notes: string;
  planning_disposition: 'planned' | 'cancelled' | 'not_run';
};

function todayYmd(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function formFromDay(day?: DeliveryDayDetail | null): FormState {
  return {
    date: day?.date ?? todayYmd(),
    time_start: (day?.time_start ?? '09:00:00').slice(0, 5),
    time_end: (day?.time_end ?? '15:00:00').slice(0, 5),
    crew_size: String(day?.crew_size ?? 2),
    assigned_to: day?.assigned_to ?? '',
    primary_driver: day?.primary_driver_id != null ? String(day.primary_driver_id) : '',
    notes: day?.notes ?? '',
    planning_disposition: day?.planning_disposition ?? 'planned',
  };
}

/** Manager create/edit for a delivery day — the container Desk deliveries live on. */
export function DeskDayDialog({ open, onClose, day, onSaved }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const { create, update } = useDeliveryDayMutations();
  const { data: users } = useUsers({ is_active: true });
  const [form, setForm] = useState<FormState>(() => formFromDay(day));
  const [reason, setReason] = useState('');
  const isEdit = Boolean(day);

  useEffect(() => {
    if (open) {
      setForm(formFromDay(day));
      setReason('');
    }
  }, [open, day]);

  const drivers = useMemo(() => users?.results ?? [], [users]);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const invalidWindow = form.time_end <= form.time_start;
  const busy = create.isPending || update.isPending;
  const canSave = Boolean(form.date) && !invalidWindow && !busy;

  const submit = async () => {
    const payload: Record<string, unknown> = {
      date: form.date,
      time_start: `${form.time_start}:00`,
      time_end: `${form.time_end}:00`,
      crew_size: Number(form.crew_size) || 2,
      assigned_to: form.assigned_to,
      notes: form.notes,
      primary_driver: form.primary_driver ? Number(form.primary_driver) : null,
    };
    if (isEdit) {
      payload.planning_disposition = form.planning_disposition;
      if (reason) payload.reason = reason;
    }
    try {
      const saved = isEdit
        ? await update.mutateAsync({ id: day!.id, data: payload })
        : await create.mutateAsync(payload);
      enqueueSnackbar(isEdit ? 'Day updated' : 'Delivery day created', { variant: 'success' });
      onSaved?.((saved as DeliveryDayDetail).id ?? day?.id ?? 0);
      onClose();
    } catch {
      enqueueSnackbar(isEdit ? 'Could not update day' : 'Could not create day', {
        variant: 'error',
      });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? `Edit day ${day?.date}` : 'New delivery day'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            InputLabelProps={{ shrink: true }}
            disabled={isEdit}
            helperText={isEdit ? 'Move deliveries instead of changing a day’s date.' : undefined}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              label="Start"
              type="time"
              value={form.time_start}
              onChange={(e) => set('time_start', e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="End"
              type="time"
              value={form.time_end}
              onChange={(e) => set('time_end', e.target.value)}
              InputLabelProps={{ shrink: true }}
              error={invalidWindow}
              helperText={invalidWindow ? 'End must be after start.' : undefined}
              fullWidth
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField
              label="Crew size"
              type="number"
              value={form.crew_size}
              onChange={(e) => set('crew_size', e.target.value)}
              inputProps={{ min: 1, max: 6 }}
              sx={{ width: 140 }}
            />
            <TextField
              select
              label="Primary driver"
              value={form.primary_driver}
              onChange={(e) => set('primary_driver', e.target.value)}
              fullWidth
            >
              <MenuItem value="">Unassigned</MenuItem>
              {drivers.map((user) => (
                <MenuItem key={user.id} value={String(user.id)}>
                  {user.full_name || user.email}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            label="Crew label"
            value={form.assigned_to}
            onChange={(e) => set('assigned_to', e.target.value)}
            placeholder="e.g. Truck 1 — Mike & Dan"
          />
          <TextField
            label="Notes"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            multiline
            minRows={2}
          />
          {isEdit && (
            <>
              <TextField
                select
                label="Planning state"
                value={form.planning_disposition}
                onChange={(e) =>
                  set('planning_disposition', e.target.value as FormState['planning_disposition'])
                }
              >
                <MenuItem value="planned">Planned</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
                <MenuItem value="not_run">Not run</MenuItem>
              </TextField>
              <TextField
                label="Reason (audit)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this changing?"
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void submit()}
          disabled={!canSave}
          sx={ecoFieldPrimaryButtonSx('desktop')}
        >
          {isEdit ? 'Save day' : 'Create day'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
