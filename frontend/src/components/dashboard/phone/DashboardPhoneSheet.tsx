import { Box, Drawer, IconButton, Typography } from '@mui/material';
import ArrowBack from '@mui/icons-material/ArrowBack';
import Close from '@mui/icons-material/Close';
import type { ReactNode } from 'react';
import { dashboardPalette } from '../dashboardCardStyles';

export function DashboardPhoneSheet({
  open,
  title,
  onClose,
  onBack,
  children,
  fullHeight = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
  fullHeight?: boolean;
}) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          maxWidth: 560,
          width: '100%',
          mx: 'auto',
          borderRadius: fullHeight ? 0 : '22px 22px 0 0',
          maxHeight: fullHeight ? '100dvh' : '88dvh',
          height: fullHeight ? '100dvh' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: dashboardPalette.surface,
          pb: 'env(safe-area-inset-bottom)',
        },
      }}
    >
      {!fullHeight ? (
        <Box
          sx={{
            width: 40,
            height: 4,
            borderRadius: 99,
            bgcolor: 'rgba(91, 111, 95, 0.28)',
            mx: 'auto',
            mt: 1,
            flexShrink: 0,
          }}
        />
      ) : null}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          minHeight: 52,
          px: 1.5,
          flexShrink: 0,
        }}
      >
        <Box sx={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {onBack ? (
            <IconButton onClick={onBack} aria-label="Back" sx={{ width: 40, height: 40 }}>
              <ArrowBack />
            </IconButton>
          ) : null}
        </Box>
        <Typography variant="subtitle1" fontWeight={800} noWrap sx={{ flex: 1, minWidth: 0 }}>
          {title}
        </Typography>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 40, height: 40 }}>
          <Close />
        </IconButton>
      </Box>
      <Box sx={{ px: 2, pb: 2, overflowY: 'auto', minHeight: 0, flex: 1 }}>
        {children}
      </Box>
    </Drawer>
  );
}
