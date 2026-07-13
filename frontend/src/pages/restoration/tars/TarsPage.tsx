import { Box } from '@mui/material';
import { TarsWorkstation } from './TarsWorkstation';

/** TARS Studio — guided restoration lifecycle. */
export default function TarsPage() {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
      <TarsWorkstation />
    </Box>
  );
}
