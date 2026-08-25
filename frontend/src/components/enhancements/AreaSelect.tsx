import { MenuItem, TextField } from '@mui/material';
import type { EnhancementArea } from '../../types/enhancementRequests.types';
import { AreaBadge } from './AreaBadge';

const AREA_OPTIONS: EnhancementArea[] = ['restoration', 'processing'];

/**
 * Area picker that always shows the colour badge — closed and open — so the
 * two areas read the same way here as they do in the table.
 */
export function AreaSelect({
  value,
  onChange,
  disabled = false,
  label = 'Area',
  height,
  minWidth = 148,
}: {
  value: EnhancementArea;
  onChange: (area: EnhancementArea) => void;
  disabled?: boolean;
  label?: string;
  height?: number;
  minWidth?: number;
}) {
  return (
    <TextField
      select
      size="small"
      label={label || undefined}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as EnhancementArea)}
      slotProps={{
        select: {
          renderValue: (selected) => <AreaBadge area={selected as EnhancementArea} />,
        },
        htmlInput: { 'aria-label': label || 'Area' },
      }}
      sx={{
        minWidth,
        height,
        bgcolor: 'background.paper',
        '& .MuiInputBase-root': {
          height: height ?? 40,
          display: 'flex',
          alignItems: 'center',
        },
        '& .MuiSelect-select': {
          display: 'flex',
          alignItems: 'center',
          py: 0,
        },
      }}
    >
      {AREA_OPTIONS.map((area) => (
        <MenuItem key={area} value={area}>
          <AreaBadge area={area} />
        </MenuItem>
      ))}
    </TextField>
  );
}
