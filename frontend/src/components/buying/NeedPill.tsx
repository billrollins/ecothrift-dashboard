import { Chip } from '@mui/material';

function parseScore(score: string | null | undefined): number | null {
  if (score == null || score === '') return null;
  const n = Number.parseFloat(String(score));
  return Number.isFinite(n) ? n : null;
}

/** High > 3 green, Some > 0 yellow, Low <= 0 red. */
export default function NeedPill({ score }: { score: string | null | undefined }) {
  const n = parseScore(score);
  if (n == null) {
    return <Chip size="small" label="—" variant="outlined" />;
  }
  const label = n > 3 ? 'High' : n > 0 ? 'Some' : 'Low';
  const color = n > 3 ? 'success' : n > 0 ? 'warning' : 'error';
  return <Chip size="small" label={label} color={color} variant="filled" />;
}
