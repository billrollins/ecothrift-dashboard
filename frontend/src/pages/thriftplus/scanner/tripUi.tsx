/**
 * Pieces of the trip scanner (owner 2026-10-13, from the demos of 10-12 and 10-13): the big ThriftBucks number and its
 * count-up, the 3-day returns / AS IS badge, the thumb buttons, the bottom sheet, swipe-left lines with Undo, and the
 * quantity control. The look is the scanner's own (scannerTheme.tsx).
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, ButtonBase } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import AssignmentReturnRounded from '@mui/icons-material/AssignmentReturnRounded';
import BlockRounded from '@mui/icons-material/BlockRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import { tbNumber } from '../../../components/thriftplus/ThriftBucks';
import { Sparkle, sc, u } from './scannerTheme';

function reducedMotion(): boolean {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** A number that rolls from where it was (or `from`) to `target`. */
export function useCountUp(target: number, { ms = 650, from, delay = 0 }: { ms?: number; from?: number; delay?: number } = {}): number {
  const [shown, setShown] = useState(from ?? target);
  const at = useRef(from ?? target);
  useEffect(() => {
    const start = at.current;
    if (start === target) return;
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') {
      at.current = target;
      setShown(target);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / ms);
      const v = start + (target - start) * (1 - (1 - p) ** 3);
      at.current = p < 1 ? v : target;
      setShown(at.current);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [target, ms, delay]);
  return shown;
}

/** "+13.35" in the ThriftBucks face (heavy, rounded, fresh green), with sparkles. */
export function BigBucks({ value, size, sparkle = true }: { value: number; size: string; sparkle?: boolean }) {
  const some = value > 0.004;
  return (
    <Box component="span" sx={{ '--f': size, position: 'relative', display: 'inline-block', lineHeight: 1 }}>
      {sparkle && some && (
        <>
          <Sparkle size="calc(var(--f) * 0.3)" sx={{ left: 'calc(var(--f) * -0.38)', top: 'calc(var(--f) * -0.12)' }} />
          <Sparkle size="calc(var(--f) * 0.16)" sx={{ left: 'calc(var(--f) * -0.08)', top: 'calc(var(--f) * -0.22)' }} />
          <Sparkle size="calc(var(--f) * 0.24)" sx={{ right: 'calc(var(--f) * -0.32)', top: 'calc(var(--f) * -0.06)' }} />
        </>
      )}
      <Box
        component="span"
        sx={{
          fontFamily: sc.money,
          fontWeight: 900,
          fontSize: 'var(--f)',
          letterSpacing: '-0.035em',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          background: some ? 'linear-gradient(180deg, #7ddc5f 0%, #45b537 48%, #2c9128 100%)' : 'none',
          WebkitBackgroundClip: some ? 'text' : undefined,
          backgroundClip: some ? 'text' : undefined,
          color: some ? 'transparent' : sc.ink3,
          filter: some ? 'drop-shadow(0 calc(var(--f) * 0.045) calc(var(--f) * 0.06) rgba(34, 105, 30, 0.3))' : 'none',
        }}
      >
        {some ? '+' : ''}
        {tbNumber(value)}
      </Box>
    </Box>
  );
}

/**
 * 3-day returns or AS IS, big enough to notice (owner 2026-10-13: "that's pretty important"; A3: the scanner says
 * which). Tap it for what it means.
 */
export function ReturnsBadge({ ok, small = false, onClick }: { ok: boolean; small?: boolean; onClick?: () => void }) {
  return (
    <ButtonBase
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      data-testid={ok ? 'badge-returns' : 'badge-as-is'}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: u(12), px: u(small ? 20 : 36), py: u(small ? 8 : 16), borderRadius: 99,
        bgcolor: ok ? sc.greenTint : '#fbefd5', color: ok ? sc.greenDeep : sc.warnText, border: `${u(3)} solid ${ok ? '#bfe0ae' : '#ecd29a'}`,
        fontSize: u(small ? 26 : 36), fontWeight: 800, whiteSpace: 'nowrap', fontFamily: sc.font,
      }}
    >
      {ok ? <AssignmentReturnRounded sx={{ fontSize: u(small ? 32 : 46) }} /> : <BlockRounded sx={{ fontSize: u(small ? 30 : 44) }} />}
      {ok ? '3-day returns' : 'AS IS · no returns'}
    </ButtonBase>
  );
}

