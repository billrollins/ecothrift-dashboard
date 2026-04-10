import { Chip } from '@mui/material';

function parseRatio(ratio: string | null | undefined): number | null {
  if (ratio == null || ratio === '') return null;
  const n = Number.parseFloat(String(ratio));
  return Number.isFinite(n) ? n : null;
}

/** Green >= 2.0 Strong, yellow >= 1.5 Marginal, red Weak. */
export default function ProfitabilityPill({ ratio }: { ratio: string | null | undefined }) {
  const n = parseRatio(ratio);
  if (n == null) {
    return <Chip size="small" label="—" variant="outlined" />;
  }
  const label = `${n >= 2 ? 'Strong' : n >= 1.5 ? 'Marginal' : 'Weak'} ${n.toFixed(1)}x`;
  const color = n >= 2 ? 'success' : n >= 1.5 ? 'warning' : 'error';
  return <Chip size="small" label={label} color={color} variant="filled" />;
}
