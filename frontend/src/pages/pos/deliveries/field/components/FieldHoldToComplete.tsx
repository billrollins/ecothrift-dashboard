import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { ecoField } from '../ecoFieldTheme';

type Props = {
  /** Shown when the control is disabled (e.g. missing proof). */
  disabledLabel?: string;
  disabled?: boolean;
  holdMs?: number;
  onComplete: () => void | Promise<void>;
};

const MOVE_ABORT_PX = 10;

/** Press-and-hold confirm that does not fight horizontal card paging. */
export function FieldHoldToComplete({
  disabledLabel = 'Finish proof first',
  disabled,
  holdMs = 900,
  onComplete,
}: Props) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [pending, setPending] = useState(false);
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const activePointerId = useRef<number | null>(null);

  const clearRaf = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const reset = () => {
    clearRaf();
    startRef.current = null;
    activePointerId.current = null;
    if (!firedRef.current) {
      setHolding(false);
      setProgress(0);
    }
  };

  useEffect(() => () => clearRaf(), []);

  // Fail-safe: cancel hold on window-level release even if pointer capture is stolen.
  useEffect(() => {
    if (!holding || pending) return;
    const onWindowEnd = (e: PointerEvent) => {
      if (activePointerId.current != null && e.pointerId !== activePointerId.current) return;
      if (firedRef.current) return;
      reset();
    };
    window.addEventListener('pointerup', onWindowEnd);
    window.addEventListener('pointercancel', onWindowEnd);
    return () => {
      window.removeEventListener('pointerup', onWindowEnd);
      window.removeEventListener('pointercancel', onWindowEnd);
    };
  }, [holding, pending]);

  const finish = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    clearRaf();
    setProgress(1);
    setHolding(false);
    setPending(true);
    startRef.current = null;
    activePointerId.current = null;
    try {
      navigator.vibrate?.(30);
    } catch {
      // Optional haptics.
    }
    void Promise.resolve(onComplete()).finally(() => {
      firedRef.current = false;
      setPending(false);
      setProgress(0);
    });
  };

  const tick = (now: number) => {
    const start = startRef.current;
    if (!start) return;
    const next = Math.min(1, (now - start.t) / holdMs);
    setProgress(next);
    if (next >= 1) {
      finish();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const isDisabled = Boolean(disabled || pending);

  const onPointerDown = (e: React.PointerEvent) => {
    if (isDisabled || e.button !== 0) return;
    if (activePointerId.current != null) return;
    activePointerId.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    firedRef.current = false;
    startRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setHolding(true);
    setProgress(0);
    clearRaf();
    rafRef.current = requestAnimationFrame(tick);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (activePointerId.current != null && e.pointerId !== activePointerId.current) return;
    const start = startRef.current;
    if (!start || firedRef.current) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    if (dx > MOVE_ABORT_PX || dy > MOVE_ABORT_PX) {
      reset();
    }
  };

  const onPointerEnd = (e: React.PointerEvent) => {
    if (activePointerId.current != null && e.pointerId !== activePointerId.current) return;
    if (firedRef.current) return;
    reset();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isDisabled) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (firedRef.current || pending) return;
    finish();
  };

  const label = disabled
    ? disabledLabel
    : pending
      ? 'Completing…'
      : holding
        ? 'Keep holding…'
        : 'Hold to complete';

  return (
    <Box
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled || undefined}
      aria-busy={holding || pending || undefined}
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onKeyDown={onKeyDown}
      sx={{
        position: 'relative',
        mt: 2,
        height: 64,
        borderRadius: 999,
        bgcolor: isDisabled ? '#C9D4CE' : ecoField.green,
        opacity: isDisabled ? 0.55 : 1,
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'pan-y',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        display: 'grid',
        placeItems: 'center',
        outline: 'none',
        '&:focus-visible': {
          boxShadow: `0 0 0 3px ${ecoField.tint}, 0 0 0 5px ${ecoField.green}`,
        },
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          width: `${progress * 100}%`,
          bgcolor: ecoField.greenDeep,
          transition: holding ? 'none' : 'width 160ms ease',
          pointerEvents: 'none',
        }}
      />
      <Typography
        sx={{
          position: 'relative',
          zIndex: 1,
          color: '#fff',
          fontWeight: 800,
          letterSpacing: '.02em',
          px: 2,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
