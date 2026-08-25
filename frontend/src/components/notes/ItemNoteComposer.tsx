import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useAppendItemNote } from '../../hooks/useItemNotes';

export const NOTE_COMPOSER_HEIGHT = 72;
/** Labeled small field, no empty slot above it. */
export const NOTE_COMPOSER_DENSE_HEIGHT = 56;

export function ItemNoteComposer({
  itemId,
  jobId,
  dense = false,
}: {
  itemId: number | null;
  jobId?: number | null;
  /** Sit flush under a trail - no reserved empty slot above the field. */
  dense?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const save = useAppendItemNote(itemId, jobId);
  const ready = draft.trim() !== '' && itemId != null && !save.isPending;

  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="flex-end"
      sx={{ width: '100%', minHeight: dense ? NOTE_COMPOSER_DENSE_HEIGHT : NOTE_COMPOSER_HEIGHT }}
    >
      <TextField
        fullWidth
        size="small"
        label="Add a note"
        sx={{ flex: 1, minWidth: 0 }}
        value={draft}
        disabled={itemId == null || save.isPending}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && ready) {
            event.preventDefault();
            void save.mutateAsync(draft.trim()).then(() => setDraft(''));
          }
        }}
      />
      <Button
        variant="contained"
        disabled={!ready}
        onClick={() => {
          void save.mutateAsync(draft.trim()).then(() => setDraft(''));
        }}
        sx={{ minWidth: 72, fontWeight: 800 }}
      >
        Add
      </Button>
    </Stack>
  );
}
