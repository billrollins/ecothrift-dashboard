import { Box } from '@mui/material';
import { APP_VERSION } from '../../utils/appVersion';

/**
 * The release, small and grey in the bottom-right corner (owner 2026-10-20): staff can always see which version a phone
 * runs, and it never covers anything (it takes no taps). The splash screens no longer show it: on an iPhone the splash
 * is on screen for an instant. `bottom` lifts it above a bottom bar.
 */
export default function VersionTag({ bottom = 0, color = 'rgba(0,0,0,0.38)' }: { bottom?: number; color?: string }) {
  if (!APP_VERSION) return null;
  return (
    <Box
      aria-hidden
      data-testid="version-tag"
      sx={{
        position: 'fixed',
        right: 'calc(env(safe-area-inset-right, 0px) + 6px)',
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottom + 2}px)`,
        zIndex: 1400,
        fontSize: 10,
        lineHeight: 1,
        color,
        pointerEvents: 'none',
        userSelect: 'none',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {APP_VERSION}
    </Box>
  );
}
