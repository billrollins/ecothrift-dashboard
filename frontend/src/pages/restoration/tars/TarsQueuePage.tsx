import { Box } from '@mui/material';
import { TarsIntakePanel } from './TarsIntakePanel';

/** Send to Restoration — intake queue and grade values. */
export default function TarsQueuePage() {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <TarsIntakePanel />
    </Box>
  );
}
