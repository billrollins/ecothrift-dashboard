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
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 320;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(w * ratio);
      canvas.height = Math.floor(160 * ratio);
      canvas.style.width = `${w}px`;
      canvas.style.height = '160px';
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#111';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, 160);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };

  const onUp = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.clientWidth;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, 160);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    setHasInk(false);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    await new Promise<void>((resolve, reject) => {
      canvas.toBlob(
        async (b) => {
          if (!b) {
            reject(new Error('encode_failed'));
            return;
          }
          await onCapture(b);
          resolve();
        },
        'image/jpeg',
        0.92,
      );
    });
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
          style={{ display: 'block', width: '100%', height: 160, cursor: 'crosshair' }}
        />
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button size="large" onClick={clear} disabled={disabled} sx={{ minHeight: 44 }}>
          Clear
        </Button>
        <Button
          size="large"
          variant="contained"
          onClick={() => void save()}
          disabled={disabled || !hasInk}
          sx={{ minHeight: 44, flex: 1 }}
        >
          Save signature
        </Button>
      </Stack>
    </Box>
  );
}
