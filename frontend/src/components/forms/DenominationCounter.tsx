import { Box, TextField, Typography, Paper, Divider, Chip } from '@mui/material';
import type { DenominationBreakdown } from '../../types/pos.types';

const DENOMINATIONS: { key: keyof DenominationBreakdown; label: string; value: number }[] = [
  { key: 'hundreds', label: '$100', value: 100 },
  { key: 'fifties', label: '$50', value: 50 },
  { key: 'twenties', label: '$20', value: 20 },
  { key: 'tens', label: '$10', value: 10 },
  { key: 'fives', label: '$5', value: 5 },
  { key: 'ones', label: '$1', value: 1 },
  { key: 'quarters', label: '25¢', value: 0.25 },
  { key: 'dimes', label: '10¢', value: 0.1 },
  { key: 'nickels', label: '5¢', value: 0.05 },
  { key: 'pennies', label: '1¢', value: 0.01 },
];

const EMPTY_BREAKDOWN: DenominationBreakdown = {
  hundreds: 0, fifties: 0, twenties: 0, tens: 0, fives: 0,
  ones: 0, quarters: 0, dimes: 0, nickels: 0, pennies: 0,
};

export function calculateTotal(breakdown: DenominationBreakdown): number {
  return DENOMINATIONS.reduce((sum, d) => sum + (breakdown[d.key] || 0) * d.value, 0);
}

interface DenominationCounterProps {
  value: DenominationBreakdown;
  onChange: (breakdown: DenominationBreakdown) => void;
  expectedTotal?: number;
  disabled?: boolean;
  label?: string;
}

export default function DenominationCounter({
  value = EMPTY_BREAKDOWN,
  onChange,
  expectedTotal,
  disabled = false,
  label = 'Cash Count',
}: DenominationCounterProps) {
  const total = calculateTotal(value);
  const variance = expectedTotal !== undefined ? total - expectedTotal : undefined;

  const handleChange = (key: keyof DenominationBreakdown, qty: number) => {
    onChange({ ...value, [key]: Math.max(0, qty) });
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>{label}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 1.5 }}>
        {DENOMINATIONS.map((d) => {
          const qty = value[d.key] || 0;
          const denomTotal = qty * d.value;
          return (
            <Box key={d.key}>
              <Typography variant="caption" color="text.secondary">{d.label}</Typography>
              <TextField
                size="small"
                type="number"
                value={qty}
                onChange={(e) => handleChange(d.key, parseInt(e.target.value) || 0)}
                disabled={disabled}
                fullWidth
                slotProps={{
                  input: {
                    inputProps: { min: 0 },
                  },
                }}
              />
              <Typography variant="caption" color="text.secondary">
                = ${denomTotal.toFixed(2)}
              </Typography>
            </Box>
          );
        })}
      </Box>
      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h5">
          Total: ${total.toFixed(2)}
        </Typography>
        {expectedTotal !== undefined && (
          <Chip
            label={`Expected: $${expectedTotal.toFixed(2)}`}
            size="small"
            color="default"
          />
        )}
        {variance !== undefined && (
          <Chip
            label={`Variance: ${variance >= 0 ? '+' : ''}$${variance.toFixed(2)}`}
            size="small"
            color={Math.abs(variance) < 0.01 ? 'success' : variance > 0 ? 'warning' : 'error'}
          />
        )}
      </Box>
    </Paper>
  );
}

export { DENOMINATIONS, EMPTY_BREAKDOWN };
