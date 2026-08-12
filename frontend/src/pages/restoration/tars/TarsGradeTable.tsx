/**
 * Every grade the item could reach, in the order the scale lists them.
 *
 * Ashley's prices are given. Mike answers three things per row — how likely,
 * what parts, how long — and each row says what it would be worth per hour. The
 * best one is marked where it stands.
 *
 * Rows never move. An earlier version sorted by rate, which meant the table
 * rearranged itself under the hand every time an estimate changed; a row you
 * are reaching for should be where it was a second ago. Marking the winner
 * costs one badge and keeps the layout learnable.
 *
 * The item itself sits at the top as a row of its own. Work that informs every
 * grade at once — opening it up, looking things up — belongs to the item, and
 * giving it a row means the clock always has an honest place to go.
 *
 * Pressing Work is the decision. There is no separate commit step, because the
 * record of what was chosen and the act of choosing it should not be two
 * pieces of work.
 */
import PlayArrow from '@mui/icons-material/PlayArrow';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { PressPicker } from './studio/PressPicker';
import { studio } from './studio/tarsStudioTheme';
import { formatDuration } from './tarsActions';
import {
  MINUTES_CHOICES,
  PARTS_CHOICES,
  PROBABILITY_CHOICES,
  buildGradeRows,
  bestGrade,
  rateBand,
  type RateBand,
  type TarsBenchPlan,
  type TarsGradeRow,
} from './tarsBenchPlan';
import { fmtUsd } from './tarsProfit';

const BAND_COLORS: Record<RateBand, { fg: string; bg: string; border: string }> = {
  'below-cost': { fg: '#b71c1c', bg: '#fdecea', border: '#f3b5ae' },
  'below-usual': { fg: '#8a5200', bg: '#fff4e0', border: '#f0cd93' },
  good: { fg: studio.accentDark, bg: studio.accentSoft, border: studio.accentSoftBorder },
  unknown: { fg: '#94a3b8', bg: '#f8fafc', border: '#e2e8f0' },
};

const COLUMNS = 'minmax(110px, 1fr) 76px 64px 64px 68px 94px minmax(84px, 0.8fr) 88px';
const HEADINGS = ['GRADE', 'SELLS FOR', 'ODDS', 'PARTS', 'MINS', 'WORTH', '', ''];

