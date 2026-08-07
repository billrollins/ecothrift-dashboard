import { Box, Typography } from '@mui/material';
import { KeyValueJsonField } from '../../../components/inventory/KeyValueJsonField';

export function normalizeItemSpecObject(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    const normKey = key.trim().toLowerCase().replace(/[\s-]+/g, '_').slice(0, 64);
    const normVal = String(val ?? '').trim();
    if (!normKey || !normVal) continue;
    out[normKey] = normVal;
  }
  return out;
}

export interface ItemSpecificationsEditorProps {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled?: boolean;
  helperText?: string | null;
}

export function ItemSpecificationsEditor({
  value,
  onChange,
  disabled = false,
  helperText,
}: ItemSpecificationsEditorProps) {
  return (
    <Box sx={{ flexShrink: 0 }}>
      <KeyValueJsonField
        compact
        label="Item specifications"
        value={value}
        onChange={disabled ? () => {} : onChange}
        emptySummary="No item-specific specifications"
        mode="specifications"
        accentColor="#6d5b9a"
      />
      {helperText !== null ?
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {helperText ?? 'Supplements the product catalog specs - saved on each physical item.'}
        </Typography>
      : null}
    </Box>
  );
}
