import { Box, Typography } from '@mui/material';
import { TarsWorkstation } from './TarsWorkstation';

/** Legacy fullscreen TARS Studio — parked at /restoration/tars-legacy. */
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
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: '#e8edf3',
      }}
    >
      <Box
        sx={{
          flexShrink: 0,
          minHeight: 28,
          px: 1.5,
          py: 0.4,
          bgcolor: '#fff4e0',
          borderBottom: '1px solid #f0cd93',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#8a5200', textAlign: 'center' }}>
          Legacy TARS Studio — Overview and Bench now live in the dashboard.
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <TarsWorkstation />
      </Box>
    </Box>
  );
}
