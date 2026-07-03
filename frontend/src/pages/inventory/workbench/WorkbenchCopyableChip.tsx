import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Box, Chip, type ChipProps } from '@mui/material';
import { processingTokens } from '../processing/processingTokens';

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const copiedBubbleKeyframes = {
  '@keyframes workbenchCopyBubbleFade': {
    '0%': { opacity: 0, transform: 'translateY(-6px) scale(0.9)' },
    '12%': { opacity: 1, transform: 'translateY(0) scale(1)' },
    '72%': { opacity: 1, transform: 'translateY(0) scale(1)' },
    '100%': { opacity: 0, transform: 'translateY(6px) scale(0.94)' },
  },
} as const;

export interface WorkbenchCopyableChipProps extends Omit<ChipProps, 'onClick'> {
  copyText?: string;
  onBadgeClick?: () => void;
  copiedLabel?: string;
}

export function WorkbenchCopyableChip({
  copyText,
  onBadgeClick,
  copiedLabel = 'Copied!',
  label,
  clickable,
  sx,
  ...chipProps
}: WorkbenchCopyableChipProps) {
  const [copiedKey, setCopiedKey] = useState(0);
  const [showCopied, setShowCopied] = useState(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
  }, []);

  const textToCopy = copyText ?? (typeof label === 'string' ? label : '');
  const canInteract = Boolean(textToCopy);

  const handleClick = useCallback(async (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!textToCopy) return;
    const copied = await writeClipboard(textToCopy);
    if (!copied) return;
    setCopiedKey((k) => k + 1);
    setShowCopied(true);
    if (copiedTimerRef.current != null) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      copiedTimerRef.current = null;
      setShowCopied(false);
    }, 1400);
    onBadgeClick?.();
  }, [textToCopy, onBadgeClick]);

  return (
    <Box
      sx={{
        position: 'relative',
        flexShrink: 0,
        display: 'inline-flex',
        ...copiedBubbleKeyframes,
      }}
    >
      <Chip
        {...chipProps}
        label={label}
        clickable={clickable ?? canInteract}
        onClick={canInteract ? handleClick : undefined}
        sx={[
          ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
          canInteract ? { '&:hover': { bgcolor: '#f0f5f0' } } : {},
        ]}
      />
      {showCopied ?
        <Box
          key={copiedKey}
          role="status"
          aria-live="polite"
          sx={{
            position: 'absolute',
            top: 'calc(100% + 5px)',
            right: 0,
            zIndex: 20,
            px: 0.85,
            py: 0.35,
            borderRadius: '7px',
            bgcolor: processingTokens.textStrong,
            color: '#fff',
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: 0.2,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            boxShadow: '0 3px 10px rgba(15, 23, 42, 0.18)',
            animation: 'workbenchCopyBubbleFade 1.4s ease forwards',
            '&::before': {
              content: '""',
              position: 'absolute',
              top: -3,
              right: 12,
              width: 7,
              height: 7,
              bgcolor: processingTokens.textStrong,
              transform: 'rotate(45deg)',
              borderRadius: '1px',
            },
          }}
        >
          {copiedLabel}
        </Box>
      : null}
    </Box>
  );
}
