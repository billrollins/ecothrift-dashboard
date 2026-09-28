import { TextField } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { saveAiModelPrices, type AiCatalogModel } from '../../../api/aiSettings.api';

/** A model's price per 1M tokens, edited in place: saves on blur or Enter. Blank = unknown. */
export function PriceCell({ model, field }: { model: AiCatalogModel; field: 'input_price' | 'output_price' }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [value, setValue] = useState(model[field] != null ? String(Number(model[field])) : '');

  async function save() {
    const next = value.trim() === '' ? null : value.trim();
    const current = model[field] != null ? String(Number(model[field])) : null;
    if (next === current) return;
    if (next !== null && !(Number(next) >= 0)) {
      enqueueSnackbar('A price is dollars per million tokens, like 3 or 0.25.', { variant: 'warning' });
      return;
    }
    try {
      await saveAiModelPrices(
        model.id,
        field === 'input_price' ? next : model.input_price,
        field === 'output_price' ? next : model.output_price,
      );
      void queryClient.invalidateQueries({ queryKey: ['ai-settings', 'models'] });
    } catch {
      enqueueSnackbar('Could not save the price.', { variant: 'error' });
    }
  }

  return (
    <TextField
      size="small"
      value={value}
      placeholder="unknown"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void save()}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      slotProps={{ htmlInput: { inputMode: 'decimal', 'aria-label': `${model.slug} ${field === 'input_price' ? 'input' : 'output'} price`, style: { textAlign: 'right' } } }}
      sx={{ width: 96 }}
    />
  );
}
