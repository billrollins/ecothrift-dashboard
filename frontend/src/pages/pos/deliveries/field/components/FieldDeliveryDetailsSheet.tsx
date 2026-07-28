import { useEffect, useState } from 'react';
import {
  Button,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import type { DeliveryDayDetail, DeliveryRunStop } from '../../../../../types/pos.types';
import {
  appendDeliveryJobAddress,
  rescheduleDeliveryJob,
  updateDelivery,
  updateDeliveryStopNotes,
} from '../../../../../api/pos.api';
import { useDeliveryDays } from '../../../../../hooks/useDelivery';
import { formatPhone, maskPhoneInput } from '../../../../../utils/formatPhone';
import { FieldSheet } from './FieldSheet';
import { stopDisplayName } from '../fieldStepUtils';
import { ecoFieldPrimaryButtonSx } from '../ecoFieldTheme';

type Props = {
  open: boolean;
  onClose: () => void;
  day: DeliveryDayDetail;
  stop: DeliveryRunStop | null;
  canManage?: boolean;
  focusReschedule?: boolean;
  onMutated?: () => void;
};

const fieldSx = {
  '& .MuiInputBase-root': { minHeight: 44 },
  '& .MuiInputLabel-root': { lineHeight: 1.2 },
} as const;

export function FieldDeliveryDetailsSheet({
  open,
  onClose,
  day,
  stop,
  canManage,
  onMutated,
}: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const [notes, setNotes] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [availId, setAvailId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const { data: futureDays } = useDeliveryDays({
    bucket: 'future',
    page_size: 20,
    ...(import.meta.env.DEV ? { include_test: '1' as const } : {}),
  });

  useEffect(() => {
    if (!stop) return;
    setNotes(stop.notes || '');
    setName(stopDisplayName(stop));
    setPhone(maskPhoneInput(stop.phone || ''));
    setAddress(stop.address || '');
    setUnit(stop.unit || '');
    setAvailId('');
  }, [stop]);

  if (!stop) return null;

  const save = async () => {
    setBusy(true);
    try {
      await updateDeliveryStopNotes(stop.id, notes.trim());
      if (canManage) {
        const formattedPhone = formatPhone(phone) || phone.trim();
        await updateDelivery(stop.job_id, {
          customer_name: name.trim(),
          phone: formattedPhone,
        });
      }
      if (address.trim() && address.trim() !== stop.address) {
        await appendDeliveryJobAddress(stop.job_id, {
          address: address.trim(),
          is_apt: stop.is_apt || Boolean(unit.trim()),
          unit: unit.trim(),
          reason: 'Field correction',
        });
      }
      if (availId !== '' && Number(availId) !== day.id) {
        await rescheduleDeliveryJob(stop.job_id, {
          availability_id: Number(availId),
          notes: notes.trim(),
        });
      }
      enqueueSnackbar('Delivery updated', { variant: 'success' });
      onMutated?.();
      onClose();
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? String(
              (err as { response?: { data?: { detail?: string } } }).response?.data?.detail ||
                'Save failed',
            )
          : 'Save failed';
      enqueueSnackbar(detail, { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FieldSheet open={open} onClose={onClose} compact>
      <Stack spacing={1}>
        <TextField
          label="Customer name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canManage || busy}
          fullWidth
          size="small"
          sx={fieldSx}
        />
        <TextField
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(maskPhoneInput(e.target.value))}
          disabled={!canManage || busy}
          fullWidth
          size="small"
          inputProps={{ inputMode: 'tel', autoComplete: 'tel' }}
          sx={fieldSx}
        />
        <TextField
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={busy}
          fullWidth
          size="small"
          sx={fieldSx}
        />
        <TextField
          label="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          disabled={busy}
          fullWidth
          size="small"
          sx={fieldSx}
        />
        <TextField
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={busy}
          fullWidth
          size="small"
          multiline
          minRows={1}
          maxRows={3}
          sx={fieldSx}
        />
        <TextField
          select
          label="Reschedule to"
          value={availId}
          onChange={(e) => setAvailId(e.target.value === '' ? '' : Number(e.target.value))}
          disabled={busy}
          fullWidth
          size="small"
          sx={fieldSx}
        >
          <MenuItem value="">Keep current day</MenuItem>
          {(futureDays?.results ?? []).map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.date} · {d.delivery_count} stops
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          disabled={busy}
          onClick={() => void save()}
          sx={{ ...ecoFieldPrimaryButtonSx, minHeight: 50 }}
        >
          Save changes
        </Button>
      </Stack>
    </FieldSheet>
  );
}
