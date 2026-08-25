import { Box } from '@mui/material';
import { useTheme } from '@mui/material/styles';

/** Red count of work waiting behind a nav row or workspace. Hidden at zero. */
export function NavWaitingBadge({ count }: { count: number }) {
  const theme = useTheme();
  if (!count) return null;
  return (
    <Box
      component="span"
      aria-label={`${count} waiting`}
      sx={{
        flexShrink: 0,
        minWidth: 18,
        height: 18,
        px: 0.5,
        borderRadius: 999,
        bgcolor: theme.palette.error.main,
        color: theme.palette.error.contrastText,
        fontSize: '0.6875rem',
        fontWeight: 700,
        lineHeight: '18px',
        textAlign: 'center',
      }}
    >
      {count > 99 ? '99+' : count}
    </Box>
  );
}

/** Corner pip on a workspace icon. Off the flow so it cannot shove the row. */
export function NavIconWaitingBadge({ count }: { count: number }) {
  const theme = useTheme();
  if (!count) return null;
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        position: 'absolute',
        right: -4,
        bottom: -3,
        zIndex: 1,
        minWidth: 14,
        height: 14,
        px: '3px',
        borderRadius: 999,
        bgcolor: theme.palette.error.main,
        color: theme.palette.error.contrastText,
        boxShadow: '0 0 0 1.5px #FFFFFF',
        fontSize: '0.5625rem',
        fontWeight: 800,
        lineHeight: '14px',
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      {count > 9 ? '9+' : count}
    </Box>
  );
}
