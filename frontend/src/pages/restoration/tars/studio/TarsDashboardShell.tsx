import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

/**
 * Restoration bench inside MainLayout: leave-the-item actions without the
 * dark fullscreen chrome.
 */
export function TarsDashboardShell({
  title,
  subtitle,
  identitySlot,
  noticeSlot,
  actionSlot,
  hideHeader,
  children,
}: {
  title: string;
  subtitle: string;
  identitySlot?: ReactNode;
  noticeSlot?: ReactNode;
  actionSlot?: ReactNode;
  /** The command deck already is the header. */
  hideHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
      }}
    >
      {hideHeader ? null : (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            mb: 0.75,
            minHeight: 52,
          }}
        >
          {identitySlot ?? (
            <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>
              <Typography variant="h5" fontWeight={600} noWrap>
                {title}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap sx={{ minHeight: 20 }}>
                {subtitle}
              </Typography>
            </Box>
          )}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {noticeSlot}
            {actionSlot}
          </Stack>
        </Box>
      )}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>{children}</Box>
    </Box>
  );
}
