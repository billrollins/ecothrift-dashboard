import { useEffect } from 'react';
import { MenuItem, Stack, TextField } from '@mui/material';
import { AI_EFFORTS, EFFORT_LABEL, type AiEffort } from '../../api/aiSettings.api';
import { useAiActionChoices } from '../../hooks/useAiSettings';

export interface AiRunChoice {
  model: string;
  effort: AiEffort;
}

export const EMPTY_AI_CHOICE: AiRunChoice = { model: '', effort: 'off' };

interface Props {
  purpose: 'FLOORPLAN_SVG' | 'FLOORPLAN_ADJUST';
  open: boolean;
  value: AiRunChoice;
  onChange: (next: AiRunChoice) => void;
  disabled?: boolean;
}

/** Model + effort pickers for one run. Defaults come from Settings > AI; a pick here is not saved. */
export default function AiModelEffortFields({ purpose, open, value, onChange, disabled = false }: Props) {
  const choices = useAiActionChoices(purpose, open);
  const data = choices.data;

  useEffect(() => {
    if (open && data && value.model === '') {
      onChange({ model: data.default_model, effort: data.default_effort });
    }
  }, [open, data, value.model, onChange]);

  const models = data?.models ?? [];
  const selected = models.some((m) => m.slug === value.model) ? value.model : '';

  return (
    <Stack direction="row" spacing={1}>
      <TextField
        select
        size="small"
        label="Model"
        value={selected}
        onChange={(e) => onChange({ ...value, model: e.target.value })}
        disabled={disabled || !data}
        error={choices.isError}
        helperText={choices.isError ? 'Could not load the model list. Close and reopen.' : ' '}
        sx={{ flex: 2 }}
      >
        {models.map((m) => (
          <MenuItem key={m.slug} value={m.slug}>
            {m.slug === data?.default_model ? `${m.label} (default)` : m.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Effort"
        value={value.effort}
        onChange={(e) => onChange({ ...value, effort: e.target.value as AiEffort })}
        disabled={disabled || !data}
        helperText=" "
        sx={{ flex: 1 }}
      >
        {AI_EFFORTS.map((eff) => (
          <MenuItem key={eff} value={eff}>
            {EFFORT_LABEL[eff]}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
