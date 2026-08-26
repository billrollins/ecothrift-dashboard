import { useEffect, useState } from 'react';
import { Box, Button, FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import Save from '@mui/icons-material/Save';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { updateSetting } from '../../../api/core.api';
import { formatHoursLabel, parseStoreHours, setDayOpen, WEEKDAYS, type StoreHours } from './storeHours';

export function StoreHoursEditor({ value }: { value: unknown }) {
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<StoreHours>(() => parseStoreHours(value));

  useEffect(() => {
    setDraft(parseStoreHours(value));
  }, [value]);

  const save = async () => {
    if (draft.open >= draft.close) {
      enqueueSnackbar('Open time must be earlier than close time.', { variant: 'warning' });
      return;
    }
    try {
      const { data } = await updateSetting('online_sales.hours', { value: draft });
      setDraft(parseStoreHours(data.value));
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      enqueueSnackbar('Hours saved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to save hours', { variant: 'error' });
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
          gap: 2,
          mb: 2,
        }}
      >
        <TextField
          size="small"
          label="Opens"
          type="time"
          value={draft.open}
          onChange={(e) => setDraft({ ...draft, open: e.target.value })}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          label="Closes"
          type="time"
          value={draft.close}
          onChange={(e) => setDraft({ ...draft, close: e.target.value })}
          InputLabelProps={{ shrink: true }}
        />
        <TextField size="small" label="Timezone" value={draft.timezone} InputProps={{ readOnly: true }} />
      </Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Open days
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(7, minmax(0, 1fr))' },
          gap: 1,
          minHeight: 72,
        }}
      >
        {WEEKDAYS.map((day) => {
          const open = !draft.closed_weekdays.includes(day.id);
          return (
            <FormControlLabel
              key={day.id}
              sx={{ m: 0, alignItems: 'flex-start' }}
              control={
                <Switch
                  checked={open}
                  onChange={(e) => setDraft(setDayOpen(draft, day.id, e.target.checked))}
                  size="small"
                />
              }
              label={
                <Typography variant="caption" color={open ? 'text.primary' : 'text.secondary'}>
                  {day.label}
                </Typography>
              }
            />
          );
        })}
      </Box>
      <Typography variant="body2" sx={{ mt: 2, minHeight: 24, color: 'text.secondary' }}>
        {formatHoursLabel(draft)}
      </Typography>
      <Button sx={{ mt: 1.5 }} size="small" variant="contained" startIcon={<Save />} onClick={() => void save()}>
        Save hours
      </Button>
    </Box>
  );
}
