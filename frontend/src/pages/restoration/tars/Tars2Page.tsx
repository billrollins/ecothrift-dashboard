import { Box } from '@mui/material';
import { TarsWorkstation } from './TarsWorkstation';

/** TARS 2 — full-width bench; queues & scan in a left drawer. */
export default function Tars2Page() {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <TarsWorkstation railLayout="drawer" />
    </Box>
  );
}
