import { Box } from '@mui/material';
import { TarsWorkstation } from './tars/TarsWorkstation';

/** Timed restoration work, inside the dashboard chrome. */
export default function RestorationBenchPage() {
  return (
    <Box
      sx={{
        px: 0,
        py: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
      }}
    >
      <TarsWorkstation chrome="dashboard" />
    </Box>
  );
}
