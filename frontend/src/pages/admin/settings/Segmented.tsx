import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { alpha } from '@mui/material/styles';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * A pill-shaped segmented switch that sits beside the house's pill buttons (same height, no capitals): one choice
 * of a few, with an optional count after each label.
 */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: SegmentOption<T>[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value}
      aria-label={label}
      onChange={(_e, next: T | null) => { if (next) onChange(next); }}
      sx={(theme) => ({
        height: 32,
        borderRadius: 999,
        bgcolor: 'background.paper',
        '& .MuiToggleButton-root': {
          textTransform: 'none',
          fontSize: 14,
          fontWeight: 500,
          px: 1.75,
          border: `1px solid ${theme.palette.divider}`,
          color: 'text.secondary',
          gap: 0.75,
        },
        '& .MuiToggleButton-root:first-of-type': { borderTopLeftRadius: 999, borderBottomLeftRadius: 999, pl: 2 },
        '& .MuiToggleButton-root:last-of-type': { borderTopRightRadius: 999, borderBottomRightRadius: 999, pr: 2 },
        '& .MuiToggleButton-root.Mui-selected': {
          color: 'primary.main',
          bgcolor: alpha(theme.palette.primary.main, 0.1),
          '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.16) },
        },
      })}
    >
      {options.map((o) => (
        <ToggleButton key={o.value} value={o.value} aria-label={o.count != null ? `${o.label} ${o.count}` : o.label}>
          {o.label}
          {o.count != null && (
            <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.7, fontWeight: 400 }}>{o.count}</span>
          )}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
