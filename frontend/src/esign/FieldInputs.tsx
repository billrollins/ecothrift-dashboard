import { MenuItem, Stack, TextField } from '@mui/material';
import type { EsignField } from './api';

/** The fill-in form for a template version's blanks. */
export function FieldInputs({ fields, values, onChange, disabled = false }: {
  fields: EsignField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Stack spacing={2}>
      {fields.map((f) => {
        const value = values[f.key] ?? f.default ?? '';
        const common = {
          key: f.key,
          label: f.label + (f.required ? '' : ' (optional)'),
          value,
          disabled,
          size: 'small' as const,
          fullWidth: true,
          onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(f.key, e.target.value),
          slotProps: { htmlInput: { 'data-testid': `field-${f.key}` } },
        };
        if (f.kind === 'choice') {
          return (
            <TextField {...common} select>
              {f.options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </TextField>
          );
        }
        if (f.kind === 'date') return <TextField {...common} type="date" slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': `field-${f.key}` } }} />;
        if (f.kind === 'textarea') return <TextField {...common} multiline minRows={3} />;
        return <TextField {...common} />;
      })}
    </Stack>
  );
}
