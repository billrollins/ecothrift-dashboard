import { Box, InputBase, Typography } from '@mui/material';
import EditOutlined from '@mui/icons-material/EditOutlined';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { saveAiModelPrices, type AiCatalogModel } from '../../../api/aiSettings.api';

function shown(v: string | null): string {
  return v != null ? String(Number(v)) : '';
}

/**
 * A model's price per 1M tokens: plain text with a dotted underline (and a pencil on hover) until
 * clicked, then a small borderless input. Saves on blur or Enter; Escape cancels. Blank = unknown.
 */
export function PriceCell({ model, field }: { model: AiCatalogModel; field: 'input_price' | 'output_price' }) {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(shown(model[field]));
  const label = `${model.slug} ${field === 'input_price' ? 'input' : 'output'} price`;

  if (model.modality !== 'text') {
    return <Typography variant="body2" color="text.disabled">per image</Typography>;
  }

  async function save() {
    setEditing(false);
    const next = value.trim() === '' ? null : value.trim();
    if (next === (model[field] != null ? shown(model[field]) : null)) return;
    if (next !== null && !(Number(next) >= 0)) {
      enqueueSnackbar('A price is dollars per million tokens, like 3 or 0.25.', { variant: 'warning' });
      setValue(shown(model[field]));
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
      setValue(shown(model[field]));
    }
  }

  if (editing) {
    return (
      <InputBase
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setValue(shown(model[field])); setEditing(false); }
        }}
        inputProps={{ inputMode: 'decimal', 'aria-label': label, style: { textAlign: 'right', padding: 0 } }}
        startAdornment={<Typography variant="body2" color="text.secondary">$</Typography>}
        sx={{ width: 72, fontSize: 14, borderBottom: 1, borderColor: 'primary.main' }}
      />
    );
  }

  return (
    <Box
      component="button"
      type="button"
      aria-label={`Edit ${label}`}
      onClick={() => setEditing(true)}
      sx={{
        all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5,
        borderBottom: '1px dashed', borderColor: 'divider', lineHeight: 1.4,
        '& .pencil': { opacity: 0 }, '&:hover .pencil, &:focus-visible .pencil': { opacity: 0.6 },
        '&:hover, &:focus-visible': { borderColor: 'primary.main' },
      }}
    >
      <Typography variant="body2" color={value ? 'text.primary' : 'text.disabled'}>{value ? `$${value}` : 'set'}</Typography>
      <EditOutlined className="pencil" sx={{ fontSize: 14 }} />
    </Box>
  );
}
