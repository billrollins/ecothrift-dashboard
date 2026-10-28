import { Box, Checkbox, Chip, FormControlLabel, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getRestorationRequestSettings } from '../../../api/inventory.api';
import type { RestorationRequestSettings } from '../../../types/inventory.types';
import {
  asIsPrices,
  DEFAULT_REQUEST_SETTINGS,
  NEED_OPTIONS,
  requestProblems,
  toggleNeed,
  valueAtStake,
  type RestorationRequestForm,
} from './restorationRequest';

export function useRestorationRequestSettings(): RestorationRequestSettings {
  const { data } = useQuery({
    queryKey: ['restoration-request-settings'],
    queryFn: async () => (await getRestorationRequestSettings()).data,
    staleTime: 5 * 60_000,
  });
  return data ?? DEFAULT_REQUEST_SETTINGS;
}

const LABEL_SX = {
  display: 'block', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase',
  fontSize: '0.62rem', color: 'text.secondary', mb: 0.5,
} as const;

/**
 * Send to Restoration (required): what it needs, the done price, and an as-is price for each other ending (filled in
 * from settings; any can be changed). The prices fill the box's width: one per line on a phone, two or three wider.
 */
export function RestorationRequestFields({
  value,
  onChange,
  disabled,
  showProblem = false,
}: {
  value: RestorationRequestForm;
  onChange: (next: RestorationRequestForm) => void;
  disabled?: boolean;
  /** Say what is still missing here, for forms with no message line of their own. */
  showProblem?: boolean;
}) {
  const settings = useRestorationRequestSettings();
  const problem = showProblem ? requestProblems(value)[0] : undefined;
  const prices = asIsPrices(value, settings);
  const stake = valueAtStake(value, settings);
  const setAsIs = (ending: string, raw: string) => onChange({ ...value, asIs: { ...value.asIs, [ending]: raw } });
  return (
    <Box sx={{ p: 1.5, borderRadius: 1.5, border: 1, borderColor: 'warning.light', bgcolor: 'rgba(237, 108, 2, 0.04)' }}>
      <Typography variant="body2" sx={{ fontWeight: 800, mb: 1 }}>Send to Restoration (required)</Typography>
      <Typography variant="caption" sx={LABEL_SX}>What it needs (how it is now)</Typography>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        {NEED_OPTIONS.map((n) => (
          <Chip
            key={n.value}
            label={n.label}
            color={value.needs.includes(n.value) ? 'primary' : 'default'}
            variant={value.needs.includes(n.value) ? 'filled' : 'outlined'}
            onClick={() => onChange(toggleNeed(value, n.value))}
            disabled={disabled}
          />
        ))}
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1.25 }}>
        <TextField size="small" label="Done price" required value={value.donePrice}
          onChange={(e) => onChange({ ...value, donePrice: e.target.value })}
          helperText="When the work is done"
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
          inputProps={{ inputMode: 'decimal' }} disabled={disabled} />
        {prices.map((p) => {
          const scrap = p.ending === 'broken' && value.brokenScrap;
          return (
            <Box key={p.ending}>
              <TextField size="small" fullWidth label={p.label}
                value={scrap ? '0.00' : p.typed ? (value.asIs[p.ending] ?? '') : (p.price != null ? p.price.toFixed(2) : '')}
                onChange={(e) => setAsIs(p.ending, e.target.value)}
                helperText={scrap ? 'Scrap / parts' : (p.typed ? 'Typed' : 'From settings')}
                InputLabelProps={{ shrink: true }}
                InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                inputProps={{ inputMode: 'decimal' }} disabled={disabled || scrap} />
              {p.ending === 'broken' ? (
                <FormControlLabel
                  sx={{ ml: 0, mt: -0.25 }}
                  control={<Checkbox size="small" checked={value.brokenScrap} disabled={disabled}
                    onChange={(e) => onChange({ ...value, brokenScrap: e.target.checked })} />}
                  label={<Typography variant="caption">Scrap / parts $0</Typography>}
                />
              ) : null}
            </Box>
          );
        })}
      </Box>
      <Typography variant="caption" color={problem ? 'warning.main' : 'text.secondary'} component="div" sx={{ mt: 0.75 }}>
        {problem ?? (stake != null
          ? `At stake $${stake.toFixed(2)} (done price minus the lowest as-is). Restoration fills in what it finds.`
          : 'Pick what it needs and give the done price. The as-is prices fill in.')}
      </Typography>
    </Box>
  );
}
