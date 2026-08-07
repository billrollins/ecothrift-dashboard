import Close from '@mui/icons-material/Close';
import { Box, Fade, IconButton, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { studio } from './tarsStudioTheme';

export type StudioFlashTone = 'info' | 'success' | 'warning' | 'error';

const TONE_SX: Record<StudioFlashTone, { bg: string; border: string; color: string }> = {
  info: { bg: '#e3f2fd', border: '#90caf9', color: '#0d47a1' },
  success: { bg: studio.accentSoft, border: studio.accentSoftBorder, color: studio.accentDark },
  warning: { bg: '#fff3e0', border: '#ffcc80', color: '#e65100' },
  error: { bg: '#ffebee', border: '#ef9a9a', color: '#b71c1c' },
};

/**
 * Overlay toast - never shifts document flow. Mount once; pass message to show.
 * Auto-fades after `durationMs` (default 4s). Empty message hides without layout jump.
 */
export function StudioFlashToast({
  message,
  tone = 'info',
  durationMs = 4000,
  onDismiss,
}: {
  message: string | null;
  tone?: StudioFlashTone;
  durationMs?: number;
  onDismiss?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [held, setHeld] = useState<string | null>(null);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setHeld(message);
    setVisible(true);
    const hide = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, durationMs);
    return () => window.clearTimeout(hide);
  }, [message, durationMs, onDismiss]);

  const palette = TONE_SX[tone];

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        pointerEvents: visible ? 'auto' : 'none',
        maxWidth: 'min(520px, calc(100% - 24px))',
        width: '100%',
      }}
    >
      <Fade in={visible} timeout={220}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0.75,
            px: 1.25,
            py: 0.85,
            borderRadius: `${studio.radius.md}px`,
            bgcolor: palette.bg,
            border: `1px solid ${palette.border}`,
            color: palette.color,
            boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, lineHeight: 1.35 }}>
            {held}
          </Typography>
          <IconButton
            size="small"
            aria-label="Dismiss"
            onClick={() => {
              setVisible(false);
              onDismiss?.();
            }}
            sx={{ color: 'inherit', p: 0.25, mt: -0.25 }}
          >
            <Close sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
      </Fade>
    </Box>
  );
}

/** Fixed-height slot for optional secondary fields - keeps layout stable when empty. */
export function StudioReservedSlot({
  show,
  height,
  children,
}: {
  show: boolean;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        height,
        overflow: 'hidden',
        opacity: show ? 1 : 0,
        pointerEvents: show ? 'auto' : 'none',
        transition: 'opacity 160ms ease',
      }}
    >
      {children}
    </Box>
  );
}
