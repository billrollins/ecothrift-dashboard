import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import type { ItemNoteDTO } from '../../types/inventory.types';
import { studio } from '../../pages/restoration/tars/studio/tarsStudioTheme';
import { formatNoteWhen, ITEM_NOTE_SURFACE_LABELS } from './itemNoteLabels';
import { NoteInlineEditor } from './NoteInlineEditor';
import { useReviseItemNote, useVoidItemNote } from '../../hooks/useItemNotes';

export const NOTES_TRAIL_HEIGHT = 176;
/** Tighter reserved slot when the trail sits under a write field. */
export const NOTES_TRAIL_COMPACT_HEIGHT = 88;
const ROW_TRASH_SLOT = 28;

export function ItemNotesTrail({
  notes,
  loading = false,
  embedded = false,
  compact = false,
  fill = false,
}: {
  notes: ItemNoteDTO[];
  loading?: boolean;
  /** Sit inside a parent well - no second box. */
  embedded?: boolean;
  compact?: boolean;
  /** Fill a slot the caller already sized, instead of the standard reserved heights. */
  fill?: boolean;
}) {
  const trash = useVoidItemNote();
  const revise = useReviseItemNote();
  const [editingId, setEditingId] = useState<number | null>(null);
  const visible = notes.filter((note) => note.status === 'active');
  const reserved = compact ? NOTES_TRAIL_COMPACT_HEIGHT : NOTES_TRAIL_HEIGHT;
  return (
    <Box
      sx={{
        height: fill ? '100%' : reserved,
        minHeight: fill ? 0 : reserved,
        maxHeight: fill ? 'none' : reserved,
        flex: fill ? 1 : undefined,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        px: embedded ? 0 : 0.75,
        py: embedded ? 0 : 0.5,
        border: embedded ? 'none' : `1px solid ${studio.panelBorder}`,
        borderRadius: embedded ? 0 : `${studio.radius.sm}px`,
        bgcolor: embedded ? 'transparent' : studio.panel,
      }}
    >
      {loading ? (
        <Typography sx={{ color: studio.inkMuted, fontSize: '0.78rem', pt: 0.5 }}>
          Loading notes…
        </Typography>
      ) : visible.length === 0 ? (
        <Typography sx={{ color: studio.inkMuted, fontSize: '0.78rem', pt: 0.5 }}>
          {embedded ? 'Nothing earlier.' : 'No notes yet.'}
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {visible.map((note) => (
            <Stack key={note.id} direction="row" spacing={0.5} alignItems="flex-start">
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} alignItems="baseline">
                  <Typography
                    sx={{
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      letterSpacing: 0.4,
                      color: studio.inkLabel,
                      textTransform: 'uppercase',
                      flexShrink: 0,
                    }}
                  >
                    {ITEM_NOTE_SURFACE_LABELS[note.surface]}
                  </Typography>
                  <Typography sx={{ fontSize: '0.68rem', color: studio.inkMuted, minWidth: 0 }} noWrap>
                    {formatNoteWhen(note.occurred_at)}
                    {note.author_name ? ` · ${note.author_name}` : ''}
                  </Typography>
                </Stack>
                {editingId === note.id ? (
                  <Typography
                    component="div"
                    sx={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: studio.ink,
                      minHeight: 20,
                    }}
                  >
                    <NoteInlineEditor
                      value={note.body}
                      disabled={revise.isPending}
                      onCommit={(body) => {
                        void revise.mutateAsync({ noteId: note.id, body }).then(() => setEditingId(null));
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </Typography>
                ) : (
                  <Typography
                    role={note.can_edit ? 'button' : undefined}
                    tabIndex={note.can_edit ? 0 : undefined}
                    aria-label={note.can_edit ? 'Edit this note' : undefined}
                    title={note.can_edit ? 'Click to edit' : undefined}
                    onClick={() => {
                      if (note.can_edit) setEditingId(note.id);
                    }}
                    onKeyDown={(event) => {
                      if (!note.can_edit) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setEditingId(note.id);
                      }
                    }}
                    sx={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: studio.ink,
                      whiteSpace: 'pre-wrap',
                      cursor: note.can_edit ? 'text' : 'default',
                      minHeight: 20,
                    }}
                  >
                    {note.body}
                  </Typography>
                )}
              </Box>
              <Box
                data-testid="note-trash-slot"
                sx={{ width: ROW_TRASH_SLOT, height: ROW_TRASH_SLOT, flexShrink: 0 }}
              >
                {note.can_delete ? (
                  <Tooltip arrow title="Remove this note">
                    <span>
                      <IconButton
                        size="small"
                        aria-label="Remove this note"
                        disabled={trash.isPending}
                        onClick={() => {
                          void trash.mutateAsync({ noteId: note.id });
                        }}
                        sx={{
                          width: ROW_TRASH_SLOT,
                          height: ROW_TRASH_SLOT,
                          color: '#94a3b8',
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
          ))}
        </Stack>
      )}
    </Box>
  );
}
