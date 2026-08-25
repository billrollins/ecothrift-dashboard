/**
 * The bench command deck.
 *
 * Four panes in two cards that sit on the same tracks as the scale and the
 * work log: item details + Original → Current over the grade table, notes +
 * leave-keys over the history. Notices sit on the SKU row and open a top
 * drawer, so this card never grows.
 */
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatConditionLabel } from '../../../constants/inventory.constants';
import { ItemNotesDrawer } from '../../../components/notes/ItemNotesDrawer';
import { formatNoteWhoWhen, recentVisibleNotes } from '../../../components/notes/itemNoteLabels';
import { NOTES_BADGE_COMPACT_WIDTH, NotesBadge } from '../../../components/notes/NotesBadge';
import { useAppendItemNote, useJobNotes } from '../../../hooks/useItemNotes';
import type { ItemNoteDTO, RestorationJobDTO } from '../../../types/inventory.types';
import { PressPicker, type PressPaint } from './studio/PressPicker';
import { DECK, RADIUS, SLOT, TYPE } from './studio/benchScale';
import { StudioNoticeButton, type StudioNotice } from './studio/StudioNotices';
import { TarsDispositionBar } from './TarsDispositionBar';
import { claimBenchGrade, type TarsBenchPlan } from './tarsBenchPlan';
import { CURRENT_PAINT, GRADE_ROLE, ORIGINAL_PAINT } from './tarsGradeRoles';
import { valueAdded, valueLeft } from './tarsBenchValue';
import { fmtUsd } from './tarsProfit';
import { benchOwnerLine, destinationLabel, formatWaiting } from '../queue/restorationQueueModel';

/** Wide enough that the count badge stays inside the pane, never cropped. */
const NOTICE_SLOT = 36;

function moneyInk(value: number | null): string {
  if (value == null) return DECK.faint;
  if (value < 0) return DECK.danger;
  return DECK.accent;
}

const deckChrome = {
  minWidth: 0,
  minHeight: { md: SLOT.deck },
  height: { xs: 'auto', md: SLOT.deck },
  maxHeight: { xs: 'none', md: SLOT.deck },
  overflow: 'hidden',
  borderRadius: `${RADIUS.lg}px`,
  bgcolor: DECK.bg,
  border: `1px solid ${DECK.border}`,
  boxShadow: '0 1px 2px rgba(16,33,26,0.24), 0 10px 24px rgba(16,33,26,0.14)',
  backgroundImage: `linear-gradient(180deg, ${DECK.bgTop} 0%, ${DECK.bg} 62%)`,
} as const;

export function TarsBenchConsole({
  job,
  plan,
  scaleGrades,
  busy,
  notices,
  onPlanChange,
  onOpenNotices,
  onHold,
  onSendBack,
  onReject,
  onDone,
  spentParts = 0,
  remainingParts,
  finishBlocked = false,
}: {
  job: RestorationJobDTO;
  plan: TarsBenchPlan;
  scaleGrades: string[];
  busy?: boolean;
  notices: StudioNotice[];
  onPlanChange: (plan: TarsBenchPlan) => void;
  onOpenNotices: () => void;
  onHold: () => void;
  onSendBack: () => void;
  onReject: () => void;
  onDone: () => void;
  spentParts?: number;
  remainingParts?: number;
  finishBlocked?: boolean;
}) {
  const sku = job.items[0]?.sku ?? job.sku ?? `Job ${job.id}`;
  const added = valueAdded(job, plan, spentParts);
  const left = valueLeft(job, plan, scaleGrades, remainingParts);
  const grades = scaleGrades.length > 0 ? scaleGrades : Object.keys(job.grade_values ?? {});

  return (
    <>
      <Box
        sx={{
          ...deckChrome,
          gridColumn: '1',
          gridRow: '1',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 4.6fr) minmax(0, 1.65fr)' },
        }}
      >
        <Pane>
          <ItemDetails
            job={job}
            sku={sku}
            notices={notices}
            onOpenNotices={onOpenNotices}
          />
        </Pane>
        <Pane rule>
          <Compass
            plan={plan}
            grades={grades}
            added={added}
            left={left}
            disabled={busy}
            onPlanChange={onPlanChange}
          />
        </Pane>
      </Box>
      <Box
        sx={{
          ...deckChrome,
          gridColumn: { xs: '1', lg: '2' },
          gridRow: { xs: '2', lg: '1' },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 128px' },
        }}
      >
        <Pane>
          <NotesPane
            sku={sku}
            busy={busy}
            jobId={job.id}
            itemId={job.items[0]?.id ?? null}
          />
        </Pane>
        <Pane rule>
          <TarsDispositionBar
            busy={busy}
            finishBlocked={finishBlocked}
            layout="console"
            onHold={onHold}
            onSendBack={onSendBack}
            onReject={onReject}
            onDone={onDone}
          />
        </Pane>
      </Box>
    </>
  );
}

