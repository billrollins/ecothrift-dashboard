/**
 * What restoration earned, readable from across the room.
 *
 * The headline is the rate, because that is the number that says whether the
 * work was worth doing. Everything else is context for it: what an hour costs,
 * what an hour usually returns, and the volume behind the average.
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

type Verdict = {
  label: string;
  detail: string;
  color: string;
  bg: string;
  border: string;
};

/**
 * Three bands, not a pass/fail line. The floor is what an hour costs; the
 * benchmark is what an hour usually returns. Between them the work pays but
 * is worse than average, which only matters when something better is waiting.
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
      label: 'paying, below usual',
      detail: `usually ${money(board.benchmark_rate)}`,
      color: '#8a5200',
      bg: '#fff4e0',
      border: '#f0cd93',
    };
  }
  return {
    label: 'beating the usual',
    detail: Number.isFinite(benchmark)
      ? `usually ${money(board.benchmark_rate)}`
      : `above the ${money(board.floor_rate)} an hour it costs`,
    color: studio.accentDark,
    bg: studio.accentSoft,
    border: studio.accentSoftBorder,
  };
}

export function TarsScoreboard({ board }: { board: RestorationScoreboardDTO }) {
  const verdict = scoreboardVerdict(board);
  const rate = board.per_hour_while_working;

  return (
    <Stack spacing={1.25} sx={{ px: { xs: 1, md: 1.5 }, pt: 1.25 }}>
      <Box
        sx={{
          bgcolor: studio.panel,
          border: `1px solid ${studio.panelBorder}`,
          borderRadius: `${studio.radius.lg}px`,
          boxShadow: studio.panelShadow,
          px: { xs: 1.5, md: 2.25 },
          py: { xs: 1.25, md: 1.5 },
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={{ xs: 1.25, md: 2.5 }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Kicker>Per hour while working</Kicker>
            <Stack direction="row" alignItems="baseline" spacing={1}>
              <Typography
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  lineHeight: 1,
                  fontSize: { xs: '2.4rem', md: '3.1rem' },
                  color: rate ? '#0f172a' : '#94a3b8',
                }}
              >
                {money(rate)}
              </Typography>
              {verdict ? (
                <Box
                  sx={{
                    px: 0.9,
                    py: 0.2,
                    borderRadius: `${studio.radius.sm}px`,
                    bgcolor: verdict.bg,
                    border: `1px solid ${verdict.border}`,
                    color: verdict.color,
                    fontSize: '0.68rem',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {verdict.label}
                </Box>
              ) : null}
            </Stack>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
              {verdict
                ? `${verdict.detail} · last 4 weeks`
                : 'no finished work with recorded hours yet'}
            </Typography>
          </Box>

          <Box sx={{ flex: 1 }} />

          <Sparkline days={board.days} />
        </Stack>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
        <Tile
          label="Added today"
          value={money(board.today.value_added)}
          items={board.today.items}
          unmeasured={board.today.items_unmeasured}
        />
        <Tile
          label="This week"
          value={money(board.week.value_added)}
          items={board.week.items}
          unmeasured={board.week.items_unmeasured}
        />
        <Tile
          label="Weekly average"
          value={money(board.four_week.weekly_average_value)}
          itemsLabel={`${count(board.four_week.weekly_average_items)} items/wk`}
          note="4-week average"
          unmeasured={board.four_week.items_unmeasured}
        />
      </Stack>

      {!board.benchmark_ready ? (
        <Typography variant="caption" sx={{ color: '#8593a8', px: 0.5 }}>
          The usual rate appears once {board.benchmark_minimum_jobs} finished jobs can be priced —
          until then one lucky item would set an unreachable bar.
        </Typography>
      ) : null}
    </Stack>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        color: '#94a3b8',
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontSize: '0.63rem',
      }}
    >
      {children}
    </Typography>
  );
}

function Tile({
  label,
  value,
  items,
  itemsLabel,
  note,
  unmeasured = 0,
}: {
  label: string;
  value: string;
  items?: number;
  itemsLabel?: string;
  note?: string;
  unmeasured?: number;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        bgcolor: studio.panel,
        border: `1px solid ${studio.panelBorder}`,
        borderRadius: `${studio.radius.lg}px`,
        boxShadow: studio.panelShadow,
        px: 1.75,
        py: 1.25,
      }}
    >
      <Kicker>{label}</Kicker>
      <Typography
        sx={{
          fontFamily: 'monospace',
          fontWeight: 900,
          fontSize: { xs: '1.5rem', md: '1.75rem' },
          lineHeight: 1.15,
          color: '#0f172a',
        }}
      >
        {value}
      </Typography>
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>
          {itemsLabel ?? `${items ?? 0} ${items === 1 ? 'item' : 'items'}`}
        </Typography>
        {note ? (
          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
            {note}
          </Typography>
        ) : null}
        {unmeasured > 0 ? (
          <Tooltip
            title="Finished without a grade to measure from, so they add nothing to the totals or the rate."
            arrow
          >
            <Typography
              variant="caption"
              sx={{
                color: '#8a5200',
                bgcolor: '#fff4e0',
                border: '1px solid #f0cd93',
                borderRadius: '4px',
                px: 0.5,
                fontWeight: 800,
                cursor: 'help',
              }}
            >
              {unmeasured} unmeasured
            </Typography>
          </Tooltip>
        ) : null}
      </Stack>
    </Box>
  );
}

/** Fourteen days of value added. Shape only — the tiles carry the numbers. */
function Sparkline({ days }: { days: RestorationScoreboardDTO['days'] }) {
  const values = days.map((d) => Math.max(Number.parseFloat(d.value_added) || 0, 0));
  const peak = Math.max(...values, 1);

  return (
    <Stack spacing={0.4} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={0.4} alignItems="flex-end" sx={{ height: 42 }}>
        {days.map((day, i) => {
          const value = values[i];
          const today = i === days.length - 1;
          return (
            <Tooltip key={day.date} title={`${day.date} · ${fmtUsd(value)} · ${day.items} items`} arrow>
              <Box
                sx={{
                  width: { xs: 7, md: 10 },
                  // Zero days stay visible as a floor rather than disappearing.
                  height: `${Math.max((value / peak) * 100, 4)}%`,
                  minHeight: 2,
                  borderRadius: '2px 2px 0 0',
                  bgcolor: value > 0 ? (today ? studio.accentDark : studio.accent) : '#dde4ec',
                  cursor: 'help',
                }}
              />
            </Tooltip>
          );
        })}
      </Stack>
      <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.6rem', textAlign: 'right' }}>
        last 14 days
      </Typography>
    </Stack>
  );
}