export function TarsGradeTable({
  job,
  plan,
  scaleGrades,
  floorRate,
  benchmarkRate,
  busy,
  onPlanChange,
  onAimTimer,
  blockedReason,
}: {
  job: RestorationJobDTO;
  plan: TarsBenchPlan;
  scaleGrades: string[];
  floorRate: number;
  benchmarkRate: number | null;
  busy?: boolean;
  onPlanChange: (plan: TarsBenchPlan) => void;
  /** Point the clock at a grade, or at the item when the grade is empty. */
  onAimTimer: (grade: string) => void;
  /**
   * Why work cannot be moved right now, if it cannot. Set when the current
   * action has not been described — shown on the buttons it would block, so
   * the rule is visible before it is hit rather than after.
   */
  blockedReason?: string;
}) {
  const rows = useMemo(() => buildGradeRows(job, plan, scaleGrades), [job, plan, scaleGrades]);
  const best = useMemo(() => bestGrade(rows), [rows]);
  const aimed = job.timer_mode === 'work' ? job.timer_grade : '';
  const onItem = job.timer_mode !== 'work';

  function setEstimate(grade: string, patch: Partial<TarsGradeRow['estimate']>) {
    onPlanChange({
      ...plan,
      estimates: { ...plan.estimates, [grade]: { ...(plan.estimates[grade] ?? {}), ...patch } },
    });
  }

  return (
    <Box
      sx={{
        borderRadius: `${studio.radius.lg}px`,
        border: `1px solid ${studio.panelBorder}`,
        bgcolor: studio.panel,
        boxShadow: studio.panelShadow,
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: COLUMNS,
          gap: 1,
          alignItems: 'center',
          px: 1.25,
          py: 0.6,
          bgcolor: '#f8fafc',
          borderBottom: `1px solid ${studio.panelBorder}`,
        }}
      >
        {HEADINGS.map((label, i) => (
          <Typography
            key={label || i}
            sx={{
              fontSize: '0.6rem',
              fontWeight: 900,
              letterSpacing: 0.5,
              color: '#94a3b8',
              textAlign: i === 0 || i >= 5 ? 'left' : 'center',
            }}
          >
            {label}
          </Typography>
        ))}
      </Box>

      <ItemRow
        job={job}
        isAimed={onItem}
        busy={busy}
        blockedReason={onItem ? undefined : blockedReason}
        onAim={() => onAimTimer('')}
      />

      {rows.map((row) => (
        <GradeRow
          key={row.grade}
          row={row}
          isBest={best?.grade === row.grade}
          isAimed={aimed === row.grade}
          floorRate={floorRate}
          benchmarkRate={benchmarkRate}
          busy={busy}
          onEstimate={(patch) => setEstimate(row.grade, patch)}
          onAim={() => onAimTimer(row.grade)}
          blockedReason={row.grade === aimed ? undefined : blockedReason}
        />
      ))}

      {rows.length === 0 ? (
        <Typography sx={{ px: 1.25, py: 1.5, fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
          No grade scale on this item yet. Set one from the queue.
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * The item as a whole, above the grades it could reach.
 *
 * It has no odds or price of its own because it is not an outcome — it is the
 * thing every outcome is about. What it does have is somewhere for the work
 * that serves all of them to go.
 */
function ItemRow({
  job,
  isAimed,
  busy,
  blockedReason,
  onAim,
}: {
  job: RestorationJobDTO;
  isAimed: boolean;
  busy?: boolean;
  blockedReason?: string;
  onAim: () => void;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: COLUMNS,
        gap: 1,
        alignItems: 'center',
        px: 1.25,
        py: 0.65,
        borderBottom: `1px solid ${studio.panelBorder}`,
        borderLeft: `3px solid ${isAimed ? studio.accentDark : 'transparent'}`,
        bgcolor: isAimed ? studio.accentSoft : '#fcfdfe',
        '&:hover': { bgcolor: isAimed ? studio.accentSoft : '#f8fafc' },
      }}
    >
      <Typography noWrap sx={{ fontWeight: 900, fontSize: '0.85rem', color: '#0f172a' }}>
        The item
      </Typography>
      <Box />
      <Box />
      <Box />
      <Box />
      <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 800, color: '#64748b' }}>
        {formatDuration(job.look_seconds ?? 0)}
      </Typography>
      <Stack direction="row" spacing={0.4} flexWrap="wrap" useFlexGap>
        <MiniTag label="serves every grade" />
      </Stack>
      <WorkButton
        isAimed={isAimed}
        disabled={busy}
        blockedReason={blockedReason}
        hint="Work that informs every grade at once"
        onClick={onAim}
      />
    </Box>
  );
}

function GradeRow({
  row,
  isBest,
  isAimed,
  floorRate,
  benchmarkRate,
  busy,
  onEstimate,
  onAim,
  blockedReason,
}: {
  row: TarsGradeRow;
  isBest: boolean;
  isAimed: boolean;
  floorRate: number;
  benchmarkRate: number | null;
  busy?: boolean;
  onEstimate: (patch: Partial<TarsGradeRow['estimate']>) => void;
  onAim: () => void;
  blockedReason?: string;
}) {
  const band = BAND_COLORS[rateBand(row.rate, floorRate, benchmarkRate)];
  const impossible = row.estimate.p === 0;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: COLUMNS,
        gap: 1,
        alignItems: 'center',
        px: 1.25,
        py: 0.65,
        borderBottom: `1px solid ${studio.panelBorder}`,
        borderLeft: `3px solid ${isAimed ? studio.accentDark : isBest ? studio.accent : 'transparent'}`,
        bgcolor: isAimed ? studio.accentSoft : 'transparent',
        // Dim rather than hide: a grade ruled out is still an answer, and its
        // row must stay in place so the table never reflows under the hand.
        opacity: impossible || row.isStart ? 0.55 : 1,
        '&:last-of-type': { borderBottom: 'none' },
        '&:hover': { bgcolor: isAimed ? studio.accentSoft : '#f8fafc' },
      }}
    >
      <Typography noWrap sx={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>
        {row.grade}
      </Typography>

      <Typography
        sx={{
          fontFamily: 'monospace',
          fontWeight: 800,
          fontSize: '0.82rem',
          textAlign: 'center',
          color: row.price == null ? '#cbd5e1' : '#334155',
        }}
      >
        {row.price == null ? '—' : fmtUsd(row.price)}
      </Typography>

      <Box sx={{ display: 'grid', placeItems: 'center' }}>
        <PressPicker
          value={row.estimate.p}
          options={PROBABILITY_CHOICES}
          format={(v) => `${v}%`}
          placeholder="0%"
          ariaLabel={`Odds of reaching ${row.grade}`}
          disabled={busy || row.isStart}
          onChange={(p) => onEstimate({ p })}
        />
      </Box>

      <Box sx={{ display: 'grid', placeItems: 'center' }}>
        <PressPicker
          value={row.estimate.parts}
          options={PARTS_CHOICES}
          format={(v) => `$${v}`}
          placeholder="$0"
          ariaLabel={`Parts cost for ${row.grade}`}
          disabled={busy || row.isStart || impossible}
          onChange={(parts) => onEstimate({ parts })}
        />
      </Box>

      <Box sx={{ display: 'grid', placeItems: 'center' }}>
        <PressPicker
          value={row.estimate.minutes}
          options={MINUTES_CHOICES}
          format={(v) => `${v}m`}
          placeholder="—"
          width={66}
          ariaLabel={`Minutes of work for ${row.grade}`}
          disabled={busy || row.isStart || impossible}
          onChange={(minutes) => onEstimate({ minutes })}
        />
      </Box>

      <Tooltip
        arrow
        title={
          row.rate == null
            ? 'Needs a price, a starting grade and some minutes'
            : `${fmtUsd(row.expected ?? 0)} expected for the work left`
        }
      >
        <Stack direction="row" spacing={0.4} alignItems="baseline" sx={{ cursor: 'help', minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: 'monospace',
              fontWeight: 900,
              fontSize: '0.95rem',
              color: row.rate == null ? '#cbd5e1' : band.fg,
            }}
          >
            {row.rate == null ? '—' : fmtUsd(row.rate)}
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8' }}>/hr</Typography>
        </Stack>
      </Tooltip>

      <Stack direction="row" spacing={0.4} flexWrap="wrap" useFlexGap>
        {row.isStart ? <MiniTag label="it is here" /> : null}
        {isBest && !row.isStart ? <MiniTag label="best" good /> : null}
        {impossible && !row.isStart ? <MiniTag label="ruled out" /> : null}
        {row.toGo > 0 && !row.isStart && !impossible ? (
          <MiniTag label={`${row.toGo} to go`} warn />
        ) : null}
      </Stack>

      <WorkButton
        isAimed={isAimed}
        disabled={busy || row.isStart || impossible}
        blockedReason={blockedReason}
        hint={
          row.isStart
            ? 'The item is already here'
            : impossible
              ? 'You set this at no chance'
              : `Work toward ${row.grade}`
        }
        onClick={onAim}
      />
    </Box>
  );
}

