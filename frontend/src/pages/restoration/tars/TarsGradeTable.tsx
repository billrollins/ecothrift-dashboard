/**
 * The bench: one item, one table, one decision.
 *
 * Every grade the item could reach is a row. Ashley's prices are given; Mike
 * answers three things per row — how likely, what parts, how long — and the
 * rows sort themselves by what each is worth per hour. The top row is the
 * answer.
 *
 * Aiming the clock at a row is the decision. There is no separate commit step,
 * because the record of what was chosen and the act of choosing it should not
 * be two pieces of work.
 */
import PauseCircle from '@mui/icons-material/PauseCircle';
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

const COLUMNS = 'minmax(120px, 1.2fr) 74px 62px 62px 66px minmax(96px, 0.8fr) 92px';

export function TarsGradeTable({
  job,
  plan,
  scaleGrades,
  floorRate,
  benchmarkRate,
  busy,
  onPlanChange,
  onAimTimer,
  onPauseTimer,
  blockedReason,
}: {
  job: RestorationJobDTO;
  plan: TarsBenchPlan;
  scaleGrades: string[];
  floorRate: number;
  benchmarkRate: number | null;
  busy?: boolean;
  onPlanChange: (plan: TarsBenchPlan) => void;
  /** Point the clock at a grade. This is the decision. */
  onAimTimer: (grade: string) => void;
  onPauseTimer: () => void;
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

  function setEstimate(grade: string, patch: Partial<TarsGradeRow['estimate']>) {
    onPlanChange({
      ...plan,
      estimates: { ...plan.estimates, [grade]: { ...(plan.estimates[grade] ?? {}), ...patch } },
    });
  }

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      <StartingGradeBar
        rows={rows}
        plan={plan}
        job={job}
        aimed={aimed}
        looking={job.timer_is_running && job.timer_mode === 'look'}
        busy={busy}
        onPick={(grade) => onPlanChange({ ...plan, startingGrade: grade })}
        onLook={() => onAimTimer('')}
        onPause={onPauseTimer}
        blockedReason={job.timer_mode === 'look' ? undefined : blockedReason}
      />

      <Box
        sx={{
          borderRadius: `${studio.radius.lg}px`,
          border: `1px solid ${studio.panelBorder}`,
          bgcolor: studio.panel,
          boxShadow: studio.panelShadow,
          overflow: 'hidden',
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
          {['GRADE', 'SELLS FOR', 'ODDS', 'PARTS', 'MINS', 'WORTH', ''].map((label, i) => (
            <Typography
              key={label || i}
              sx={{
                fontSize: '0.6rem',
                fontWeight: 900,
                letterSpacing: 0.5,
                color: '#94a3b8',
                textAlign: i === 0 || i === 5 ? 'left' : 'center',
              }}
            >
              {label}
            </Typography>
          ))}
        </Box>

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
      </Box>
    </Stack>
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
      <Stack direction="row" spacing={0.6} alignItems="center" sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontWeight: 800, fontSize: '0.85rem', color: '#0f172a' }}>
          {row.grade}
        </Typography>
        {row.isStart ? <MiniTag label="now" /> : null}
        {row.toGo > 0 && !row.isStart ? <MiniTag label={`${row.toGo} to go`} warn /> : null}
      </Stack>

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
        <Stack direction="row" spacing={0.5} alignItems="baseline" sx={{ cursor: 'help', minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: 'monospace',
              fontWeight: 900,
              fontSize: '0.95rem',
              color: row.rate == null ? '#cbd5e1' : band.fg,
            }}
          >
            {row.rate == null ? '—' : `${fmtUsd(row.rate)}`}
          </Typography>
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: '#94a3b8' }}>/hr</Typography>
        </Stack>
      </Tooltip>

      <Tooltip
        arrow
        title={
          blockedReason
            ?? (row.isStart
              ? 'The item is already here'
              : impossible
                ? 'You set this at no chance'
                : '')
        }
      >
        <span>
          <Button
            size="small"
            variant={isAimed ? 'contained' : 'outlined'}
            disabled={busy || row.isStart || impossible || Boolean(blockedReason)}
            onClick={onAim}
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
    </Box>
  );
}

/**
 * Where the item is now, and the clock that is not yet aimed at a grade.
 *
 * Looking is charged to the item, never to a row: one teardown informs every
 * grade at once, so splitting it between them would be a fiction.
 */
