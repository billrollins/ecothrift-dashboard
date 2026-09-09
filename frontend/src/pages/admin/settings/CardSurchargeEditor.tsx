import { useState } from 'react';
import { Box, Button, FormControlLabel, Switch, TextField, Typography } from '@mui/material';
import Save from '@mui/icons-material/Save';
import { useSnackbar } from 'notistack';
import { useQueryClient } from '@tanstack/react-query';
import { updateSetting } from '../../../api/core.api';

export type CardSurchargeValue = {
  enabled: boolean;
  percent: number;
};

export function parseCardSurcharge(raw: unknown): CardSurchargeValue {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const percent = Number(src.percent);
  return {
    enabled: src.enabled !== false,
    percent: Number.isFinite(percent) ? percent : 3,
  };
}

export function CardSurchargeEditor({ value }: { value: unknown }) {
  const parsed = parseCardSurcharge(value);
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(parsed.enabled);
  const [percent, setPercent] = useState(String(parsed.percent));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = parseFloat(percent);
    if (Number.isNaN(n) || n < 0 || n > 50) {
      enqueueSnackbar('Enter a surcharge percent from 0 to 50.', { variant: 'warning' });
      return;
    }
    setSaving(true);
    try {
      await updateSetting('pos.card_surcharge', {
        value: { enabled, percent: Math.round(n * 10) / 10 },
      });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      enqueueSnackbar('Setting saved', { variant: 'success' });
    } catch {
      enqueueSnackbar('Failed to save setting', { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        }
        label={enabled ? 'Enabled' : 'Disabled'}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          label="Percent"
          type="number"
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          slotProps={{ htmlInput: { min: 0, max: 50, step: 0.1 } }}
          sx={{ width: 140 }}
        />
        <Typography variant="body2" color="text.secondary">
          Must match the CardX program rate.
        </Typography>
        <Button
          size="small"
          variant="contained"
          startIcon={<Save />}
          onClick={() => void save()}
          disabled={saving}
        >
          Save
        </Button>
      </Box>
    </Box>
  );
}
