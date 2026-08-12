/**
 * One item, as a full-width row you can read across and edit in place.
 *
 * The row does two jobs at once. Read left to right it answers what the item
 * is, what it is worth and how long it has waited — enough to choose what to
 * pick up next. Every field in the middle is live, so the person who spots a
 * gap fills it where they stand instead of opening anything.
 *
 * The left edge is coloured by which list the item is in, so a glance tells you
 * where you are without reading the tab.
 */
import ArrowForward from '@mui/icons-material/ArrowForward';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { PressPicker } from '../tars/studio/PressPicker';
import { studio } from '../tars/studio/tarsStudioTheme';
import { fmtUsd } from '../tars/tarsProfit';
import { FIELD_HEIGHT, FieldLabel, MoneyCell, NoteCell } from './QueueInlineCells';
import {
  DESTINATION_IDS,
  destinationLabel,
  formatWaiting,
  handoffSummary,
  isStale,
  missingGrades,
  valuePotential,
} from './restorationQueueModel';

export interface QueueEdit {
  scale?: string;
  grade_values?: Record<string, number>;
  intended_destination?: string;
  queue_note?: string;
}

/**
 * Wide enough for every field to sit on one line. Below this the row folds
 * into two, which is a layout change rather than a state change — the row is
 * still a fixed shape for any given screen.
 */
const WIDE = 'minmax(210px, 1.25fr) minmax(150px, 0.95fr) 112px minmax(230px, 1.3fr) 92px 62px 96px';

