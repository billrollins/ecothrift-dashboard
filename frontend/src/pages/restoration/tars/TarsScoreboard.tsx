/**
 * What restoration earned, as one strip across the top of Home.
 *
 * TODAY / THIS WEEK / WEEKLY AVG. Everything is a fixed slot — no caption
 * appears or disappears with the data, so the strip never changes height and
 * never pushes the queue below it around.
 */
import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { RestorationScoreboardDTO } from '../../../types/inventory.types';
import { fmtUsd } from './tarsProfit';
import { studio } from './studio/tarsStudioTheme';

const NOT_YET = '—';

function money(raw: string | null | undefined): string {
  if (raw == null) return NOT_YET;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? fmtUsd(n) : NOT_YET;
}

function count(raw: string | number | null | undefined): string {
  if (raw == null) return NOT_YET;
  const n = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  if (!Number.isFinite(n)) return NOT_YET;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function TarsScoreboard({
  board,
  action,
}: {
  board?: RestorationScoreboardDTO | null;
  action?: ReactNode;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'stretch',
        minHeight: 72,
        overflow: 'hidden',
        bgcolor: studio.panel,
        border: `1.5px solid ${studio.panelBorder}`,
        borderRadius: `${studio.radius.lg}px`,
        boxShadow: studio.panelShadow,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={{ xs: 1.5, lg: 3 }}
        divider={<Divider />}
        sx={{ flexShrink: 0, px: 2, py: 1.25 }}
      >
        <Metric label="TODAY" value={money(board?.today.value_added)} sub={`${board?.today.items ?? 0} items`} />
        <Metric label="THIS WEEK" value={money(board?.week.value_added)} sub={`${board?.week.items ?? 0} items`} />
        <Metric
          label="WEEKLY AVG"
          value={money(board?.four_week.weekly_average_value)}
          sub={`${count(board?.four_week.weekly_average_items)} items`}
        />
      </Stack>

      <Box sx={{ flex: 1, minWidth: 16 }} />

      {action ? (
        <Box sx={{ flexShrink: 0, alignSelf: 'stretch', display: 'flex', minWidth: { xs: 440, sm: 600, md: 760 } }}>
          {action}
        </Box>
      ) : null}
    </Box>
  );
}

function Divider() {
  return (
    <Box
      sx={{
        display: { xs: 'none', lg: 'block' },
        alignSelf: 'stretch',
        width: '1px',
        bgcolor: studio.panelBorder,
      }}
    />
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Stack spacing={0} sx={{ minWidth: 84 }}>
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: studio.inkLabel, letterSpacing: 0.6 }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.2rem', lineHeight: 1.2, color: studio.ink }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: '0.66rem', color: studio.inkMuted, fontWeight: 800 }}>{sub}</Typography>
    </Stack>
  );
}
