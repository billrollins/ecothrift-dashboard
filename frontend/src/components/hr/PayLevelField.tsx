import { MenuItem, TextField } from '@mui/material';
import { usePayLevels } from '../../hooks/usePayLevels';
import { payWarning } from '../../utils/payLevels';

/**
 * The pay level (Entry, Senior, Manager) next to a pay rate. A pay outside the level's range is a warning under the
 * field, never a block (owner 2026-10-20). The ranges are the owner's setting (hr.pay_levels).
 */
export function PayLevelField({
  value,
  pay,
  onChange,
  size = 'small',
  label = 'Level',
}: {
  value: string;
  pay: string | number | null | undefined;
  onChange: (level: string) => void;
  size?: 'small' | 'medium';
  label?: string;
}) {
  const levels = usePayLevels();
  const warning = payWarning(pay, value, levels);
  const range = levels.find((l) => l.key === value)?.text;
  return (
    <TextField
      select
      label={label}
      size={size}
      fullWidth
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={false}
      helperText={warning || (range ? `${range} an hour` : ' ')}
      FormHelperTextProps={warning ? { sx: { color: 'warning.dark', fontWeight: 600 } } : undefined}
      data-testid="pay-level-field"
    >
      {levels.map((l) => (
        <MenuItem key={l.key} value={l.key}>
          {l.label} ({l.text})
        </MenuItem>
      ))}
    </TextField>
  );
}
