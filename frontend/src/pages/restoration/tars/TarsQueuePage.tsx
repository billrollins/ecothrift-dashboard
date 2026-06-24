import { Box, Chip } from '@mui/material';
import { TarsIntakePanel } from './TarsIntakePanel';

/** Send to Restoration — intake queue and grade values. */
export default function TarsQueuePage() {
  return (
    <Box>
      <Chip
        label="Phase 0 — client mock"
        size="small"
        variant="outlined"
        color="warning"
        sx={{ mb: 2 }}
      />
      <TarsIntakePanel />
    </Box>
  );
}
