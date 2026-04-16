import { Chip } from '@mui/material';

function parseScore(score: string | number | null | undefined): number | null {
  if (score == null || score === '') return null;
  const n = Number.parseFloat(String(score));
  return Number.isFinite(n) ? n : null;
}

/** 1–99 taxonomy need mix: higher = more need. */
export default function NeedPill({ score }: { score: string | number | null | undefined }) {
  const n = parseScore(score);
  if (n == null) {
    return <Chip size="small" label="—" variant="outlined" />;
  }
  const label = n >= 67 ? 'High' : n >= 34 ? 'Some' : 'Low';
  const color = n >= 67 ? 'success' : n >= 34 ? 'warning' : 'error';
  return <Chip size="small" label={label} color={color} variant="filled" />;
}
