import { FormControl, InputLabel, MenuItem, Select, type SelectChangeEvent } from '@mui/material';
import { useEffect, useState } from 'react';
import { useAIModels } from '../../hooks/useAI';

const STORAGE_KEY = 'ecothrift_ai_model';

interface ModelSelectorProps {
  value?: string;
  onChange?: (modelId: string) => void;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  label?: string;
}

export default function ModelSelector({
  value: controlledValue,
  onChange,
  size = 'small',
  fullWidth = false,
  label = 'AI Model',
}: ModelSelectorProps) {
  const { data } = useAIModels();
  const [localValue, setLocalValue] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) || '',
  );

  const models = data?.models ?? [];
  const defaultModel = data?.default ?? '';

  useEffect(() => {
    if (!localValue && defaultModel) {
      setLocalValue(defaultModel);
    }
  }, [defaultModel, localValue]);

  const selected = controlledValue ?? (localValue || defaultModel);

  const handleChange = (e: SelectChangeEvent) => {
    const id = e.target.value;
    setLocalValue(id);
    localStorage.setItem(STORAGE_KEY, id);
    onChange?.(id);
  };

  return (
    <FormControl size={size} fullWidth={fullWidth} sx={{ minWidth: 180 }}>
      <InputLabel>{label}</InputLabel>
      <Select value={selected} onChange={handleChange} label={label}>
        {models.map((m) => (
          <MenuItem key={m.id} value={m.id}>
            {m.name}{m.default ? ' (default)' : ''}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
