import { Box, Chip, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { estimateProblems, toggleWork, WORK_OPTIONS, type RestorationEstimateForm } from './restorationEstimate';

/**
 * Restoration estimates (required): the work, hours or parts cost, and the value after. Add item's block, used by every
 * check-in that can send an item to Restoration. Two columns of fields on a phone, three on wider screens.
 */
export function RestorationEstimateFields({
  value,
  onChange,
  disabled,
  showProblem = false,
}: {
  value: RestorationEstimateForm;
  onChange: (next: RestorationEstimateForm) => void;
  disabled?: boolean;
  /** Say what is still missing here, for forms with no message line of their own. */
  showProblem?: boolean;
}) {
  const problem = showProblem ? estimateProblems(value)[0] : undefined;
  const set = (patch: Partial<RestorationEstimateForm>) => onChange({ ...value, ...patch });
  return (
    <Box sx={{ p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'warning.light', bgcolor: 'rgba(237, 108, 2, 0.04)' }}>
      <Typography variant="body2" sx={{ fontWeight: 800, mb: 1 }}>Restoration estimates (required)</Typography>
      <Typography
        variant="caption"
        sx={{ display: 'block', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
          fontSize: '0.62rem', color: 'text.secondary', mb: 0.5 }}
      >
        Work it needs
      </Typography>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        {WORK_OPTIONS.map((w) => (
          <Chip
            key={w.value}
            label={w.label}
            color={value.work.includes(w.value) ? 'primary' : 'default'}
            variant={value.work.includes(w.value) ? 'filled' : 'outlined'}
            onClick={() => onChange(toggleWork(value, w.value))}
            disabled={disabled}
          />
        ))}
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 1fr' }, gap: 1.25 }}>
        <TextField size="small" label="Hours" value={value.hours} onChange={(e) => set({ hours: e.target.value })}
          inputProps={{ inputMode: 'decimal' }} disabled={disabled} />
        <TextField size="small" label="Parts cost" value={value.partsCost} onChange={(e) => set({ partsCost: e.target.value })}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
          inputProps={{ inputMode: 'decimal' }} disabled={disabled} />
        <TextField size="small" label="Worth after" required value={value.valueAfter}
          onChange={(e) => set({ valueAfter: e.target.value })}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
          inputProps={{ inputMode: 'decimal' }} disabled={disabled} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }} />
      </Box>
      <Typography variant="caption" color={problem ? 'warning.main' : 'text.secondary'} component="div" sx={{ mt: 0.75 }}>
        {problem ?? 'Hours or parts cost (or both). It goes to the Restoration queue with these.'}
      </Typography>
    </Box>
  );
}
