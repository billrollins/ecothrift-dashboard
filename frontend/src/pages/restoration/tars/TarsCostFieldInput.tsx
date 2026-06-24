import {
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import type { TarsCostField, TarsCostState } from './tarsTypes';
import { TARS_COST_STATE_LABELS } from './tarsCostUtils';

type Unit = 'money' | 'hours';

interface TarsCostFieldInputProps {
  label: string;
  field: TarsCostField;
  unit: Unit;
  onChange: (field: TarsCostField) => void;
  compact?: boolean;
}

export function TarsCostFieldInput({
  label,
  field,
  unit,
  onChange,
  compact = false,
}: TarsCostFieldInputProps) {
  const setState = (state: TarsCostState) => {
    if (state === 'unknown') onChange({ state, amount: 0 });
    else if (state === 'zero') onChange({ state, amount: 0 });
    else onChange({ state, amount: field.amount || (unit === 'hours' ? 0.5 : 10) });
  };

  const showAmount = field.state === 'estimate' || field.state === 'known';

  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={field.state}
        onChange={(_, v) => v && setState(v as TarsCostState)}
        onClick={(e) => e.stopPropagation()}
        sx={{ flexWrap: 'wrap' }}
      >
        {(Object.keys(TARS_COST_STATE_LABELS) as TarsCostState[]).map((s) => (
          <ToggleButton key={s} value={s} sx={{ px: compact ? 0.75 : 1.25, py: 0.25, fontSize: 11 }}>
            {TARS_COST_STATE_LABELS[s]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      {showAmount ? (
        <TextField
          size="small"
          type="number"
          inputProps={{ step: unit === 'hours' ? 0.1 : 1, min: 0 }}
          value={String(field.amount)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            onChange({
              state: field.state,
              amount: parseFloat(e.target.value) || 0,
            })
          }
          slotProps={{
            input: {
              startAdornment:
                unit === 'money' ? (
                  <InputAdornment position="start">$</InputAdornment>
                ) : undefined,
              endAdornment:
                unit === 'hours' ? (
                  <InputAdornment position="end">h</InputAdornment>
                ) : undefined,
              sx: { fontFamily: 'monospace', fontSize: 13 },
            },
          }}
        />
      ) : (
        <Typography variant="caption" color="text.disabled" fontFamily="monospace" sx={{ py: 0.75 }}>
          {field.state === 'unknown' ? 'Not known yet' : '$0 — no cost'}
        </Typography>
      )}
    </Stack>
  );
}