/** A big round button for the thumb: quiet (white) or primary (green). */
export function BigButton({ children, onClick, primary = false, testId, flex = 1, disabled = false }: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  testId?: string;
  flex?: number;
  disabled?: boolean;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      sx={{
        flex,
        height: u(116),
        borderRadius: 99,
        gap: u(12),
        fontSize: u(36),
        fontWeight: 700,
        whiteSpace: 'nowrap',
        fontFamily: sc.font,
        bgcolor: primary ? sc.green : '#fff',
        color: primary ? '#fff' : sc.ink,
        border: primary ? 'none' : `${u(3)} solid ${sc.line}`,
        boxShadow: primary ? '0 6px 16px rgba(46,122,38,0.32)' : '0 3px 10px rgba(31,38,29,0.10)',
        opacity: disabled ? 0.45 : 1,
        transition: 'transform 90ms',
        '&:active': { transform: 'scale(0.97)' },
      }}
    >
      {children}
    </ButtonBase>
  );
}

/** A sheet up from the bottom over a dimmed screen; tap outside or × to close. */
export function Sheet({ children, onClose, testId, top }: { children: React.ReactNode; onClose: () => void; testId: string; top?: React.ReactNode }) {
  return (
    <Box data-testid={testId} sx={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <Box onClick={onClose} sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(16,21,17,0.45)', animation: 'tpDim 160ms ease-out',
        '@keyframes tpDim': { from: { opacity: 0 }, to: { opacity: 1 } } }} />
      <Box role="dialog" sx={{ position: 'relative', maxHeight: '90%', display: 'flex', flexDirection: 'column', bgcolor: sc.page,
        borderRadius: `${u(40)} ${u(40)} 0 0`, overflow: 'hidden', boxShadow: '0 -10px 30px rgba(0,0,0,0.25)',
        animation: 'tpSheet 220ms cubic-bezier(.2,.8,.3,1)', '@keyframes tpSheet': { from: { transform: 'translateY(40%)', opacity: 0.4 }, to: { transform: 'none', opacity: 1 } } }}>
        {top}
        <ButtonBase onClick={onClose} aria-label="Close"
          sx={{ position: 'absolute', top: u(20), right: u(20), zIndex: 2, width: u(76), height: u(76), borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.92)', color: sc.ink2 }}>
          <CloseRounded sx={{ fontSize: u(46) }} />
        </ButtonBase>
        <Box sx={{ overflowY: 'auto', px: u(40), pt: u(30), pb: `calc(${u(44)} + env(safe-area-inset-bottom, 0px))` }}>{children}</Box>
      </Box>
    </Box>
  );
}

/** "Removed Oak Bookshelf · Undo", for a few seconds. */
export function useUndo(bottom = 24) {
  const [toast, setToast] = useState<{ id: number; text: string; undo: () => void } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);
  const show = (text: string, undo: () => void) => {
    if (timer.current != null) window.clearTimeout(timer.current);
    setToast({ id: Date.now(), text, undo });
    timer.current = window.setTimeout(() => setToast(null), 4500);
  };
  const node = toast && (
    <Box
      key={toast.id}
      role="status"
      data-testid="undo-toast"
      sx={{
        position: 'absolute', left: '50%', bottom: u(bottom), transform: 'translateX(-50%)', zIndex: 25,
        display: 'flex', alignItems: 'center', gap: u(24), pl: u(34), pr: u(16), py: u(10), borderRadius: 99,
        bgcolor: 'rgba(16,21,17,0.93)', color: '#fff', fontSize: u(28), whiteSpace: 'nowrap', maxWidth: '94%',
        boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
      }}
    >
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{toast.text}</Box>
      <ButtonBase
        onClick={() => {
          toast.undo();
          setToast(null);
        }}
        sx={{ px: u(20), py: u(10), borderRadius: 99, color: '#7fe36a', fontWeight: 800, fontSize: u(28) }}
      >
        Undo
      </ButtonBase>
    </Box>
  );
  return { show, node };
}

