import { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack } from '@mui/material';

type Props = {
  onCapture: (blob: Blob) => void | Promise<void>;
  disabled?: boolean;
};

/** Simple finger/stylus signature capture for mobile delivery completion. */
export function SignaturePad({ onCapture, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const lastWidthRef = useRef(0);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const inkSnapshotRef = useRef<ImageData | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const applyStyle = (ctx: CanvasRenderingContext2D) => {
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111';
      ctx.fillStyle = '#fff';
    };

    const resize = () => {
      // Skip mid-stroke and no-op width changes (iOS toolbar collapse fires resize).
      if (drawing.current) return;
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 320;
      if (w === lastWidthRef.current && canvas.width > 0) return;
      lastWidthRef.current = w;
      const h = 160;
      const ratio = window.devicePixelRatio || 1;
      const prev = inkSnapshotRef.current;
      canvas.width = Math.floor(w * ratio);
      canvas.height = Math.floor(h * ratio);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      applyStyle(ctx);
      ctx.fillRect(0, 0, w, h);
      if (prev) {
        // Restore prior ink into the new canvas geometry (may soft-stretch on width change).
        const tmp = document.createElement('canvas');
        tmp.width = prev.width;
        tmp.height = prev.height;
        const tctx = tmp.getContext('2d');
        if (tctx) {
          tctx.putImageData(prev, 0, 0);
          ctx.drawImage(tmp, 0, 0, w, h);
          inkSnapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
      }
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, []);

  const snapshotInk = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    inkSnapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || saving) return;
    if (activePointerId.current != null) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    activePointerId.current = e.pointerId;
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled || saving) return;
    if (activePointerId.current != null && e.pointerId !== activePointerId.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activePointerId.current != null && e.pointerId !== activePointerId.current) return;
    if (drawing.current) snapshotInk();
    drawing.current = false;
    activePointerId.current = null;
  };

  const clear = () => {
    if (saving) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.clientWidth;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, 160);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    inkSnapshotRef.current = null;
    setHasInk(false);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || saving) return;
    setSaving(true);
    try {
      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(
          async (b) => {
            if (!b) {
              reject(new Error('encode_failed'));
              return;
            }
            try {
              await onCapture(b);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          'image/png',
        );
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Box
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: '#fff',
          touchAction: 'none',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{
            display: 'block',
            width: '100%',
            height: 160,
            cursor: 'crosshair',
            touchAction: 'none',
          }}
        />
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button size="large" onClick={clear} disabled={disabled || saving} sx={{ minHeight: 44 }}>
          Clear
        </Button>
        <Button
          size="large"
          variant="contained"
          onClick={() => void save()}
          disabled={disabled || saving || !hasInk}
          sx={{ minHeight: 44, flex: 1 }}
        >
          {saving ? 'Saving…' : 'Save signature'}
        </Button>
      </Stack>
    </Box>
  );
}