function Pane({ rule, children }: { rule?: boolean; children: ReactNode }) {
  return (
    <Box
      sx={{
        position: 'relative',
        minWidth: 0,
        minHeight: 0,
        height: '100%',
        overflow: 'visible',
        px: '8px',
        py: '10px',
        display: 'flex',
        flexDirection: 'column',
        ...(rule
          ? {
              '&::before': {
                content: '""',
                display: { xs: 'none', md: 'block' },
                position: 'absolute',
                left: 0,
                top: 10,
                bottom: 10,
                width: '1px',
                bgcolor: DECK.rule,
              },
            }
          : {}),
      }}
    >
      {children}
    </Box>
  );
}

function ItemDetails({
  job,
  sku,
  notices,
  onOpenNotices,
}: {
  job: RestorationJobDTO;
  sku: string;
  notices: StudioNotice[];
  onOpenNotices: () => void;
}) {
  const owner = benchOwnerLine(job);
  const goingTo = destinationLabel(job.intended_destination);
  return (
    <Box sx={{ position: 'relative', minWidth: 0, height: '100%', minHeight: 0 }}>
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: NOTICE_SLOT,
          height: NOTICE_SLOT,
          display: 'grid',
          placeItems: 'center',
          zIndex: 1,
        }}
      >
        <StudioNoticeButton notices={notices} onOpen={onOpenNotices} tone="dark" inset />
      </Box>
      <Stack spacing={0} sx={{ minWidth: 0, height: '100%', minHeight: 0, pr: `${NOTICE_SLOT + 2}px` }}>
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{ height: 14, minWidth: 0 }}
        >
          <Typography
            noWrap
            sx={{
              ...TYPE.meta,
              flexShrink: 0,
              height: 14,
              lineHeight: '14px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              letterSpacing: '0.04em',
              color: DECK.accent,
            }}
          >
            {sku}
          </Typography>
          {owner.kind !== 'none' ? (
            <>
              <Box
                aria-hidden
                sx={{
                  width: '1px',
                  height: 10,
                  flexShrink: 0,
                  bgcolor: DECK.rule,
                }}
              />
              <Typography
                noWrap
                aria-label={owner.aria}
                title={owner.aria}
                sx={{
                  ...TYPE.meta,
                  minWidth: 0,
                  height: 14,
                  lineHeight: '14px',
                  color: owner.kind === 'unclaimed' ? DECK.warn : DECK.muted,
                }}
              >
                {owner.kind === 'owner' ? owner.aria : 'Unclaimed bench'}
              </Typography>
            </>
          ) : null}
        </Stack>
        <Typography
          noWrap
          title={job.name || undefined}
          sx={{
            ...TYPE.title,
            height: 24,
            lineHeight: '24px',
            mt: '2px',
            color: DECK.ink,
          }}
        >
          {job.name || '—'}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            columnGap: '6px',
            rowGap: '6px',
            mt: '6px',
            flexShrink: 0,
          }}
        >
          <Fact label="Brand" value={job.brand} />
          <Fact label="Model" value={job.model} />
          <Fact label="Category" value={job.category} />
          <Fact label="Condition" value={job.condition ? formatConditionLabel(job.condition) : ''} />
          <Fact label="Retail" value={job.retail ? fmtUsd(Number(job.retail)) : ''} />
          <Fact label="Going to" value={goingTo} />
          <Fact label="Product" value={job.product_number} />
          <Fact label="PO" value={job.purchase_order_number} />
          <Fact label="Waiting" value={formatWaiting(job)} />
        </Box>
      </Stack>
    </Box>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  const text = value?.trim() || '—';
  return (
    <Box sx={{ minWidth: 0, minHeight: SLOT.factLabel + SLOT.factValue }}>
      <Typography
        sx={{
          ...TYPE.micro,
          height: SLOT.factLabel,
          lineHeight: '12px',
          color: DECK.label,
        }}
      >
        {label}
      </Typography>
      <Typography
        noWrap
        sx={{
          ...TYPE.value,
          height: SLOT.factValue,
          lineHeight: '18px',
          color: text === '—' ? DECK.faint : DECK.ink,
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}

function NotesPane({
  sku,
  busy,
  jobId,
  itemId,
}: {
  sku: string;
  busy?: boolean;
  jobId: number;
  itemId: number | null;
}) {
  const notes = useJobNotes(jobId);
  const [notesOpen, setNotesOpen] = useState(false);
  const recent = recentVisibleNotes(notes.data ?? []);
  return (
    <Stack sx={{ minWidth: 0, height: '100%' }}>
      <RecentNotes
        notes={recent}
        count={notes.data?.length ?? 0}
        onOpenAll={() => setNotesOpen(true)}
      />
      <ConsoleAddNote itemId={itemId} jobId={jobId} busy={busy} />
      {notesOpen ? (
        <ItemNotesDrawer
          open={notesOpen}
          jobId={jobId}
          itemId={itemId}
          title={`Notes · ${sku}`}
          onClose={() => setNotesOpen(false)}
        />
      ) : null}
    </Stack>
  );
}

function ConsoleLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        ...TYPE.micro,
        height: SLOT.paneLabel,
        lineHeight: '14px',
        color: DECK.label,
      }}
    >
      {children}
    </Typography>
  );
}

