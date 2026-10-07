import { Box, Button, Typography } from '@mui/material';
import { useEffect, useRef } from 'react';
import { ccTokens } from '../../theme';

/** Sign with a finger (or a mouse). Calls onChange with a PNG data URL, or '' when cleared or too short to count. */
export function SignaturePad({ onChange, error }: { onChange: (png: string) => void; error?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const ink = useRef(0);

  function setup() {
    const el = canvas.current;
    if (!el) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(el.clientWidth * ratio);
    el.height = Math.round(el.clientHeight * ratio);
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#1b2a4a';
  }

  useEffect(() => {
    setup();
    const resize = () => {
      // Resizing wipes the canvas; only redo it while nothing is drawn.
      if (ink.current === 0) setup();
    };
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext('2d');
    const next = point(e);
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }
    ink.current += Math.hypot(next.x - last.current.x, next.y - last.current.y);
    last.current = next;
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    // A real signature has some length to it; a tap or a dot does not count.
    onChange(ink.current > 40 && canvas.current ? canvas.current.toDataURL('image/png') : '');
  }

  function clear() {
    const el = canvas.current;
    if (!el) return;
    el.getContext('2d')?.clearRect(0, 0, el.width, el.height);
    ink.current = 0;
    onChange('');
  }

  return (
    <Box>
      <Box
        sx={{
          position: 'relative',
          border: `1.5px dashed ${error ? '#c0392b' : ccTokens.line}`,
          borderRadius: '8px',
          bgcolor: '#fff',
        }}
      >
        <canvas
          ref={canvas}
          aria-label="Sign here with your finger"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          style={{ display: 'block', width: '100%', height: 180, touchAction: 'none', cursor: 'crosshair' }}
        />
        <Box sx={{ position: 'absolute', left: 16, right: 16, bottom: 40, borderBottom: '1px solid #c9c9c0', pointerEvents: 'none' }} />
        <Typography variant="caption" color="text.secondary" sx={{ position: 'absolute', left: 16, bottom: 12, pointerEvents: 'none' }}>
          Sign above the line with your finger
        </Typography>
        <Button size="small" onClick={clear} sx={{ position: 'absolute', top: 6, right: 6 }}>
          Clear
        </Button>
      </Box>
      {error && (
        <Typography variant="caption" sx={{ color: '#a33027', fontWeight: 600 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}
