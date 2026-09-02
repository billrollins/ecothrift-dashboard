/**
 * One item, as a full-width row you can read across and edit in place.
 *
 * The row does two jobs at once. Read left to right it answers what the item
 * is, what it is worth and how long it has waited - enough to choose what to
 * pick up next. Every field in the middle is live, so the person who spots a
 * gap fills it where they stand instead of opening anything.
 *
 * The left edge is coloured by which list the item is in, so a glance tells you
 * where you are without reading the tab.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useMemo, useState, type ReactNode } from 'react';
import { ItemNotesDrawer } from '../../../components/notes/ItemNotesDrawer';
import { JobNotesSlot } from '../../../components/notes/JobNotesSlot';
import { NotesBadge } from '../../../components/notes/NotesBadge';
import { useJobNotes } from '../../../hooks/useItemNotes';
import type { RestorationJobDTO } from '../../../types/inventory.types';
import { PressPicker } from '../tars/studio/PressPicker';
import { studio } from '../tars/studio/tarsStudioTheme';
import { fmtUsd } from '../tars/tarsProfit';
import { FIELD_HEIGHT, FieldLabel, MoneyCell, NoteCell, NOTE_HEIGHT_PX } from './QueueInlineCells';
import { DispatchButtons } from './DispatchButtons';
import { dispatchOptions, type DispatchOption } from './queueDispatch';
import type { TarsHistoryFilter } from '../tars/tarsBenchHistory';
import {
  DESTINATION_IDS,
  destinationLabel,
  destinationPaint,
  dollarsToRetailPercent,
  formatWaiting,
  isStale,
  gradePrice,
  benchDispositionLabel,
  itemKindLine,
  benchOwnerLine,
  jobRetail,
  retailPercentToDollars,
  valuePotential,
} from './restorationQueueModel';

export interface QueueEdit {
  scale?: string;
  grade_values?: Record<string, number>;
  intended_destination?: string;
  bench_disposition?: string;
  queue_note?: string;
}

/**
 * Wide enough for every field to sit on one line. Below this the row folds
 * into two, which is a layout change rather than a state change - the row is
 * still a fixed shape for any given screen.
 *
 * Exported so the column headers sit on the same tracks as the cards.
 */
export const QUEUE_CARD_COLUMNS =
  'minmax(190px, 1.15fr) minmax(140px, 0.85fr) 128px 128px minmax(200px, 1.2fr) 128px 116px minmax(228px, 0.9fr)';

const SECTION_RULE = studio.rule;
const CARD_HOVER_SHADOW = '0 4px 10px rgba(0,0,0,0.14), 0 2px 4px rgba(0,0,0,0.10)';

/** Row background opens history. Edits and Dispatch stay edits. */
export function isQueueHistorySelectTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest('input, textarea, select, button, [data-press-option]') == null;
}

