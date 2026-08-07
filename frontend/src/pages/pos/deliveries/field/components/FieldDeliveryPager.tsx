import { useEffect, useRef, useState } from 'react';
import { Box, useMediaQuery } from '@mui/material';
import type { DeliveryRunStop } from '../../../../../types/pos.types';
import { FieldStopDots } from './FieldStopDots';
import type { DotTone } from '../fieldStepUtils';
import {
  canSwipeInDirection,
  gestureSuppressesTap,
  lockSwipeAxis,
  shouldCommitSwipe,
  swipeDirectionFromDelta,
  swipeProgressFromDelta,
  swipeVisualOffset,
  type SwipeDirection,
} from '../fieldStepUtils';

type Props = {
  stops: DeliveryRunStop[];
  selectedId: number | null;
  toneFor: (stop: DeliveryRunStop) => DotTone;
  onSelect: (stopId: number) => void;
  children: React.ReactNode;
  /** Freeze paging while a write is in flight so the card cannot swap under it. */
  disabled?: boolean;
};

type GesturePhase = 'idle' | 'dragging' | 'completing' | 'entering' | 'resetting';

type DragVisual = {
  offsetX: number;
  progress: number;
  direction: SwipeDirection;
  phase: GesturePhase;
};

const IDLE_VISUAL: DragVisual = {
  offsetX: 0,
  progress: 0,
  direction: 0,
  phase: 'idle',
};