function RecentNotes({
  notes,
  count,
  onOpenAll,
}: {
  notes: ItemNoteDTO[];
  count: number;
  onOpenAll: () => void;
}) {
  return (
    <Box sx={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ position: 'absolute', top: 0, right: 0, zIndex: 1 }}>
        <NotesBadge compact tone="dark" count={count} onClick={onOpenAll} />
      </Box>
      <Box sx={{ pr: `${NOTES_BADGE_COMPACT_WIDTH + 6}px`, flexShrink: 0 }}>
        <ConsoleLabel>Recent notes</ConsoleLabel>
      </Box>
      <Box
        role="button"
        tabIndex={0}
        aria-label="Recent notes"
        onClick={onOpenAll}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpenAll();
          }
        }}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {notes.length === 0 ? (
          <Typography
            sx={{
              ...TYPE.body,
              height: SLOT.noteBlock,
              lineHeight: `${SLOT.noteBlock}px`,
              color: DECK.faint,
            }}
          >
            No notes yet.
          </Typography>
        ) : (
          notes.map((note, index) => {
            const whoWhen = formatNoteWhoWhen(note);
            return (
              <Box
                key={note.id}
                sx={{
                  boxSizing: 'border-box',
                  height: SLOT.noteBlock,
                  borderTop: '1px solid',
                  borderTopColor: index === 0 ? 'transparent' : DECK.rule,
                  overflow: 'hidden',
                }}
              >
                <Typography
                  noWrap
                  sx={{
                    ...TYPE.meta,
                    height: SLOT.noteMeta,
                    lineHeight: '12px',
                    color: DECK.label,
                  }}
                >
                  {whoWhen}
                </Typography>
                <Typography
                  noWrap
                  title={note.body}
                  sx={{
                    ...TYPE.body,
                    fontWeight: 600,
                    height: SLOT.noteBody,
                    lineHeight: '19px',
                    color: DECK.ink,
                  }}
                >
                  {note.body}
                </Typography>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

function ConsoleAddNote({
  itemId,
  jobId,
  busy,
}: {
  itemId: number | null;
  jobId: number;
  busy?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const save = useAppendItemNote(itemId, jobId);
  const ready = draft.trim() !== '' && itemId != null && !save.isPending && !busy;

  const commit = () => {
    if (!ready) return;
    void save.mutateAsync(draft.trim()).then(() => setDraft(''));
  };

  return (
    <Stack spacing={0.5} sx={{ minWidth: 0, flexShrink: 0 }}>
      <ConsoleLabel>Add note</ConsoleLabel>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minHeight: SLOT.addNote }}>
        <Box
          component="input"
          aria-label="Add note"
          disabled={busy || itemId == null || save.isPending}
          value={draft}
          placeholder="What should the next person know?"
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraft('');
              event.currentTarget.blur();
            }
          }}
          sx={{
            ...TYPE.body,
            fontWeight: 600,
            boxSizing: 'border-box',
            flex: 1,
            minWidth: 0,
            height: SLOT.addNote,
            px: '8px',
            fontFamily: 'inherit',
            color: DECK.ink,
            borderRadius: `${RADIUS.sm}px`,
            border: `1px solid ${DECK.border}`,
            bgcolor: 'rgba(255,255,255,0.06)',
            outline: 'none',
            '&:focus': { borderColor: DECK.accent, boxShadow: '0 0 0 2px rgba(127,199,154,0.20)' },
            '&::placeholder': { color: DECK.faint },
            '&:disabled': { opacity: 0.7 },
          }}
        />
        <Box
          component="button"
          type="button"
          disabled={!ready}
          onClick={commit}
          sx={{
            ...TYPE.micro,
            flexShrink: 0,
            minWidth: 52,
            height: SLOT.addNote,
            px: 1,
            borderRadius: `${RADIUS.sm}px`,
            bgcolor: ready ? DECK.accent : 'transparent',
            color: ready ? '#12241b' : DECK.faint,
            border: `1px solid ${ready ? DECK.accent : DECK.border}`,
            fontFamily: 'inherit',
            cursor: ready ? 'pointer' : 'default',
          }}
        >
          Add
        </Box>
      </Stack>
    </Stack>
  );
}

function Compass({
  plan,
  grades,
  added,
  left,
  disabled,
  onPlanChange,
}: {
  plan: TarsBenchPlan;
  grades: string[];
  added: number | null;
  left: number | null;
  disabled?: boolean;
  onPlanChange: (plan: TarsBenchPlan) => void;
}) {
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        minHeight: 0,
        display: 'grid',
        gridTemplateRows: '1fr 1fr',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 0, minWidth: 0 }}>
        <Box
          sx={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 16px minmax(0,1fr)',
            columnGap: 0.45,
            alignItems: 'end',
          }}
        >
          <GradePick
            label="Original"
            labelColor={GRADE_ROLE.original.console}
            value={plan.startingGrade}
            grades={grades}
            paint={ORIGINAL_PAINT}
            disabled={disabled}
            onChange={(grade) => onPlanChange(claimBenchGrade(plan, 'original', grade))}
          />
          <Box
            sx={{
              height: SLOT.picker,
              display: 'grid',
              placeItems: 'center',
              backgroundImage: `linear-gradient(90deg, ${GRADE_ROLE.original.console}, ${GRADE_ROLE.current.console})`,
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              fontSize: '1rem',
              fontWeight: 800,
            }}
            aria-hidden
          >
            →
          </Box>
          <GradePick
            label="Current"
            labelColor={GRADE_ROLE.current.console}
            value={plan.currentGrade}
            grades={grades}
            paint={CURRENT_PAINT}
            disabled={disabled}
            onChange={(grade) => onPlanChange(claimBenchGrade(plan, 'current', grade))}
          />
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 0,
          minWidth: 0,
          borderTop: `1px dashed ${DECK.rule}`,
        }}
      >
        <Box
          sx={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1fr) 16px minmax(0,1fr)',
            columnGap: 0.45,
          }}
        >
          <MoneyReadout label="Value added" value={added} signed />
          <Box />
          <MoneyReadout label="Value left" value={left} />
        </Box>
      </Box>
    </Box>
  );
}

