import { Box, Chip, Stack, Typography } from '@mui/material';
import type { SectionState } from '../../../api/stocktake.api';

const GREEN = '#2e7d32';
const ORANGE = '#ed6c02';
const GREY = '#9e9e9e';

export const STATE_WORDS: Record<SectionState, string> = {
  done: 'Done',
  in_progress: 'In progress',
  not_started: 'Not started',
};

export function StateChip({ state }: { state: SectionState }) {
  const color = state === 'done' ? 'success' : state === 'in_progress' ? 'warning' : 'default';
  return <Chip size="small" color={color} label={STATE_WORDS[state]} />;
}

/** "12 Sep" style short date for "last time". */
export function shortDay(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** "37 counted · 412 last time (Sep 28)". The last-time number is what the section should hold now. */
export function sectionCountLine(s: { counted?: number; expected?: number | null; expected_day?: string | null }, withDay = true): string {
  const parts: string[] = [];
  if (s.counted) parts.push(`${s.counted.toLocaleString()} counted`);
  if (s.expected != null) parts.push(`${s.expected.toLocaleString()} last time${withDay && s.expected_day ? ` (${shortDay(s.expected_day)})` : ''}`);
  return parts.join(' · ');
}

interface Props {
  done: number;
  inProgress: number;
  total: number;
  /** Smaller numbers, for a card in a list. */
  dense?: boolean;
}

/** How the day's sections stand: Done / In progress / Not started, with a bar. */
export default function SectionProgress({ done, inProgress, total, dense }: Props) {
  const notStarted = Math.max(0, total - done - inProgress);
  const cells = [
    { label: 'Done', n: done, color: GREEN },
    { label: 'In progress', n: inProgress, color: ORANGE },
    { label: 'Not started', n: notStarted, color: GREY },
  ];
  return (
    <Box data-testid="section-progress" sx={{ width: '100%' }}>
      <Stack direction="row" spacing={1}>
        {cells.map((c) => (
          <Box key={c.label} sx={{ flex: 1, minWidth: 0, textAlign: 'center', borderRadius: 2, border: 1, borderColor: 'divider', py: dense ? 0.25 : 0.75 }}>
            <Typography sx={{ fontSize: dense ? 18 : 26, fontWeight: 900, lineHeight: 1.1, color: c.n ? c.color : 'text.disabled' }}>{c.n}</Typography>
            <Typography noWrap sx={{ fontSize: dense ? 11 : 12, color: 'text.secondary' }}>
              {c.label}
            </Typography>
          </Box>
        ))}
      </Stack>
      {total > 0 && (
        <Stack direction="row" sx={{ mt: 0.75, height: 6, borderRadius: 3, overflow: 'hidden', bgcolor: 'action.hover' }}>
          <Box sx={{ width: `${(done / total) * 100}%`, bgcolor: GREEN }} />
          <Box sx={{ width: `${(inProgress / total) * 100}%`, bgcolor: ORANGE }} />
        </Stack>
      )}
    </Box>
  );
}