/** − 1 +; at 1 the minus is a bin (takes the line out). */
export function QtyStepper({ qty, onChange, size = 58 }: { qty: number; onChange: (qty: number) => void; size?: number }) {
  const btn = { width: u(size), height: u(size), borderRadius: '50%', flexShrink: 0 } as const;
  return (
    <Box
      data-testid="qty-stepper"
      onPointerDown={(e) => e.stopPropagation()}
      sx={{ display: 'inline-flex', alignItems: 'center', borderRadius: 99, border: `${u(3)} solid ${sc.line}`, bgcolor: '#fff', flexShrink: 0 }}
    >
      <ButtonBase aria-label={qty === 1 ? 'Remove' : 'One less'} onClick={() => onChange(qty - 1)} sx={{ ...btn, color: qty === 1 ? sc.badText : sc.ink }}>
        {qty === 1 ? <DeleteOutlineRounded sx={{ fontSize: u(40) }} /> : <RemoveRounded sx={{ fontSize: u(40) }} />}
      </ButtonBase>
      <Box data-testid="qty" sx={{ minWidth: u(44), textAlign: 'center', fontWeight: 800, fontSize: u(32), fontVariantNumeric: 'tabular-nums' }}>{qty}</Box>
      <ButtonBase aria-label="One more" onClick={() => onChange(qty + 1)} sx={{ ...btn, color: sc.green }}>
        <AddRounded sx={{ fontSize: u(42) }} />
      </ButtonBase>
    </Box>
  );
}

/** A line that slides left to show "Remove", and goes when let go far enough (owner 2026-10-12). */
export function SwipeRow({ children, onRemove, label, onTap }: { children: React.ReactNode; onRemove: () => void; label: string; onTap?: () => void }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; on: boolean } | null>(null);
  const dxRef = useRef(0);
  const set = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.on) {
      // A tap, not a slide: open the line (APP D12).
      if (e.type === 'pointerup') onTap?.();
      return;
    }
    setDragging(false);
    const w = e.currentTarget.offsetWidth || 300;
    if (dxRef.current < -w * 0.32) {
      set(-w * 1.05);
      window.setTimeout(onRemove, 170);
    } else set(0);
  };
  return (
    <Box data-testid="swipe-row" aria-label={label} sx={{ position: 'relative', flexShrink: 0, borderRadius: u(26), overflow: 'hidden', boxShadow: sc.tileShadow }}>
      <Box aria-hidden sx={{ position: 'absolute', inset: 0, bgcolor: '#c8402f', color: '#fff', display: 'flex', alignItems: 'center',
        justifyContent: 'flex-end', gap: u(10), pr: u(36), fontSize: u(30), fontWeight: 800, opacity: dx < 0 ? 1 : 0 }}>
        <DeleteOutlineRounded sx={{ fontSize: u(44) }} /> Remove
      </Box>
      <Box
        onPointerDown={(e) => {
          drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const mx = e.clientX - d.x;
          if (!d.on) {
            if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(e.clientY - d.y)) return;
            d.on = true;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }
          set(Math.min(0, mx));
        }}
        onPointerUp={up}
        onPointerCancel={up}
        role={onTap ? 'button' : undefined}
        sx={{ position: 'relative', bgcolor: sc.card, border: '1px solid #ecede8', borderRadius: u(26), touchAction: 'pan-y', userSelect: 'none',
          cursor: onTap ? 'pointer' : undefined, '&:active': onTap ? { bgcolor: '#e7f3e0' } : undefined,
          transform: `translateX(${dx}px)`, transition: dragging ? 'none' : 'transform 170ms ease-out' }}
      >
        {children}
      </Box>
    </Box>
  );
}

/** Right adds, left passes (owner 2026-10-13: allowed, never mentioned). Taps and scrolling stay taps and scrolls. */
export function useSwipe(onAdd: (() => void) | null, onPass: () => void) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; on: boolean } | null>(null);
  const dxRef = useRef(0);
  const set = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };
  const end = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    setDragging(false);
    const w = e.currentTarget.offsetWidth || 320;
    const reach = Math.min(120, w * 0.28);
    const right = dxRef.current > 0;
    // A card that can't go in the trip (sold, not found) springs back from a right swipe.
    if (Math.abs(dxRef.current) < reach || (right && !onAdd)) {
      set(0);
      return;
    }
    setLeaving(true);
    set(right ? w * 1.3 : -w * 1.3);
    window.setTimeout(right && onAdd ? onAdd : onPass, 200);
  };
  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!leaving) drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const mx = e.clientX - d.x;
      if (!d.on) {
        if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(e.clientY - d.y)) return;
        d.on = true;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      set(mx);
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
  const style = {
    transform: dx ? `translateX(${dx}px) rotate(${dx / 26}deg)` : undefined,
    opacity: leaving ? 0 : 1,
    transition: dragging ? 'none' : 'transform 200ms ease-out, opacity 200ms ease-in',
    touchAction: 'pan-y' as const,
  };
  return { handlers, style };
}