function GradePick({
  label,
  labelColor,
  value,
  grades,
  paint,
  disabled,
  onChange,
}: {
  label: string;
  labelColor?: string;
  value: string;
  grades: string[];
  paint: PressPaint;
  disabled?: boolean;
  onChange: (grade: string) => void;
}) {
  return (
    <Stack spacing={0.5} sx={{ minWidth: 0 }}>
      <Typography
        sx={{
          ...TYPE.micro,
          height: 14,
          lineHeight: '14px',
          color: labelColor ?? DECK.label,
        }}
      >
        {label}
      </Typography>
      <PressPicker
        value={value || undefined}
        options={grades}
        format={(grade) => grade}
        placeholder="—"
        width="100%"
        height={SLOT.picker}
        fontSize="14px"
        layout="menu"
        tone="dark"
        paint={() => paint}
        ariaLabel={label}
        disabled={disabled || grades.length === 0}
        onChange={onChange}
      />
    </Stack>
  );
}

function fmtHeaderUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function MoneyReadout({
  label,
  value,
  signed,
}: {
  label: string;
  value: number | null;
  signed?: boolean;
}) {
  const amount =
    value == null
      ? '—'
      : signed && value > 0
        ? `+${fmtHeaderUsd(value)}`
        : fmtHeaderUsd(value);
  return (
    <Stack spacing={0} sx={{ minWidth: 0, alignItems: 'center' }} aria-label={`${label} ${amount}`}>
      <Typography
        noWrap
        sx={{
          ...TYPE.figure,
          width: '100%',
          textAlign: 'center',
          color: moneyInk(value),
          lineHeight: '28px',
          height: SLOT.figure,
        }}
      >
        {amount}
      </Typography>
      <Typography
        sx={{
          ...TYPE.micro,
          height: SLOT.figureLabel,
          lineHeight: '12px',
          color: DECK.label,
          textAlign: 'center',
        }}
      >
        {label}
      </Typography>
    </Stack>
  );
}
