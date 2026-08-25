/**
 * One line per thing that happened to a restoration job.
 *
 * Shared by the Overview drawer and the Finish dialog Actions tab.
 * Comment rows reserve a 28px trash slot; the icon appears only when the
 * lock rule says this person can delete.
 */
import DeleteOutline from '@mui/icons-material/DeleteOutline';
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
import { useMemo, useState } from 'react';
import { useSnackbar } from 'notistack';
import { NoteInlineEditor } from '../../../components/notes/NoteInlineEditor';
import { useAuth } from '../../../hooks/useAuth';
import { useJobNotes, useReviseItemNote } from '../../../hooks/useItemNotes';
import {
  useForgetRestorationTimelineWords,
  useResetRestorationQueueNote,
} from '../../../hooks/useRestorationBench';
import type { RestorationActionDTO } from '../../../types/inventory.types';
import { historyTypeMeta } from '../tars/tarsActions';
import {
  historyCommentNote,
  historyRowAffordance,
  truncateHistoryWho,
  type HistoryClearContext,
  type HistoryRowAffordance,
  type TarsHistoryRow,
} from '../tars/tarsBenchHistory';
import { studio } from '../tars/studio/tarsStudioTheme';

const WHEN_SLOT = 92;
const WHO_SLOT = 70;
const WHAT_SLOT = 76;
const ROW_TRASH_SLOT = 28;

const TRASH_LABELS: Record<Exclude<HistoryRowAffordance, 'none'>, string> = {
  'clear-note': 'Clear this note history line',
  'clear-event': 'Clear this earlier answer',
  'reset-note': 'Reset the current note',
};

export function JobHistoryList({
  rows,
  empty,
  jobId = null,
  actions = [],
  merged,
  currentUserId,
  closed = false,
}: {
  rows: TarsHistoryRow[];
  empty: string;
  jobId?: number | null;
  actions?: RestorationActionDTO[];
  merged?: TarsHistoryRow[];
  currentUserId?: number | null;
  closed?: boolean;
}) {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const notes = useJobNotes(jobId ?? null);
  const revise = useReviseItemNote();
  const forget = useForgetRestorationTimelineWords();
  const resetNote = useResetRestorationQueueNote();
  const [resetRow, setResetRow] = useState<TarsHistoryRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const me = currentUserId ?? user?.id ?? null;
  const clearCtx = useMemo<HistoryClearContext>(
    () => ({ rows: merged ?? rows, actions, currentUserId: me, closed }),
    [merged, rows, actions, me, closed],
  );
  const busy = forget.isPending || resetNote.isPending || revise.isPending;

  const runForget = (eventId: number) => {
    if (jobId == null) return;
    forget.mutate(
      { jobId, eventId },
      {
        onError: (err) =>
          enqueueSnackbar(err instanceof Error ? err.message : 'Could not clear that', {
            variant: 'warning',
          }),
      },
    );
  };

  if (rows.length === 0) {
    return (
      <Typography
        sx={{
          minHeight: 28,
          fontSize: '0.8rem',
          fontWeight: 700,
          color: studio.inkMuted,
          px: 0.5,
          py: 1,
        }}
      >
        {empty}
      </Typography>
    );
  }
  return (
    <>
      <Stack spacing={0.5}>
        {rows.map((row) => {
          const twin = historyCommentNote(row, notes.data ?? []);
          return (
            <HistoryLine
              key={row.id}
              row={row}
              busy={busy}
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
              onTrash={() => {
                if (row.eventId == null) return;
                const affordance = historyRowAffordance(row, clearCtx);
                if (affordance === 'reset-note') {
                  setResetRow(row);
                  return;
                }
                if (affordance !== 'none') runForget(row.eventId);
              }}
            />
          );
        })}
      </Stack>
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
            disabled={busy || resetRow?.eventId == null || jobId == null}
            onClick={() => {
              const eventId = resetRow?.eventId;
              setResetRow(null);
              if (eventId == null || jobId == null) return;
              resetNote.mutate(
                { jobId, eventId },
                {
                  onError: (err) =>
                    enqueueSnackbar(err instanceof Error ? err.message : 'Could not reset that note', {
                      variant: 'warning',
                    }),
                },
              );
            }}
          >
            Reset note
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function HistoryLine({
  row,
  busy,
  canEdit,
  editing,
  editValue,
  affordance,
  onTrash,
  onEdit,
  onCancelEdit,
  onCommitEdit,
}: {
  row: TarsHistoryRow;
  busy?: boolean;
  canEdit?: boolean;
  editing?: boolean;
  editValue?: string;
  affordance: HistoryRowAffordance;
  onTrash: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onCommitEdit: (body: string) => void;
}) {
  const meta = historyTypeMeta(row.filter);
  const eventCopy = [row.title, row.detail].filter(Boolean).join(' · ');

  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="center"
      sx={{
        px: 0.65,
        py: 0.3,
        minHeight: 28,
        borderRadius: `${studio.radius.sm}px`,
        border: '1px solid #eef2f6',
        borderLeft: `3px solid ${meta.color}`,
        bgcolor: '#ffffff',
      }}
    >
      <Typography
        sx={{
          width: WHEN_SLOT,
          flexShrink: 0,
          fontSize: '0.62rem',
          fontWeight: 800,
          color: '#94a3b8',
        }}
        noWrap
        title={formatWhen(row.at)}
      >
        {formatWhen(row.at)}
      </Typography>
      <Typography
        sx={{
          width: WHO_SLOT,
          flexShrink: 0,
          fontSize: '0.72rem',
          fontWeight: 800,
          color: '#334155',
        }}
        noWrap
        title={row.actor}
      >
        {truncateHistoryWho(row.actor)}
      </Typography>
      <Box
        sx={{
          width: WHAT_SLOT,
          flexShrink: 0,
          height: 18,
          px: 0.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          bgcolor: meta.soft,
          border: `1px solid ${meta.border}`,
          color: meta.color,
          fontSize: '0.58rem',
          fontWeight: 800,
          letterSpacing: 0.2,
        }}
      >
        {meta.label}
      </Box>
      {editing ? (
        <Box sx={{ flex: 1, minWidth: 0, fontSize: '0.75rem', fontWeight: 600 }}>
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
            flex: 1,
            minWidth: 0,
            fontSize: '0.75rem',
            color: eventCopy ? '#475569' : '#cbd5e1',
            cursor: canEdit ? 'text' : 'default',
          }}
        >
          {eventCopy}
        </Typography>
      )}
      <Box
        data-testid="history-trash-slot"
        sx={{ width: ROW_TRASH_SLOT, height: ROW_TRASH_SLOT, flexShrink: 0 }}
      >
        {affordance !== 'none' ? (
          <Tooltip arrow title={TRASH_LABELS[affordance]}>
            <span>
              <IconButton
                size="small"
                aria-label={TRASH_LABELS[affordance]}
                disabled={busy}
                onClick={onTrash}
                sx={{
                  width: ROW_TRASH_SLOT,
                  height: ROW_TRASH_SLOT,
                  color: affordance === 'reset-note' ? '#c4a08a' : '#94a3b8',
                  '&:hover:not(:disabled)': { color: '#b71c1c' },
                }}
              >
                <DeleteOutline sx={{ fontSize: 18 }} />
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
      </Box>
    </Stack>
  );
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