export function RestorationQueueCard({
  job,
  scales,
  accent,
  busy,
  occupyingBenchJob,
  onOpenHistory,
  onOpenWork,
  onEdit,
  onDispatch,
  layout = 'row',
  formAction,
}: {
  job: RestorationJobDTO;
  scales: Record<string, string[]>;
  /** The colour of the list this row is in. */
  accent: string;
  busy?: boolean;
  occupyingBenchJob?: RestorationJobDTO | null;
  onOpenHistory?: (job: RestorationJobDTO, filter?: TarsHistoryFilter) => void;
  /** Bench chrome goes to the bench. Notes still use onOpenHistory. */
  onOpenWork?: (job: RestorationJobDTO) => void;
  onEdit: (jobId: number, patch: QueueEdit) => void;
  onDispatch?: (job: RestorationJobDTO, option: DispatchOption) => void;
  /**
   * `row` is the overview list. `form` is the same fields, stacked, without
   * Waiting or Dispatch - those belong to the list, not a single-item sheet.
   */
  layout?: 'row' | 'form';
  /** Sits opposite at-stake on the form footer. Always reserve the slot. */
  formAction?: ReactNode;
}) {
  const scaleGrades = scales[job.scale] ?? [];
  const grades = scaleGrades.length > 0 ? scaleGrades : Object.keys(job.grade_values ?? {});
  const finished = job.stage === 'done';
  const locked = Boolean(busy || finished);
  const noteLocked = Boolean(busy);
  const potential = valuePotential(job);
  const stale = isStale(job);
  const sku = job.items[0]?.sku ?? job.sku ?? `Job ${job.id}`;
  const owner = benchOwnerLine(job);
  const destinations = useMemo(
    () => dispatchOptions(job, { scaleGrades, occupyingBenchJob: occupyingBenchJob ?? null }),
    [job, scaleGrades, occupyingBenchJob],
  );

  const scaleNames = useMemo(() => Object.keys(scales), [scales]);
  const form = layout === 'form';
  const notes = useJobNotes(form ? null : job.id);
  const [notesOpen, setNotesOpen] = useState(false);
  const itemId = job.items[0]?.id ?? null;

  function setGrade(grade: string, value: number | null) {
    const next: Record<string, number> = {};
    for (const [key, existing] of Object.entries(job.grade_values ?? {})) {
      const priced = gradePrice(existing);
      if (priced != null) next[key] = priced;
    }
    if (value == null) delete next[grade];
    else next[grade] = value;
    onEdit(job.id, { grade_values: next });
  }

  if (form) {
    return (
      <QuickGradeForm
        job={job}
        scaleNames={scaleNames}
        grades={grades}
        accent={accent}
        locked={locked}
        busy={busy}
        potential={potential}
        sku={sku}
        formAction={formAction}
        onEdit={onEdit}
      />
    );
  }

  return (
    <Box
      data-restoration-job={job.id}
      onClick={(event) => {
        if (!isQueueHistorySelectTarget(event.target)) return;
        if (job.stage === 'bench' && onOpenWork) {
          onOpenWork(job);
          return;
        }
        onOpenHistory?.(job);
      }}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: QUEUE_CARD_COLUMNS },
        alignItems: 'stretch',
        columnGap: 0,
        rowGap: 0,
        width: '100%',
        px: 1.25,
        py: 0.5,
        bgcolor: studio.panel,
        borderRadius: `${studio.radius.lg}px`,
        border: `1.5px solid ${studio.panelBorder}`,
        borderLeft: `5px solid ${accent}`,
        boxShadow: studio.panelShadow,
        position: 'relative',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: CARD_HOVER_SHADOW,
          zIndex: 1,
        },
      }}
    >
      {/* What it is */}
      <QueueSection first>
        <Stack spacing={0} sx={{ flex: 1, minWidth: 0, minHeight: NOTE_HEIGHT_PX, pr: 0.75 }}>
          <Stack
            direction="row"
            spacing={0.85}
            alignItems="baseline"
            sx={{ minWidth: 0 }}
          >
            <Typography
              sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.74rem', color: accent }}
            >
              {sku}
            </Typography>
            <Typography
              noWrap
              sx={{
                fontWeight: 800,
                fontSize: '0.95rem',
                lineHeight: 1.2,
                color: studio.ink,
                minWidth: 0,
              }}
            >
              {job.name}
            </Typography>
          </Stack>
          <Typography noWrap sx={{ fontSize: '0.71rem', color: studio.inkMuted }}>
            {finished
              ? [job.final_grade, benchDispositionLabel(job.bench_disposition)].filter(Boolean).join(' · ') ||
                'Waiting for Processing'
              : itemKindLine(job)}
          </Typography>
          <Typography
            noWrap
            aria-label={owner.aria}
            sx={{
              fontSize: '0.68rem',
              fontWeight: owner.kind === 'owner' ? 800 : 600,
              lineHeight: '18px',
              color:
                owner.kind === 'owner'
                  ? accent
                  : owner.kind === 'unclaimed'
                    ? studio.warning
                    : studio.inkFaint,
            }}
          >
            {owner.label}
          </Typography>
          <Typography
            sx={{
              fontSize: '0.68rem',
              color: studio.inkMuted,
              fontWeight: 700,
              lineHeight: '18px',
            }}
          >
            retail {job.retail ? fmtUsd(Number(job.retail)) : '-'}
          </Typography>
        </Stack>
      </QueueSection>

      {/* Note */}
      <QueueSection>
        <Box sx={{ position: 'relative', width: '100%', minHeight: NOTE_HEIGHT_PX }}>
          <NoteCell
            label="Note"
            padEnd
            value={job.queue_note ?? ''}
            placeholder="add a note…"
            disabled={noteLocked}
            onCommit={(queue_note) => onEdit(job.id, { queue_note })}
          />
          <Box sx={{ position: 'absolute', top: 3, right: 3, zIndex: 1 }}>
            <NotesBadge
              compact
              count={notes.data?.length ?? 0}
              onClick={() => {
                if (onOpenHistory) {
                  onOpenHistory(job, 'notes');
                  return;
                }
                setNotesOpen(true);
              }}
            />
          </Box>
        </Box>
        {notesOpen && onOpenHistory == null ? (
          <ItemNotesDrawer
            open={notesOpen}
            jobId={job.id}
            itemId={itemId}
            title={`Notes · ${sku}`}
            onClose={() => setNotesOpen(false)}
          />
        ) : null}
      </QueueSection>

      <QueueSection>
        <PressPicker
          value={
            finished
              ? (job.bench_disposition || undefined)
              : (job.intended_destination || undefined)
          }
          options={finished ? (['processing', 'storage', 'salvage', 'online_sales'] as const) : DESTINATION_IDS}
          format={finished ? benchDispositionLabel : destinationLabel}
          placeholder="pick one"
          width="100%"
          height={FIELD_HEIGHT}
          paint={destinationPaint}
          disabled={busy}
          ariaLabel={`Destination for ${job.name}`}
          onChange={(next) => {
            if (finished) {
              onEdit(job.id, { bench_disposition: next });
              return;
            }
            onEdit(job.id, { intended_destination: next });
          }}
        />
      </QueueSection>

      <QueueSection>
        <PressPicker
          variant="key"
          layout="menu"
          value={job.scale || undefined}
          options={scaleNames}
          format={(name) => name}
          placeholder="choose…"
          width="100%"
          height={FIELD_HEIGHT}
          disabled={locked}
          ariaLabel={`Grade scale for ${job.name}`}
          onChange={(scale) => onEdit(job.id, { scale })}
        />
      </QueueSection>

      <QueueSection>
        <Stack
          direction="row"
          spacing={0.75}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ minWidth: 0, minHeight: NOTE_HEIGHT_PX }}
        >
          {grades.map((grade) => {
            const raw = gradePrice(job.grade_values?.[grade]);
            return (
              <MoneyCell
                key={grade}
                label={grade}
                value={raw}
                disabled={locked}
                width={58}
                onCommit={(value) => setGrade(grade, value)}
              />
            );
          })}
        </Stack>
      </QueueSection>

      <QueueSection>
        <Tooltip
          arrow
          title="Best grade minus worst. What is on the table if the work goes well, against doing nothing."
        >
          <Stack spacing={0} sx={{ alignItems: { xs: 'flex-start', lg: 'center' }, cursor: 'help' }}>
            <Typography
              sx={{
                fontFamily: 'monospace',
                fontWeight: 900,
                fontSize: '1.45rem',
                lineHeight: 1.1,
                color: potential == null ? studio.inkFaint : studio.ink,
              }}
            >
              {potential == null ? '-' : fmtUsd(potential)}
            </Typography>
            <Typography sx={{ fontSize: '0.62rem', color: studio.inkLabel, fontWeight: 800, letterSpacing: 0.4 }}>
              AT STAKE
            </Typography>
          </Stack>
        </Tooltip>
      </QueueSection>

      <QueueSection>
        <Stack spacing={0} sx={{ alignItems: { xs: 'flex-start', lg: 'center' } }}>
          <Typography
            sx={{
              fontFamily: 'monospace',
              fontWeight: 900,
              fontSize: '0.95rem',
              color: stale ? '#7a3d00' : studio.ink,
            }}
          >
            {formatWaiting(job)}
          </Typography>
          <Typography sx={{ fontSize: '0.62rem', color: studio.inkLabel, fontWeight: 800, letterSpacing: 0.4 }}>
            WAITING
          </Typography>
        </Stack>
      </QueueSection>

      <QueueSection>
        <DispatchButtons
          options={destinations}
          name={job.name}
          busy={busy}
          onPick={(option) => onDispatch?.(job, option)}
        />
      </QueueSection>
    </Box>
  );
}

