/**
 * Every grade the item could reach, in the order the scale lists them.
 *
 * Ashley's prices are given. Mike answers minutes. Parts dollars come from
 * the orders that target that grade — one number when the paths agree, a
 * range when they do not. Each order is its own path.
 *
 * Rows never move. An earlier version sorted by rate, which meant the table
 * rearranged itself under the hand every time an estimate changed; a row you
 * are reaching for should be where it was a second ago.
 *
 * Original and Current are claimed on the command deck. There is no per-grade
 * Work button — the table is prices and estimates only. Actions are on the
 * item, not on a row.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { PressPicker } from './studio/PressPicker';
import { BenchPaneHeader } from './studio/BenchPaneHeader';
import { PANEL, TYPE } from './studio/benchScale';
import { tarsPaneCardSx, tarsPaneScrollSx } from './tarsPaneScroll';
import {
  MINUTES_CHOICES,
  buildGradeRows,
  bestGrade,
  rateBand,
  type RateBand,
  type TarsBenchPlan,
  type TarsGradeRow,
} from './tarsBenchPlan';
import type { TarsPartsRange } from './tarsPartsOrders';
import { fmtUsd, fmtUsdRange } from './tarsProfit';
import { GRADE_ROLE, gradeRoleWash } from './tarsGradeRoles';

const BAND_COLORS: Record<RateBand, { fg: string; bg: string; border: string }> = {
  'below-cost': { fg: '#a13b34', bg: '#fbeeec', border: '#e6c3bd' },
  'below-usual': { fg: '#8a6420', bg: '#faf2e2', border: '#e4d2ac' },
  good: { fg: '#2e7d32', bg: '#eaf3ea', border: '#bcd8bd' },
  unknown: { fg: PANEL.faint, bg: PANEL.bgSubtle, border: PANEL.border },
};

// GRADE takes leftover width so ORIGINAL/CURRENT can sit beside the name.
// PARTS / MINS / WORTH stay fixed on the right edge of the pane.
const COLUMNS = 'minmax(0, 1fr) 72px 88px 52px 120px';
export const GRADE_TABLE_HEADINGS = ['GRADE', 'SELLS FOR', 'PARTS', 'MINS', 'WORTH'] as const;
const ROW_HEIGHT = 36;
const ROLE_SLOT = 88;

export function TarsGradeTable({
  job,
  plan,
  scaleGrades,
  floorRate,
  benchmarkRate,
  busy,
  partsRangeByGrade = {},
  onPlanChange,
}: {
  job: RestorationJobDTO;
  plan: TarsBenchPlan;
  scaleGrades: string[];
  floorRate: number;
  benchmarkRate: number | null;
  busy?: boolean;
  partsRangeByGrade?: Record<string, TarsPartsRange>;
  onPlanChange: (plan: TarsBenchPlan) => void;
}) {
  const rows = useMemo(
    () => buildGradeRows(job, plan, scaleGrades, partsRangeByGrade),
    [job, plan, scaleGrades, partsRangeByGrade],
  );
  const best = useMemo(() => bestGrade(rows), [rows]);

  function setEstimate(grade: string, patch: Partial<TarsGradeRow['estimate']>) {
    onPlanChange({
      ...plan,
      estimates: { ...plan.estimates, [grade]: { ...(plan.estimates[grade] ?? {}), ...patch } },
    });
  }

  return (
    <Box sx={tarsPaneCardSx}>
      <BenchPaneHeader
        kicker="Scale"
        value={job.scale || 'No scale yet'}
        mark
      />

      <Box
        sx={{
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: COLUMNS,
          gap: 0.75,
          alignItems: 'center',
          px: 1.25,
          py: 0.4,
          bgcolor: PANEL.bgSubtle,
          borderBottom: `1px solid ${PANEL.border}`,
        }}
      >
        {GRADE_TABLE_HEADINGS.map((label, i) => (
          <Typography
            key={label || i}
            sx={{
              ...TYPE.micro,
              color: PANEL.label,
              textAlign: i === 0 ? 'left' : i === GRADE_TABLE_HEADINGS.length - 1 ? 'right' : 'center',
            }}
          >
            {label}
          </Typography>
        ))}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, ...tarsPaneScrollSx }}>
        {rows.map((row) => (
          <GradeRow
            key={row.grade}
            row={row}
            isBest={best?.grade === row.grade}
            isOriginal={plan.startingGrade === row.grade}
            isCurrent={plan.currentGrade === row.grade}
            floorRate={floorRate}
            benchmarkRate={benchmarkRate}
            busy={busy}
            onEstimate={(patch) => setEstimate(row.grade, patch)}
          />
        ))}

        <Box sx={{ minHeight: rows.length === 0 ? 44 : 0, px: 1, py: rows.length === 0 ? 1 : 0 }}>
          {rows.length === 0 ? (
            <Typography sx={{ ...TYPE.body, color: PANEL.faint }}>
              No grade scale on this item yet. Set one from the queue.
            </Typography>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}

function GradeRow({
  row,
  isBest,
  isOriginal,
  isCurrent,
  floorRate,
  benchmarkRate,
  busy,
  onEstimate,
}: {
  row: TarsGradeRow;
  isBest: boolean;
  isOriginal: boolean;
  isCurrent: boolean;
  floorRate: number;
  benchmarkRate: number | null;
  busy?: boolean;
  onEstimate: (patch: Partial<TarsGradeRow['estimate']>) => void;
}) {
  const bandRate = row.hasPartsRange ? row.rateLow : row.rate;
  const band = BAND_COLORS[rateBand(bandRate, floorRate, benchmarkRate)];
  const partsLabel = row.partsFromList
    ? fmtUsdRange(row.partsDollars, row.partsDollarsMax)
    : 'No orders';
  const worthLabel =
    row.rate == null || row.rateLow == null
      ? '-'
      : fmtUsdRange(row.rateLow, row.rate);
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: COLUMNS,
        gap: 0.75,
        alignItems: 'center',
        px: 1.25,
        minHeight: ROW_HEIGHT,
        height: ROW_HEIGHT,
        borderBottom: `1px solid ${PANEL.border}`,
        borderLeft: `3px solid ${isBest ? PANEL.accent : 'transparent'}`,
        bgcolor: gradeRoleWash(isOriginal, isCurrent),
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ ...TYPE.value, minWidth: 0, color: PANEL.ink }}>
          {row.grade}
        </Typography>
        <Stack
          direction="row"
          spacing={0.3}
          sx={{ width: ROLE_SLOT, flexShrink: 0 }}
        >
          <RoleMark on={isOriginal} label="Original" kind="original" />
          <RoleMark on={isCurrent} label="Current" kind="current" />
        </Stack>
      </Stack>

      <Typography
        sx={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 800,
          fontSize: '0.84rem',
          textAlign: 'center',
          color: row.price == null ? PANEL.faint : PANEL.ink,
        }}
      >
        {row.price == null ? '-' : fmtUsd(row.price)}
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        <Box
          aria-label={`Parts cost for ${row.grade}`}
          sx={{
            boxSizing: 'border-box',
            minWidth: 72,
            height: 26,
            px: 0.75,
            borderRadius: '6px',
            border: `1px solid ${row.partsFromList ? '#bcd8bd' : PANEL.border}`,
            bgcolor: row.partsFromList ? '#eaf3ea' : PANEL.bgSubtle,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontWeight: 800,
            fontSize: row.partsFromList && row.hasPartsRange ? '0.68rem' : '0.75rem',
            fontVariantNumeric: 'tabular-nums',
            color: row.partsFromList ? PANEL.accent : PANEL.faint,
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
            textOverflow: 'ellipsis',
          }}
        >
          {partsLabel}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <PressPicker
          value={row.estimate.minutes ?? 0}
          options={MINUTES_CHOICES}
          format={(v) => `${v}m`}
          placeholder="0m"
          width={52}
          height={26}
          ariaLabel={`Minutes of work for ${row.grade}`}
          disabled={busy}
          onChange={(minutes) => onEstimate({ minutes })}
        />
      </Box>

      <Tooltip
        arrow
        title={
          row.rate == null
            ? 'Needs a price and some minutes'
            : row.hasPartsRange
              ? `${fmtUsdRange(row.expectedMax ?? 0, row.expected ?? 0)} expected for the work left`
              : `${fmtUsd(row.expected ?? 0)} expected for the work left`
        }
      >
        <Box
          sx={{
            justifySelf: 'end',
            width: 'auto',
            minWidth: 88,
            height: 26,
            px: 0.75,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            borderRadius: '6px',
            bgcolor: band.bg,
            border: `1px solid ${band.border}`,
            cursor: 'help',
          }}
        >
          <Typography
            noWrap
            sx={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: 800,
              fontSize: row.hasPartsRange ? '0.68rem' : '0.82rem',
              lineHeight: '18px',
              color: row.rate == null ? PANEL.faint : band.fg,
            }}
          >
            {worthLabel}
          </Typography>
          <Typography
            sx={{
              flexShrink: 0,
              fontSize: '0.58rem',
              lineHeight: '14px',
              fontWeight: 800,
              color: band.fg,
              opacity: 0.7,
            }}
          >
            /hr
          </Typography>
        </Box>
      </Tooltip>
    </Box>
  );
}

function RoleMark({
  on,
  label,
  kind,
}: {
  on: boolean;
  label: string;
  kind: 'original' | 'current';
}) {
  const paint = GRADE_ROLE[kind];
  return (
    <Typography
      sx={{
        fontSize: '0.58rem',
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        minWidth: 44,
        px: 0.4,
        borderRadius: '4px',
        border: `1px solid ${on ? paint.border : 'transparent'}`,
        bgcolor: on ? paint.wash : 'transparent',
        color: on ? paint.ink : 'transparent',
      }}
    >
      {label}
    </Typography>
  );
}
