import Close from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { studio } from '../../pages/restoration/tars/studio/tarsStudioTheme';
import { useJobNotes } from '../../hooks/useItemNotes';
import { ItemNoteComposer } from './ItemNoteComposer';
import { ItemNotesTrail } from './ItemNotesTrail';

export function ItemNotesDrawer({
  open,
  jobId,
  itemId,
  title = 'Notes',
  onClose,
}: {
  open: boolean;
  jobId: number | null;
  itemId: number | null;
  title?: string;
  onClose: () => void;
}) {
  const notes = useJobNotes(open ? jobId : null);
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: {
            width: { xs: '100vw', sm: 400 },
            maxWidth: '100vw',
            bgcolor: studio.panel,
            p: 1.5,
          },
        },
      }}
    >
      <Stack spacing={1} sx={{ height: '100%' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontWeight: 900 }}>{title}</Typography>
          <IconButton aria-label="Close notes" onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <ItemNotesTrail notes={notes.data ?? []} loading={notes.isLoading} />
        </Box>
        <ItemNoteComposer itemId={itemId} jobId={jobId} />
      </Stack>
    </Drawer>
  );
}