/**
 * Starts the clock and opens an action in one press.
 *
 * Nothing is asked first. A new action defaults to Inspect with a blank
 * description, which is nearly always what the first minutes are, and the
 * writing-up happens in the Work panel while the work is fresh.
 */
function WorkButton({
  isAimed,
  disabled,
  blockedReason,
  hint,
  onClick,
}: {
  isAimed: boolean;
  disabled?: boolean;
  blockedReason?: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <Tooltip arrow title={blockedReason ?? hint}>
      <span>
        <Button
          fullWidth
          size="small"
          variant={isAimed ? 'contained' : 'outlined'}
          disabled={disabled || Boolean(blockedReason)}
          onClick={onClick}
          startIcon={<PlayArrow sx={{ fontSize: 15 }} />}
          sx={{
            textTransform: 'none',
            fontWeight: 900,
            fontSize: '0.72rem',
            py: 0.15,
            bgcolor: isAimed ? studio.accentDark : 'transparent',
            borderColor: studio.panelBorder,
            color: isAimed ? '#ffffff' : '#334155',
            '&:hover': { bgcolor: isAimed ? studio.accentDark : studio.accentSoft },
          }}
        >
          {isAimed ? 'On it' : 'Work'}
        </Button>
      </span>
    </Tooltip>
  );
}

function MiniTag({ label, warn, good }: { label: string; warn?: boolean; good?: boolean }) {
  const fg = warn ? '#8a5200' : good ? studio.accentDark : '#64748b';
  const bg = warn ? '#fdf2dc' : good ? studio.accentSoft : '#f1f5f9';
  const border = warn ? '#efd39a' : good ? studio.accentSoftBorder : '#e2e8f0';
  return (
    <Box
      sx={{
        px: 0.5,
        borderRadius: '4px',
        fontSize: '0.6rem',
        fontWeight: 900,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
        bgcolor: bg,
        color: fg,
        border: `1px solid ${border}`,
      }}
    >
      {label}
    </Box>
  );
}