type PriceMode = 'usd' | 'pct';

function QuickGradeForm({
  job,
  scaleNames,
  grades,
  accent,
  locked,
  busy,
  potential,
  sku,
  formAction,
  onEdit,
}: {
  job: RestorationJobDTO;
  scaleNames: string[];
  grades: string[];
  accent: string;
  locked: boolean;
  busy?: boolean;
  potential: number | null;
  sku: string;
  formAction?: ReactNode;
  onEdit: (jobId: number, patch: QueueEdit) => void;
}) {
  const retail = jobRetail(job);
  const [priceMode, setPriceMode] = useState<PriceMode>('usd');
  const mode: PriceMode = priceMode === 'pct' && retail != null ? 'pct' : 'usd';

  function setGrade(grade: string, display: number | null) {
    const dollars =
      display == null
        ? null
        : mode === 'pct' && retail != null
          ? retailPercentToDollars(display, retail)
          : display;
    const next: Record<string, number> = {};
    for (const [key, existing] of Object.entries(job.grade_values ?? {})) {
      const priced = gradePrice(existing);
      if (priced != null) next[key] = priced;
    }
    if (dollars == null) delete next[grade];
    else next[grade] = dollars;
    onEdit(job.id, { grade_values: next });
  }

  return (
    <Stack spacing={1.15} sx={{ width: '100%' }}>
      <FormPanel accent={accent} inset>
        <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
          <Stack spacing={0} sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '0.74rem', color: accent }}>
              {sku}
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2, color: studio.ink, mt: 0.15 }}>
              {job.name}
            </Typography>
            <Typography sx={{ fontSize: '0.71rem', color: studio.inkMuted, mt: 0.4 }}>
              {itemKindLine(job)}
            </Typography>
          </Stack>
          <Stack
            spacing={0}
            sx={{
              flexShrink: 0,
              minWidth: 128,
              pr: 0.75,
              justifyContent: 'center',
              alignItems: 'flex-end',
              textAlign: 'right',
            }}
          >
            <FieldLabel>Retail</FieldLabel>
            <Typography
              sx={{
                fontFamily: 'monospace',
                fontWeight: 900,
                fontSize: '2rem',
                lineHeight: 1,
                letterSpacing: '-0.03em',
                color: retail == null ? studio.inkFaint : studio.ink,
              }}
            >
              {retail == null ? '-' : fmtUsd(retail)}
            </Typography>
          </Stack>
        </Stack>
      </FormPanel>

      <FormPanel label="Destination">
        <Stack
          direction="row"
          spacing={0.6}
          flexWrap="wrap"
          useFlexGap
          role="group"
          aria-label={`Destination for ${job.name}`}
          sx={{ minHeight: FIELD_HEIGHT }}
        >
          {DESTINATION_IDS.map((id) => {
            const paint = destinationPaint(id);
            const active = job.intended_destination === id;
            return (
              <Box
                key={id}
                component="button"
                type="button"
                disabled={busy}
                aria-pressed={active}
                onClick={() => onEdit(job.id, { intended_destination: id })}
                sx={{
                  minHeight: FIELD_HEIGHT,
                  px: 1.2,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  borderRadius: `${studio.radius.md}px`,
                  border: `1.5px solid ${active ? (paint?.strong ?? studio.accentDark) : studio.panelBorder}`,
                  bgcolor: active ? (paint?.strong ?? studio.accentDark) : studio.panel,
                  color: active ? (paint?.onStrong ?? '#fff') : studio.inkMuted,
                  outline: 'none',
                  '&:focus-visible': {
                    boxShadow: `0 0 0 2px ${paint?.bgcolor ?? studio.accentSoft}`,
                  },
                }}
              >
                {destinationLabel(id)}
              </Box>
            );
          })}
        </Stack>
      </FormPanel>

      <FormPanel
        label="Grade"
        action={
          <PriceModeToggle
            mode={mode}
            percentEnabled={retail != null}
            onChange={setPriceMode}
          />
        }
      >
        <Box
          sx={{
            px: 1.1,
            py: 1,
            borderRadius: `${studio.radius.md}px`,
            bgcolor: studio.accentSoft,
          }}
        >
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ minWidth: 0, minHeight: NOTE_HEIGHT_PX }}
          >
            <PressPicker
              variant="key"
              layout="menu"
              value={job.scale || undefined}
              options={scaleNames}
              format={(name) => name}
              placeholder="choose…"
              width={132}
              height={FIELD_HEIGHT}
              disabled={locked}
              ariaLabel={`Grade scale for ${job.name}`}
              onChange={(scale) => onEdit(job.id, { scale })}
            />
            {grades.map((grade) => {
              const dollars = gradePrice(job.grade_values?.[grade]);
              const shown =
                mode === 'pct' && retail != null && dollars != null
                  ? dollarsToRetailPercent(dollars, retail)
                  : dollars;
              return (
                <MoneyCell
                  key={`${grade}-${mode}`}
                  label={grade}
                  value={shown}
                  unit={mode}
                  disabled={locked}
                  width={100}
                  onCommit={(value) => setGrade(grade, value)}
                />
              );
            })}
          </Stack>
        </Box>
      </FormPanel>

      <FormPanel label="Notes">
        <Box
          sx={{
            px: 1.1,
            py: 1,
            borderRadius: `${studio.radius.md}px`,
            bgcolor: studio.accentSoft,
          }}
        >
          <NoteCell
            label="Note"
            boxed
            value={job.queue_note ?? ''}
            placeholder="add a note…"
            disabled={Boolean(busy)}
            onCommit={(queue_note) => onEdit(job.id, { queue_note })}
          />
          <Box sx={{ mt: 0.75 }}>
            <JobNotesSlot jobId={job.id} embedded compact />
          </Box>
        </Box>
      </FormPanel>

      <FormPanel inset>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1.5}
          sx={{ minHeight: 56 }}
        >
          <Tooltip
            arrow
            title="Best grade minus worst. What is on the table if the work goes well, against doing nothing."
          >
            <Stack
              spacing={0}
              sx={{ minWidth: 120, minHeight: 44, pl: 0.75, justifyContent: 'center', cursor: 'help' }}
            >
              <Typography
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  fontSize: '2rem',
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                  color: potential == null ? studio.inkFaint : studio.ink,
                }}
              >
                {potential == null ? '-' : fmtUsd(potential)}
              </Typography>
              <Typography
                sx={{
                  fontSize: '0.62rem',
                  color: studio.inkLabel,
                  fontWeight: 800,
                  letterSpacing: 0.4,
                  lineHeight: 1.2,
                  mt: 0.25,
                }}
              >
                AT STAKE
              </Typography>
            </Stack>
          </Tooltip>
          <Box sx={{ minWidth: 128, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexShrink: 0 }}>
            {formAction}
          </Box>
        </Stack>
      </FormPanel>
    </Stack>
  );
}

