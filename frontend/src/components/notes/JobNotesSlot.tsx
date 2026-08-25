import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { useJobNotes } from '../../hooks/useItemNotes';
import { ItemNoteComposer, NOTE_COMPOSER_DENSE_HEIGHT, NOTE_COMPOSER_HEIGHT } from './ItemNoteComposer';
import { ItemNotesTrail, NOTES_TRAIL_COMPACT_HEIGHT, NOTES_TRAIL_HEIGHT } from './ItemNotesTrail';

export function JobNotesSlot({
  jobId,
  itemId = null,
  compose = false,
  embedded = false,
  compact = false,
  fill = false,
}: {
  jobId: number | null;
  itemId?: number | null;
  compose?: boolean;
  embedded?: boolean;
  compact?: boolean;
  /** Trail fills leftover height; composer sits flush at the bottom. */
  fill?: boolean;
}) {
  const notes = useJobNotes(jobId);
  const trailHeight = compact ? NOTES_TRAIL_COMPACT_HEIGHT : NOTES_TRAIL_HEIGHT;
  return (
    <Stack
      spacing={fill ? 1 : 0.75}
      sx={{
        width: '100%',
        minHeight: fill ? 0 : trailHeight + (compose ? NOTE_COMPOSER_HEIGHT + 8 : 0),
        flex: fill ? 1 : undefined,
      }}
    >
      <Box
        sx={{
          flex: fill ? 1 : undefined,
          minHeight: fill ? 0 : undefined,
          display: fill ? 'flex' : undefined,
          flexDirection: fill ? 'column' : undefined,
        }}
      >
        <ItemNotesTrail
          notes={notes.data ?? []}
          loading={notes.isLoading}
          embedded={embedded}
          compact={compact}
          fill={fill}
        />
      </Box>
      {compose ? (
        <Box sx={{ flexShrink: 0, minHeight: fill ? NOTE_COMPOSER_DENSE_HEIGHT : NOTE_COMPOSER_HEIGHT }}>
          <ItemNoteComposer itemId={itemId} jobId={jobId} dense={fill} />
        </Box>
      ) : null}
    </Stack>
  );
}
