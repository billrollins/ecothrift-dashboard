/**
 * What you are doing, and what has already happened.
 *
 * The open action stays on top. Below it is one reserved detail row, then
 * two reserved filter rows, then the past — actions and desk events together.
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { NoteInlineEditor } from '../../../components/notes/NoteInlineEditor';
import { useJobNotes, useReviseItemNote } from '../../../hooks/useItemNotes';
import type {
  RestorationActionCategory,
  RestorationActionsDTO,
  RestorationTimelineEventDTO,
} from '../../../types/inventory.types';
import { BenchPaneHeader } from './studio/BenchPaneHeader';
import { PANEL, RADIUS, SLOT, TYPE } from './studio/benchScale';
import {
  filterBenchHistory,
  displayHistoryWho,
  formatHistoryWho,
  historyCommentNote,
  historyRowAffordance,
  mergeBenchHistory,
  truncateHistoryWho,
  type HistoryClearContext,
  type HistoryRowAffordance,
  type TarsHistoryFilter,
  type TarsHistoryRow,
} from './tarsBenchHistory';
import { HistoryFilterRows } from './tarsHistoryFilters';
import { categoryMeta, historyTypeMeta } from './tarsActions';
import { tarsPaneCardSx, tarsPaneScrollSx } from './tarsPaneScroll';
import { CURRENT_ACTION_HEIGHT, CurrentAction } from './TarsWorkPanel';

const ROW_ACTION_SLOT = 28;
const HISTORY_COLUMNS = '76px 64px 68px minmax(0, 1fr) 28px';

const TRASH_LABELS: Record<Exclude<HistoryRowAffordance, 'none'>, string> = {
  'clear-note': 'Clear this note history line',
  'clear-event': 'Clear this earlier answer',
  'reset-note': 'Reset the current note',
};

const TRASH_TONE: Record<Exclude<HistoryRowAffordance, 'none'>, 'soft' | 'hard'> = {
  'clear-note': 'soft',
  'clear-event': 'soft',
  'reset-note': 'hard',
};

export function TarsActionHistory({
  jobId = null,
  actions,
  events,
  currentUserId,
  busy,
  onDescribe,
  onEnter,
  onStartAction,
  onChangeCategory,
  onUndo,
  onDeleteAction: _onDeleteAction,
  onForgetWords,
  onResetNote,
}: {
  jobId?: number | null;
  actions: RestorationActionsDTO | undefined;
  events: RestorationTimelineEventDTO[];
  currentUserId?: number | null;
  busy?: boolean;
  onDescribe: (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => void;
  onEnter: (description: string) => void;
  onStartAction: () => void;
  onChangeCategory: (category: RestorationActionCategory) => void;
  onUndo: () => void;
  onDeleteAction: (actionId: number) => void;
  onForgetWords: (eventId: number) => void;
  onResetNote: (eventId: number) => void;
}) {
  const [filter, setFilter] = useState<TarsHistoryFilter>('all');
  const [resetRow, setResetRow] = useState<TarsHistoryRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const notes = useJobNotes(jobId);
  const revise = useReviseItemNote();
  const list = actions?.results ?? [];
  const current = list.find((row) => row.id === actions?.current_action_id) ?? null;
  const merged = useMemo(
    () => mergeBenchHistory(list, events, actions?.current_action_id ?? null),
    [list, events, actions?.current_action_id],
  );
  const rows = useMemo(() => filterBenchHistory(merged, filter), [merged, filter]);
  const clearCtx = useMemo<HistoryClearContext>(
    () => ({ rows: merged, actions: list, currentUserId: currentUserId ?? null }),
    [merged, list, currentUserId],
  );

  return (
    <Box sx={tarsPaneCardSx}>
      <BenchPaneHeader
        kicker="Work log"
        value={current ? categoryMeta(current.category).label : 'Ready'}
        detail={rows.length === 1 ? '1 entry' : `${rows.length} entries`}
      />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', px: '8px', py: '8px' }}>
        <Stack spacing={0.5} sx={{ minWidth: 0, height: '100%', minHeight: 0 }}>
          {current ? (
            <CurrentAction
              action={current}
              busy={busy}
              canUndo={list.length > 1}
              onDescribe={onDescribe}
              onEnter={onEnter}
              onChangeCategory={onChangeCategory}
              onUndo={onUndo}
            />
          ) : (
            <Box
              component="button"
              type="button"
              disabled={busy || actions === undefined}
              onClick={onStartAction}
              sx={{
                px: 1,
                py: 1,
                minHeight: CURRENT_ACTION_HEIGHT,
                width: '100%',
                textAlign: 'left',
                borderRadius: `${RADIUS.md}px`,
                border: `1px dashed ${PANEL.borderStrong}`,
                bgcolor: 'transparent',
                color: actions === undefined ? PANEL.faint : PANEL.inkMuted,
                cursor: busy || actions === undefined ? 'default' : 'pointer',
              }}
            >
              <Typography sx={{ ...TYPE.value, color: PANEL.inkMuted }}>
                {actions === undefined ? 'Loading…' : 'Log an action'}
              </Typography>
              <Typography sx={{ ...TYPE.meta, color: PANEL.faint, mt: 0.35 }}>
                {actions === undefined
                  ? ' '
                  : 'Click to start a sitting on this item.'}
              </Typography>
            </Box>
          )}

          <ActionDetail action={current} />

          <HistoryFilterRows filter={filter} onFilter={setFilter} />

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: HISTORY_COLUMNS,
              columnGap: '8px',
              alignItems: 'center',
              height: SLOT.historyHead,
              px: '8px',
              flexShrink: 0,
              bgcolor: PANEL.bgSubtle,
              borderTop: `1px solid ${PANEL.border}`,
              borderBottom: `1px solid ${PANEL.border}`,
              ...TYPE.micro,
              color: PANEL.label,
            }}
          >
            <span>When</span>
            <span>Who</span>
            <span>What</span>
            <span>Detail</span>
            <span />
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, ...tarsPaneScrollSx }}>
            {rows.length === 0 ? (
              <Typography sx={{ px: 0.25, ...TYPE.body, color: PANEL.faint }}>
                Nothing in this history yet.
              </Typography>
            ) : (
              <Stack spacing={0}>
                {rows.map((row, index) => {
                  const twin = historyCommentNote(row, notes.data ?? []);
                  return (
                    <HistoryLine
                      key={row.id}
                      row={row}
                      index={index}
                      busy={busy || revise.isPending}
                      canEdit={twin?.can_edit === true}
                      editing={editingId === row.id}
                      editValue={twin?.body ?? row.detail}
                      onEdit={() => setEditingId(row.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onCommitEdit={(body) => {
                        if (twin == null) return;
                        void revise.mutateAsync({ noteId: twin.id, body }).then(() => setEditingId(null));
                      }}
                      affordance={historyRowAffordance(row, clearCtx)}
                      onDescribe={onDescribe}
                      onForgetWords={onForgetWords}
                      onResetNote={(next) => setResetRow(next)}
                    />
                  );
                })}
              </Stack>
            )}
          </Box>
        </Stack>
      </Box>

      <Dialog open={resetRow != null} onClose={() => setResetRow(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1, fontWeight: 900 }}>Reset note?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.85rem', color: '#334155' }}>
            This is the current note. Resetting it removes this line and puts the note back to what
            it said before.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 1.5 }}>
          <Button onClick={() => setResetRow(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy || resetRow?.eventId == null}
            onClick={() => {
              const eventId = resetRow?.eventId;
              setResetRow(null);
              if (eventId != null) onResetNote(eventId);
            }}
          >
            Reset note
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function ActionDetail({
  action,
}: {
  action: RestorationActionsDTO['results'][number] | null;
}) {
  const when = action ? formatClock(action.started_at) : '—';
  const whoFull = action ? formatHistoryWho(action.created_by_name ?? '') : '—';
  const who = action ? displayHistoryWho(action.created_by_name ?? '') : '—';
  const kind = action ? categoryMeta(action.category).label : '—';

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{
        ...TYPE.meta,
        minHeight: 24,
        px: 0.5,
        color: PANEL.inkMuted,
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
      >
        {action ? (
          <>
            <span>Started {when}</span>
            <span title={whoFull}>{who}</span>
            <span>{kind}</span>
          </>
        ) : (
          <span style={{ color: PANEL.faint }}>Ready to log.</span>
        )}
      </Stack>
    </Stack>
  );
}

function HistoryLine({
  row,
  index,
  busy,
  canEdit,
  editing,
  editValue,
  affordance,
  onDescribe,
  onForgetWords,
  onResetNote,
  onEdit,
  onCancelEdit,
  onCommitEdit,
}: {
  row: TarsHistoryRow;
  index: number;
  busy?: boolean;
  canEdit?: boolean;
  editing?: boolean;
  editValue?: string;
  affordance: HistoryRowAffordance;
  onDescribe: (actionId: number, patch: { description?: string; category?: RestorationActionCategory }) => void;
  onForgetWords: (eventId: number) => void;
  onResetNote: (row: TarsHistoryRow) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onCommitEdit: (body: string) => void;
}) {
  const meta = historyTypeMeta(row.filter);
  const eventCopy = [row.title, row.detail].filter(Boolean).join(' · ');

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: HISTORY_COLUMNS,
        columnGap: '8px',
        alignItems: 'center',
        height: SLOT.historyRow,
        px: '8px',
        borderLeft: `3px solid ${meta.color}`,
        borderBottom: `1px solid ${PANEL.border}`,
        bgcolor: index % 2 === 0 ? PANEL.bg : PANEL.bgZebra,
      }}
    >
      <Typography
        sx={{
          ...TYPE.meta,
          minWidth: 0,
          color: PANEL.faint,
        }}
        noWrap
        title={formatWhen(row.at)}
      >
        {formatWhen(row.at)}
      </Typography>
      <Typography
        sx={{
          ...TYPE.meta,
          minWidth: 0,
          color: PANEL.inkMuted,
        }}
        noWrap
        title={row.actor}
      >
        {truncateHistoryWho(row.actor)}
      </Typography>
      <Typography
        noWrap
        sx={{
          ...TYPE.micro,
          minWidth: 0,
          color: meta.color,
        }}
      >
        {meta.label}
      </Typography>
      {row.kind === 'action' && row.actionId != null ? (
        <HistoryWords
          value={row.detail}
          busy={busy}
          onCommit={(description) => onDescribe(row.actionId!, { description })}
        />
      ) : editing ? (
        <Box sx={{ minWidth: 0, ...TYPE.body }}>
          <NoteInlineEditor
            value={editValue || row.detail || row.title}
            disabled={busy}
            onCommit={onCommitEdit}
            onCancel={onCancelEdit}
          />
        </Box>
      ) : (
        <Typography
          role={canEdit ? 'button' : undefined}
          tabIndex={canEdit ? 0 : undefined}
          aria-label={canEdit ? 'Edit this note' : undefined}
          title={canEdit ? 'Click to edit' : eventCopy}
          noWrap
          onClick={() => {
            if (canEdit) onEdit();
          }}
          onKeyDown={(event) => {
            if (!canEdit) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onEdit();
            }
          }}
          sx={{
            ...TYPE.body,
            minWidth: 0,
            color: eventCopy ? PANEL.ink : PANEL.faint,
            cursor: canEdit ? 'text' : 'default',
          }}
        >
          {eventCopy}
        </Typography>
      )}
      <Box sx={{ width: ROW_ACTION_SLOT, height: ROW_ACTION_SLOT }}>
        {affordance !== 'none' ? (
          <RowTrash
            disabled={busy}
            tone={TRASH_TONE[affordance]}
            label={TRASH_LABELS[affordance]}
            onClick={() => {
              if (affordance === 'reset-note') {
                onResetNote(row);
                return;
              }
              if (row.eventId != null) onForgetWords(row.eventId);
            }}
          />
        ) : null}
      </Box>
    </Box>
  );
}

function RowTrash({
  label,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  tone: 'soft' | 'hard';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip arrow title={label}>
      <span>
        <IconButton
          size="small"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          sx={{
            width: ROW_ACTION_SLOT,
            height: ROW_ACTION_SLOT,
            color: disabled ? PANEL.faint : tone === 'hard' ? '#a6572c' : PANEL.faint,
            '&:hover:not(:disabled)': { color: '#a13b34' },
          }}
        >
          <DeleteOutline sx={{ fontSize: 18 }} />
        </IconButton>
      </span>
    </Tooltip>
  );
}

function HistoryWords({
  value,
  busy,
  onCommit,
}: {
  value: string;
  busy?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (focused.current) return;
    setDraft(value);
  }, [value]);

  return (
    <Box
      component="input"
      aria-label="What you did"
      disabled={busy}
      value={draft}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        focused.current = false;
        const trimmed = draft.trim();
        if (trimmed !== value.trim()) onCommit(trimmed);
      }}
      sx={{
        ...TYPE.body,
        minWidth: 0,
        height: 18,
        border: 'none',
        outline: 'none',
        bgcolor: 'transparent',
        color: draft.trim() ? PANEL.ink : PANEL.faint,
        '&:focus': { color: PANEL.ink },
      }}
    />
  );
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  return `${date.toLocaleDateString([], { month: 'numeric', day: 'numeric' })} ${time}`;
}