function StartingGradeBar({
  rows,
  plan,
  job,
  aimed,
  looking,
  busy,
  onPick,
  onLook,
  onPause,
  blockedReason,
}: {
  rows: TarsGradeRow[];
  plan: TarsBenchPlan;
  job: RestorationJobDTO;
  aimed: string;
  looking: boolean;
  busy?: boolean;
  onPick: (grade: string) => void;
  onLook: () => void;
  onPause: () => void;
  blockedReason?: string;
}) {
  const lookMinutes = Math.round((job.look_seconds ?? 0) / 60);
  const workMinutes = Math.round((job.work_seconds ?? 0) / 60);

  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      flexWrap="wrap"
      useFlexGap
      sx={{
        px: 1.25,
        py: 0.75,
        borderRadius: `${studio.radius.lg}px`,
        border: `1px solid ${plan.startingGrade ? studio.panelBorder : '#e3b23c'}`,
        bgcolor: studio.panel,
        boxShadow: studio.panelShadow,
      }}
    >
      <Typography sx={{ fontSize: '0.62rem', fontWeight: 900, letterSpacing: 0.5, color: '#94a3b8' }}>
        IT IS AT
      </Typography>

      <Stack direction="row" spacing={0.4}>
        {rows.map((row) => {
          const active = plan.startingGrade === row.grade;
          return (
            <Box
              key={row.grade}
              component="button"
              type="button"
              disabled={busy}
              onClick={() => onPick(row.grade)}
              sx={{
                px: 0.85,
                py: 0.3,
                cursor: 'pointer',
                fontSize: '0.74rem',
                fontWeight: 800,
                borderRadius: `${studio.radius.sm}px`,
                border: `1px solid ${active ? studio.accentDark : '#e2e8f0'}`,
                bgcolor: active ? studio.accentDark : '#ffffff',
                color: active ? '#ffffff' : '#64748b',
                '&:hover:not(:disabled)': { borderColor: studio.accent },
              }}
            >
              {row.grade}
            </Box>
          );
        })}
      </Stack>

      <Box sx={{ flex: 1, minWidth: 8 }} />

      <Tooltip arrow title="Time charged to the item as a whole, and to grades">
        <Typography sx={{ fontSize: '0.7rem', color: '#7c8899', fontWeight: 700, fontFamily: 'monospace' }}>
          item {lookMinutes}m · grades {workMinutes}m
        </Typography>
      </Tooltip>

      <Tooltip arrow title={blockedReason ?? 'Work on the item as a whole, not one grade'}>
        <span>
          <Button
            size="small"
            variant={looking ? 'contained' : 'outlined'}
            disabled={busy || Boolean(blockedReason)}
            onClick={onLook}
            sx={{
              textTransform: 'none',
              fontWeight: 900,
              fontSize: '0.72rem',
              py: 0.15,
              bgcolor: looking ? studio.accentDark : 'transparent',
              borderColor: studio.panelBorder,
              color: looking ? '#ffffff' : '#334155',
              '&:hover': { bgcolor: looking ? studio.accentDark : studio.accentSoft },
            }}
          >
            {looking ? 'On the item' : 'Work on item'}
          </Button>
        </span>
      </Tooltip>

      <Button
        size="small"
        variant="outlined"
        disabled={busy || !job.timer_is_running}
        onClick={onPause}
        startIcon={<PauseCircle sx={{ fontSize: 15 }} />}
        sx={{
          textTransform: 'none',
          fontWeight: 900,
          fontSize: '0.72rem',
          py: 0.15,
          borderColor: studio.panelBorder,
          color: '#334155',
        }}
      >
        Stop
      </Button>

      {aimed ? <MiniTag label={`clock on ${aimed}`} /> : null}
    </Stack>
  );
}

function MiniTag({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <Box
      sx={{
        px: 0.5,
        borderRadius: '4px',
        fontSize: '0.6rem',
        fontWeight: 900,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
        bgcolor: warn ? '#fdf2dc' : studio.accentSoft,
        color: warn ? '#8a5200' : studio.accentDark,
        border: `1px solid ${warn ? '#efd39a' : studio.accentSoftBorder}`,
      }}
    >
      {label}
    </Box>
  );
}
