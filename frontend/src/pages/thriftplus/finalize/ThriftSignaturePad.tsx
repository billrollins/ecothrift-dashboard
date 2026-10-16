import { Box, Button } from '@mui/material';
import { forwardRef, useImperativeHandle, useRef } from 'react';

/** The drawing's own size; the canvas is drawn at this size and stretched to the width it is shown at. */
const W = 900;
const H = 360;

export interface ThriftSignaturePadHandle {
  /** The signature as a PNG, or null when nothing is drawn (or the browser can't encode it). */
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
}

interface Props {
  /** Called with true once a line is drawn, and false on Clear. */
  onInk: (hasInk: boolean) => void;
  disabled?: boolean;
}

/**
 * The customer's signature with a finger (J5, Finalize Thrift+, owner 2026-10-16): black ink on white, Clear to start
 * over. The canvas keeps a fixed drawing size, so turning the phone never distorts or loses what was signed.
 */
const ThriftSignaturePad = forwardRef<ThriftSignaturePadHandle, Props>(function ThriftSignaturePad({ onInk, disabled = false }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointer = useRef<number | null>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const inked = useRef(false);

  const ctx = () => {
    const c = canvasRef.current?.getContext('2d') ?? null;
    if (c) {
      c.lineWidth = 6;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = '#111';
    }
    return c;
  };

  const wipe = () => {
    const c = ctx();
    if (c) {
      c.fillStyle = '#fff';
      c.fillRect(0, 0, W, H);
    }
  };

  const setCanvas = (el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (el && !inked.current) wipe();
  };

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = rect.width ? W / rect.width : 1;
    const sy = rect.height ? H / rect.height : 1;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const ink = () => {
    if (!inked.current) {
      inked.current = true;
      onInk(true);
    }
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || pointer.current != null) return;
    e.preventDefault();
    pointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // jsdom and some browsers refuse capture for synthetic pointers.
    }
    const p = point(e);
    last.current = p;
    const c = ctx();
    if (c) {
      // A tap leaves a dot.
      c.beginPath();
      c.arc(p.x, p.y, 3, 0, Math.PI * 2);
      c.fillStyle = '#111';
      c.fill();
    }
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || pointer.current !== e.pointerId || !last.current) return;
    const p = point(e);
    const c = ctx();
    if (c) {
      c.beginPath();
      c.moveTo(last.current.x, last.current.y);
      c.lineTo(p.x, p.y);
      c.stroke();
    }
    last.current = p;
    ink();
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== e.pointerId) return;
    pointer.current = null;
    last.current = null;
  };

  const clear = () => {
    wipe();
    inked.current = false;
    onInk(false);
  };

  useImperativeHandle(ref, () => ({
    clear,
    toBlob: () =>
      new Promise<Blob | null>((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas || !inked.current || typeof canvas.toBlob !== 'function') {
          resolve(null);
          return;
        }
        try {
          canvas.toBlob((b) => resolve(b), 'image/png');
        } catch {
          resolve(null);
        }
      }),
  }));

  return (
    <Box>
      <Box
        sx={{
          position: 'relative',
          border: 2,
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: '#fff',
          overflow: 'hidden',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={setCanvas}
          width={W}
          height={H}
          aria-label="Signature pad: sign with a finger"
          data-testid="thrift-signature-pad"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          style={{ display: 'block', width: '100%', aspectRatio: `${W} / ${H}`, touchAction: 'none', cursor: 'crosshair' }}
        />
        <Box
          aria-hidden
          sx={{ position: 'absolute', left: '6%', right: '6%', bottom: '22%', borderBottom: '1px dashed #9e9e9e', pointerEvents: 'none' }}
        />
      </Box>
      <Button size="large" onClick={clear} disabled={disabled} sx={{ mt: 1, minHeight: 48 }}>
        Clear
      </Button>
    </Box>
  );
});

export default ThriftSignaturePad;