function FormPanel({
  label,
  action,
  accent,
  inset,
  children,
}: {
  label?: string;
  action?: ReactNode;
  accent?: string;
  /** Extra air around a hero figure so it does not sit on the card edge. */
  inset?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        px: inset ? 2.75 : 1.5,
        py: inset ? 2.25 : 1.25,
        bgcolor: studio.panel,
        borderRadius: `${studio.radius.lg}px`,
        border: `1.5px solid ${studio.panelBorder}`,
        borderLeft: accent ? `5px solid ${accent}` : undefined,
        boxShadow: studio.panelShadow,
      }}
    >
      {label || action ? (
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ mb: 0.75, minHeight: 28 }}
        >
          {label ? <FieldLabel>{label}</FieldLabel> : <Box />}
          {action ?? null}
        </Stack>
      ) : null}
      {children}
    </Box>
  );
}

function PriceModeToggle({
  mode,
  percentEnabled,
  onChange,
}: {
  mode: PriceMode;
  percentEnabled: boolean;
  onChange: (mode: PriceMode) => void;
}) {
  return (
    <Box
      role="group"
      aria-label="Price as"
      sx={{
        position: 'relative',
        display: 'flex',
        width: 72,
        height: 28,
        flexShrink: 0,
        borderRadius: 999,
        border: `1.5px solid ${studio.panelBorder}`,
        bgcolor: studio.panel,
        overflow: 'hidden',
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          top: 2,
          bottom: 2,
          left: mode === 'usd' ? 2 : 35,
          width: 33,
          borderRadius: 999,
          bgcolor: studio.accentDark,
          transition: 'left 140ms ease',
        }}
      />
      {([
        { id: 'usd' as const, label: '$', enabled: true, name: 'Price as dollars' },
        { id: 'pct' as const, label: '%', enabled: percentEnabled, name: 'Price as percent of retail' },
      ]).map((option) => {
        const active = mode === option.id;
        return (
          <Box
            key={option.id}
            component="button"
            type="button"
            disabled={!option.enabled}
            aria-pressed={active}
            aria-label={option.name}
            onClick={() => {
              if (!percentEnabled) return;
              onChange(mode === 'usd' ? 'pct' : 'usd');
            }}
            sx={{
              position: 'relative',
              zIndex: 1,
              flex: 1,
              minWidth: 0,
              height: '100%',
              px: 0,
              cursor: option.enabled ? 'pointer' : 'not-allowed',
              fontWeight: 900,
              fontSize: '0.85rem',
              border: 'none',
              bgcolor: 'transparent',
              color: active ? '#fff' : studio.ink,
              opacity: option.enabled ? 1 : 0.4,
              outline: 'none',
              '&:focus-visible': { boxShadow: `inset 0 0 0 2px ${studio.accentSoft}` },
            }}
          >
            {option.label}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * One field-group on the row.
 *
 * The rule is always there: colour changes with the list, size does not. On
 * a wide screen it is a vertical hairline; stacked, a horizontal one. The
 * first group has none, because there is nothing to separate it from.
 */
export function QueueSection({
  children,
  first = false,
  stacked = false,
  label,
}: {
  children: ReactNode;
  first?: boolean;
  /** Always a vertical stack, even on a wide screen. */
  stacked?: boolean;
  label?: string;
}) {
  return (
    <Box
      sx={{
        minWidth: 0,
        alignSelf: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: stacked && label ? 'flex-start' : 'center',
        px: stacked ? 0 : { xs: 0, lg: first ? 0 : 1.15 },
        py: stacked ? (first ? 0 : 0.75) : { xs: first ? 0 : 0.5, lg: 0 },
        borderLeft: stacked ? 'none' : { xs: 'none', lg: first ? 'none' : `1px solid ${SECTION_RULE}` },
        borderTop: stacked
          ? first
            ? 'none'
            : `1px solid ${SECTION_RULE}`
          : { xs: first ? 'none' : `1px solid ${SECTION_RULE}`, lg: 'none' },
      }}
    >
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {children}
    </Box>
  );
}
