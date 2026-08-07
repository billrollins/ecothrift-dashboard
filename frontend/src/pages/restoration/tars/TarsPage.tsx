import { Box } from '@mui/material';
import { TarsWorkstation } from './TarsWorkstation';

/** TARS Studio - guided restoration lifecycle. */
export default function TarsPage() {
  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100dvh',
        minHeight: 0,
        display: 'flex',
        overflow: 'hidden',
        bgcolor: '#e8edf3',
      }}
    >
      <TarsWorkstation />
    </Box>
  );
}