export function RestorationQueueCard({
  job,
  scales,
  accent,
  busy,
  onEdit,
  onStart,
}: {
  job: RestorationJobDTO;
  scales: Record<string, string[]>;
  /** The colour of the list this row is in. */
  accent: string;
  busy?: boolean;
  onEdit: (jobId: number, patch: QueueEdit) => void;
  onStart?: (job: RestorationJobDTO) => void;
}) {
  const scaleGrades = scales[job.scale] ?? [];
  const grades = scaleGrades.length > 0 ? scaleGrades : Object.keys(job.grade_values ?? {});
  const missing = missingGrades(job, scaleGrades);
  const ready = Boolean(job.scale) && missing.length === 0;
  const potential = valuePotential(job);
  const stale = isStale(job);
  const sku = job.items[0]?.sku ?? job.sku ?? `Job ${job.id}`;

  const scaleNames = useMemo(() => Object.keys(scales), [scales]);

  function setGrade(grade: string, value: number | null) {
    const next: Record<string, number> = {};
    for (const [key, existing] of Object.entries(job.grade_values ?? {})) {
      if (typeof existing === 'number' && Number.isFinite(existing)) next[key] = existing;
    }
    if (value == null) delete next[grade];
    else next[grade] = value;
    onEdit(job.id, { grade_values: next });
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: WIDE },
        alignItems: 'center',
        columnGap: 1.5,
        rowGap: 1,
        width: '100%',
        px: 1.5,
        py: 1,
        bgcolor: studio.panel,
        borderRadius: `${studio.radius.lg}px`,
        border: `1px solid ${studio.panelBorder}`,
        borderLeft: `5px solid ${accent}`,
        boxShadow: studio.panelShadow,
        transition: 'border-color 120ms',
        '&:hover': { borderColor: studio.accent, borderLeftColor: accent },
      }}
    >
      {/* What it is */}
      <Stack spacing={0.1} sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={0.85} alignItems="baseline" sx={{ minWidth: 0 }}>
          <Typography
            sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.74rem', color: accent }}
          >
            {sku}
          </Typography>
          <Typography noWrap sx={{ fontWeight: 800, fontSize: '0.95rem', color: '#0f172a', minWidth: 0 }}>
            {job.name}
          </Typography>
        </Stack>
        <Typography noWrap sx={{ fontSize: '0.71rem', color: '#8593a5' }}>
          {handoffSummary(job)}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ height: 18, alignItems: 'center' }}>
          <Tag label={ready ? 'ready' : `needs ${missing.length || 'a scale'}`} warn={!ready} />
          <Typography sx={{ fontSize: '0.68rem', color: '#8593a5', fontWeight: 700 }}>
            retail {job.retail ? fmtUsd(Number(job.retail)) : '—'}
          </Typography>
        </Stack>
      </Stack>

      {/* Note */}
      <NoteCell
        label="Note"
        value={job.queue_note ?? ''}
        placeholder="add a note…"
        disabled={busy}
        onCommit={(queue_note) => onEdit(job.id, { queue_note })}
      />

      {/* Where it goes */}
      <Box sx={{ minWidth: 0 }}>
        <FieldLabel muted={!job.intended_destination}>Destination</FieldLabel>
        <PressPicker
          value={job.intended_destination || undefined}
          options={DESTINATION_IDS}
          format={destinationLabel}
          placeholder="pick one"
          width="100%"
          height={FIELD_HEIGHT}
          disabled={busy}
          ariaLabel={`Destination for ${job.name}`}
          onChange={(intended_destination) => onEdit(job.id, { intended_destination })}
        />
      </Box>

      {/* What it sells for at each grade */}
      <Stack direction="row" spacing={0.75} alignItems="flex-end" flexWrap="wrap" useFlexGap sx={{ minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <FieldLabel muted={!job.scale}>Scale</FieldLabel>
          <PressPicker
            value={job.scale || undefined}
            options={scaleNames}
            format={(name) => name}
            placeholder="pick one"
            width={104}
            height={FIELD_HEIGHT}
            disabled={busy}
            ariaLabel={`Grade scale for ${job.name}`}
            onChange={(scale) => onEdit(job.id, { scale })}
          />
        </Box>

        {grades.map((grade) => {
          const raw = job.grade_values?.[grade];
          return (
            <MoneyCell
              key={grade}
              label={grade}
              value={typeof raw === 'number' && Number.isFinite(raw) ? raw : null}
              disabled={busy}
              onCommit={(value) => setGrade(grade, value)}
            />
          );
        })}
      </Stack>

      {/* What is riding on it */}
      <Tooltip
        arrow
        title="Best grade minus worst. What is on the table if the work goes well, against doing nothing."
      >
        <Stack spacing={0} sx={{ alignItems: { xs: 'flex-start', lg: 'flex-end' }, cursor: 'help' }}>
          <Typography
            sx={{
              fontFamily: 'monospace',
              fontWeight: 900,
              fontSize: '1.45rem',
              lineHeight: 1.1,
              color: potential == null ? '#c3ccd8' : '#0f172a',
            }}
          >
            {potential == null ? '—' : fmtUsd(potential)}
          </Typography>
          <Typography sx={{ fontSize: '0.56rem', color: '#8593a5', fontWeight: 900, letterSpacing: 0.4 }}>
            AT STAKE
          </Typography>
        </Stack>
      </Tooltip>

      {/* How long it has waited */}
      <Stack spacing={0} sx={{ alignItems: { xs: 'flex-start', lg: 'center' } }}>
        <Typography
          sx={{
            fontFamily: 'monospace',
            fontWeight: 900,
            fontSize: '0.95rem',
            color: stale ? '#b26a00' : '#64748b',
          }}
        >
          {formatWaiting(job)}
        </Typography>
        <Typography sx={{ fontSize: '0.56rem', color: '#8593a5', fontWeight: 900, letterSpacing: 0.4 }}>
          WAITING
        </Typography>
      </Stack>

      {/* Action, or nothing where there is none to take */}
      <Box>
        {onStart ? (
          <Tooltip arrow title={ready ? '' : 'Fill in the missing prices first'} disableHoverListener={ready}>
            <span>
              <Button
                fullWidth
                size="small"
                variant="contained"
                disabled={!ready || busy}
                endIcon={<ArrowForward sx={{ fontSize: 15 }} />}
                onClick={() => onStart(job)}
                sx={{
                  textTransform: 'none',
                  fontWeight: 900,
                  fontSize: '0.75rem',
                  bgcolor: studio.accentDark,
                  '&:hover': { bgcolor: studio.accentDark },
                }}
              >
                Bench
              </Button>
            </span>
          </Tooltip>
        ) : null}
      </Box>
    </Box>
  );
}

function Tag({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <Box
      sx={{
        px: 0.6,
        borderRadius: '4px',
        fontSize: '0.62rem',
        fontWeight: 800,
        lineHeight: '17px',
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
