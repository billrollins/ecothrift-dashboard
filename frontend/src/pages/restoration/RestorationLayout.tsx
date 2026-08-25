import { Box } from '@mui/material';
import { Outlet } from 'react-router-dom';

/** Shared layout for Restoration routes (Overview + Bench + Parts Requests). */
export default function RestorationLayout() {
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Outlet />
    </Box>
  );
}