export function FieldDeliveryPager({
  stops,
  selectedId,
  toneFor,
  onSelect,
  children,
  disabled,
}: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const locked = useRef<'h' | 'v' | null>(null);
  const pointerId = useRef<number | null>(null);
  const swiped = useRef(false);
  const committed = useRef(false);
  const widthRef = useRef(320);
  const selectedIdRef = useRef(selectedId);
  const stopsRef = useRef(stops);
  const visualRef = useRef<DragVisual>(IDLE_VISUAL);
  const [visual, setVisual] = useState<DragVisual>(IDLE_VISUAL);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  selectedIdRef.current = selectedId;
  stopsRef.current = stops;

  const updateVisual = (next: DragVisual) => {
    visualRef.current = next;
    setVisual(next);
  };

  useEffect(() => {
    // External selection changes (dots / auto-advance) clear leftover motion.
    if (
      visualRef.current.phase === 'completing' ||
      visualRef.current.phase === 'entering'
    ) {
      return;
    }
    updateVisual(IDLE_VISUAL);
  }, [selectedId]);

  // Android often treats touchmove as passive; non-passive lets us win horizontal swipes
  // over text/scroll regions on the whole card.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (locked.current !== 'h' || committed.current) return;
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      swiped.current = true;
      applyDrag(touch.clientX);
    };
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => el.removeEventListener('touchmove', onTouchMove);
    // applyDrag closes over stable refs; rebind when track mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const measureWidth = () => {
    const w = trackRef.current?.clientWidth ?? 0;
    if (w > 0) widthRef.current = w;
    return widthRef.current;
  };

  const resetGestureRefs = () => {
    startX.current = null;
    startY.current = null;
    locked.current = null;
    pointerId.current = null;
  };

  const neighborId = (direction: SwipeDirection): number | null => {
    if (!direction || !selectedIdRef.current) return null;
    const list = stopsRef.current;
    const idx = list.findIndex((s) => s.id === selectedIdRef.current);
    if (!canSwipeInDirection(idx, list.length, direction)) return null;
    return list[idx + direction]?.id ?? null;
  };

  const finishCommit = (direction: SwipeDirection) => {
    const nextId = neighborId(direction);
    if (nextId == null) {
      updateVisual(IDLE_VISUAL);
      committed.current = false;
      return;
    }
    const width = measureWidth();
    const exitX = direction > 0 ? -width : width;
    const enterFrom = direction > 0 ? width : -width;

    updateVisual({
      offsetX: exitX,
      progress: 1,
      direction,
      phase: 'completing',
    });

    const exitMs = reduceMotion ? 0 : 160;
    window.setTimeout(() => {
      onSelect(nextId);
      updateVisual({
        offsetX: enterFrom,
        progress: 0,
        direction,
        phase: 'entering',
      });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          updateVisual({
            offsetX: 0,
            progress: 0,
            direction: 0,
            phase: reduceMotion ? 'idle' : 'entering',
          });
          window.setTimeout(() => {
            updateVisual(IDLE_VISUAL);
            committed.current = false;
          }, reduceMotion ? 0 : 180);
        });
      });
    }, exitMs);
  };

  const snapBack = () => {
    updateVisual({
      ...visualRef.current,
      offsetX: 0,
      progress: 0,
      phase: 'resetting',
    });
    window.setTimeout(
      () => {
        updateVisual(IDLE_VISUAL);
        committed.current = false;
      },
      reduceMotion ? 0 : 180,
    );
  };

  const applyDrag = (clientX: number) => {
    if (startX.current == null || committed.current) return;

    const dx = clientX - startX.current;
    const width = measureWidth();
    const direction = swipeDirectionFromDelta(dx);
    const list = stopsRef.current;
    const idx = list.findIndex((s) => s.id === selectedIdRef.current);
    const canMove = canSwipeInDirection(idx, list.length, direction);
    const progress = canMove
      ? swipeProgressFromDelta(dx, width)
      : swipeProgressFromDelta(dx, width) * 0.35;
    const offsetX = swipeVisualOffset(dx, width, { canMove });

    updateVisual({
      offsetX,
      progress,
      direction,
      phase: 'dragging',
    });

    // Commit immediately at 100% so Android lostpointercapture can't steal the finish.
    if (canMove && shouldCommitSwipe(progress)) {
      committed.current = true;
      swiped.current = true;
      finishCommit(direction);
    }
  };

  const tryCommitOrSnap = (dx: number) => {
    const width = measureWidth();
    const direction = swipeDirectionFromDelta(dx);
    const list = stopsRef.current;
    const idx = list.findIndex((s) => s.id === selectedIdRef.current);
    const canMove = canSwipeInDirection(idx, list.length, direction);
    const progress = canMove ? swipeProgressFromDelta(dx, width) : 0;

    // Release past ~55% of the commit band still finishes - feels intentional on phones.
    if (canMove && (shouldCommitSwipe(progress) || progress >= 0.55)) {
      committed.current = true;
      swiped.current = true;
      finishCommit(direction);
      return;
    }
    snapBack();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || disabled) return;
    const phase = visualRef.current.phase;
    if (phase === 'completing' || phase === 'entering') return;

    startX.current = e.clientX;
    startY.current = e.clientY;
    locked.current = null;
    swiped.current = false;
    committed.current = false;
    pointerId.current = e.pointerId;
    measureWidth();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Optional; bubbling still tracks most devices.
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current == null || startY.current == null) return;
    if (pointerId.current != null && e.pointerId !== pointerId.current) return;
    if (committed.current) return;

    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;

    if (!locked.current) {
      locked.current = lockSwipeAxis(dx, dy);
      if (!locked.current) return;
      if (locked.current === 'v') return;
    }
    if (locked.current !== 'h') return;

    e.preventDefault();
    if (gestureSuppressesTap(dx, widthRef.current)) {
      swiped.current = true;
    }
    applyDrag(e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (startX.current == null) return;
    if (pointerId.current != null && e.pointerId !== pointerId.current) return;
    if (committed.current) {
      resetGestureRefs();
      return;
    }

    if (locked.current === 'h') {
      tryCommitOrSnap(e.clientX - startX.current);
    } else {
      updateVisual(IDLE_VISUAL);
    }
    resetGestureRefs();
  };

  const onPointerCancel = () => {
    if (committed.current) {
      resetGestureRefs();
      return;
    }
    const current = visualRef.current;
    if (
      locked.current === 'h' &&
      current.progress >= 0.55 &&
      current.direction !== 0
    ) {
      const direction = current.direction;
      const list = stopsRef.current;
      const idx = list.findIndex((s) => s.id === selectedIdRef.current);
      if (canSwipeInDirection(idx, list.length, direction)) {
        committed.current = true;
        swiped.current = true;
        finishCommit(direction);
        resetGestureRefs();
        return;
      }
    }
    if (locked.current === 'h') snapBack();
    else updateVisual(IDLE_VISUAL);
    resetGestureRefs();
  };

  const dragging = visual.phase === 'dragging';
  const animated =
    visual.phase === 'completing' ||
    visual.phase === 'entering' ||
    visual.phase === 'resetting';

  const transition = (() => {
    if (reduceMotion || dragging) return 'none';
    if (visual.phase === 'completing') return 'transform 160ms ease-out, opacity 160ms ease-out';
    if (visual.phase === 'entering' || visual.phase === 'resetting') {
      return 'transform 180ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease-out';
    }
    return 'none';
  })();

  const opacity =
    dragging || visual.phase === 'completing'
      ? Math.max(0.35, 1 - visual.progress * 0.45)
      : 1;
  const scale =
    dragging || visual.phase === 'completing'
      ? Math.max(0.94, 1 - visual.progress * 0.04)
      : 1;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {stops.length > 0 && (
        <FieldStopDots
          stops={stops}
          selectedId={selectedId}
          toneFor={toneFor}
          onSelect={onSelect}
          disabled={disabled}
        />
      )}
      <Box
        ref={trackRef}
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
          touchAction: 'pan-y',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          // Entire card surface (not just buttons) feeds the swipe gesture.
          '& *': { touchAction: 'pan-y' },
          // Keep intentional taps on controls snappy; horizontal still bubbles to us.
          '& a, & button, & [role="button"]': { touchAction: 'manipulation' },
          '&::before':
            (dragging || visual.phase === 'completing') && visual.direction !== 0
              ? {
                  content: '""',
                  position: 'absolute',
                  inset: '8px 16px',
                  borderRadius: 3,
                  bgcolor: '#EEF3F0',
                  transform: `translateX(${visual.direction > 0 ? 18 : -18}px) scale(0.98)`,
                  opacity: 0.35 + visual.progress * 0.45,
                  pointerEvents: 'none',
                  zIndex: 0,
                }
              : {},
        }}
        onPointerDownCapture={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={() => {
          if (committed.current || startX.current == null) return;
          onPointerCancel();
        }}
        onClickCapture={(e) => {
          if (swiped.current || animated) {
            e.preventDefault();
            e.stopPropagation();
            swiped.current = false;
          }
        }}
      >
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            zIndex: 1,
            transform: `translate3d(${visual.offsetX}px, 0, 0) scale(${scale})`,
            opacity,
            transition,
            willChange: dragging || animated ? 'transform, opacity' : 'auto',
            pointerEvents: visual.phase === 'completing' ? 'none' : 'auto',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
