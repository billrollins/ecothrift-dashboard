/**
 * What restoration earned, as one strip across the top of Home.
 *
 * The rate leads because it is the number that says whether the work was worth
 * doing; the rest is context for it. Everything is a fixed slot — no caption
 * appears or disappears with the data, so the strip never changes height and
 * never pushes the queue below it around.
 *
 * This rate includes investigation time. A forward-looking decision at the bench
 * ignores minutes already spent, but a report of what was earned must count
 * every minute it consumed.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
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

type Verdict = { label: string; detail: string; color: string; bg: string; border: string };

/**
 * Three bands, not a pass/fail line. The floor is what an hour costs; the
 * benchmark is what an hour usually returns. Between them the work pays but is
 * worse than average, which only matters when something better is waiting.
 */
export function scoreboardVerdict(board: RestorationScoreboardDTO): Verdict | null {
  const rate = Number.parseFloat(board.per_hour_while_working ?? '');
  if (!Number.isFinite(rate)) return null;

  const floor = Number.parseFloat(board.floor_rate);
  const benchmark = board.benchmark_ready ? Number.parseFloat(board.benchmark_rate ?? '') : NaN;

  if (Number.isFinite(floor) && rate < floor) {
    return {
      label: 'below cost',
      detail: `an hour costs ${money(board.floor_rate)}`,
      color: '#b71c1c',
      bg: '#fdecea',
      border: '#f3b5ae',
    };
  }
  if (Number.isFinite(benchmark) && rate < benchmark) {
    return {
      label: 'below usual',
      detail: `usually ${money(board.benchmark_rate)}`,
      color: '#8a5200',
      bg: '#fff4e0',
      border: '#f0cd93',
    };
  }
  return {
    label: 'beating usual',
    detail: Number.isFinite(benchmark)
      ? `usually ${money(board.benchmark_rate)}`
      : `costs ${money(board.floor_rate)}`,
    color: studio.accentDark,
    bg: studio.accentSoft,
    border: studio.accentSoftBorder,
  };
}

export function TarsScoreboard({ board }: { board: RestorationScoreboardDTO }) {
  const verdict = scoreboardVerdict(board);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1.5, lg: 3 },
        flexWrap: { xs: 'wrap', lg: 'nowrap' },
        px: 2,
        py: 1.25,
        bgcolor: studio.panel,
        border: `1px solid ${studio.panelBorder}`,
        borderRadius: `${studio.radius.lg}px`,
        boxShadow: studio.panelShadow,
      }}
    >
      <Stack spacing={0} sx={{ minWidth: 132 }}>
        <Stack direction="row" alignItems="baseline" spacing={0.85}>
          <Typography
            sx={{
              fontFamily: 'monospace',
              fontWeight: 900,
              lineHeight: 1,
              fontSize: '2.05rem',
              color: board.per_hour_while_working ? '#0f172a' : '#b6c0cd',
            }}
          >
            {money(board.per_hour_while_working)}
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800 }}>/hr</Typography>
        </Stack>
        <Typography sx={{ fontSize: '0.62rem', fontWeight: 900, color: '#94a3b8', letterSpacing: 0.5 }}>
          WHILE WORKING
        </Typography>
      </Stack>

      <Box
        sx={{
          px: 0.9,
          py: 0.3,
          borderRadius: `${studio.radius.sm}px`,
          bgcolor: verdict?.bg ?? '#f1f5f9',
          border: `1px solid ${verdict?.border ?? '#e2e8f0'}`,
          color: verdict?.color ?? '#94a3b8',
          whiteSpace: 'nowrap',
          minWidth: 108,
          textAlign: 'center',
        }}
      >
        <Typography sx={{ fontSize: '0.66rem', fontWeight: 900, textTransform: 'uppercase', lineHeight: 1.35 }}>
          {verdict?.label ?? 'no rate yet'}
        </Typography>
        <Typography sx={{ fontSize: '0.62rem', lineHeight: 1.2, opacity: 0.85 }}>
          {verdict?.detail ?? 'nothing measured'}
        </Typography>
      </Box>

      <Divider />

      <Metric label="TODAY" value={money(board.today.value_added)} sub={`${board.today.items} items`} />
      <Metric label="THIS WEEK" value={money(board.week.value_added)} sub={`${board.week.items} items`} />
      <Metric
        label="WEEKLY AVG"
        value={money(board.four_week.weekly_average_value)}
        sub={`${count(board.four_week.weekly_average_items)} items`}
      />

      <Box sx={{ flex: 1, minWidth: 0, display: { xs: 'none', lg: 'block' } }} />

      <Sparkline days={board.days} />
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
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 900, color: '#94a3b8', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1.2rem', lineHeight: 1.2, color: '#0f172a' }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: '0.66rem', color: '#7c8899', fontWeight: 700 }}>{sub}</Typography>
    </Stack>
  );
}

/** Fourteen days of value added. Shape only — the metrics carry the numbers. */
function Sparkline({ days }: { days: RestorationScoreboardDTO['days'] }) {
  const values = days.map((d) => Math.max(Number.parseFloat(d.value_added) || 0, 0));
  const peak = Math.max(...values, 1);

  return (
    <Stack
      direction="row"
      spacing={0.35}
      alignItems="flex-end"
      sx={{ height: 38, display: { xs: 'none', md: 'flex' } }}
    >
      {days.map((day, i) => {
        const value = values[i];
        const today = i === days.length - 1;
        return (
          <Tooltip key={day.date} title={`${day.date} · ${fmtUsd(value)} · ${day.items} items`} arrow>
            <Box
              sx={{
                width: 8,
                // Zero days stay visible as a floor rather than disappearing.
                height: `${Math.max((value / peak) * 100, 5)}%`,
                borderRadius: '2px 2px 0 0',
                bgcolor: value > 0 ? (today ? studio.accentDark : studio.accent) : '#e2e8f0',
                cursor: 'help',
              }}
            />
          </Tooltip>
        );
      })}
    </Stack>
  );
}
