/**
 * Interactive label canvas: aspect-correct mono render + drag/resize handles.
 */
import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';

import type { LabelDefinition, LabelElement } from '../../../api/labels.api';
import { loadImage, renderLabelToCanvas } from './renderTemplate';
import { previewValues, snapPct } from './designerState';

interface Props {
  widthIn: number;
  heightIn: number;
  definition: LabelDefinition;
  backgroundUrl?: string | null;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onMove: (index: number, x_pct: number, y_pct: number) => void;
  onResize: (index: number, w_pct: number, h_pct: number) => void;
  elementNames?: string[];
}

type DragMode = 'move' | 'resize';

export default function LabelCanvas({
  widthIn,
  heightIn,
  definition,
  backgroundUrl,
  selectedIndex,
  onSelect,
  onMove,
  onResize,
  elementNames = [],
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const rasterRef = useRef<HTMLCanvasElement | null>(null);
  const [bg, setBg] = useState<HTMLImageElement | null>(null);
  const [display, setDisplay] = useState<{ w: number; h: number }>({ w: 400, h: 267 });
  const dragRef = useRef<{
    mode: DragMode;
    index: number;
    startX: number;
    startY: number;
    orig: LabelElement;
  } | null>(null);

  useEffect(() => {
    if (!backgroundUrl) {
      setBg(null);
      return;
    }
    let cancelled = false;
    loadImage(backgroundUrl)
      .then((img) => {
        if (!cancelled) setBg(img);
      })
      .catch(() => {
        if (!cancelled) setBg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [backgroundUrl]);

  useEffect(() => {
    const host = stageRef.current?.parentElement;
    if (!host) return;
    const update = () => {
      const maxW = host.clientWidth || 480;
      const maxH = Math.min(520, window.innerHeight * 0.55);
      const aspect = widthIn / Math.max(0.01, heightIn);
      let w = maxW;
      let h = w / aspect;
      if (h > maxH) {
        h = maxH;
        w = h * aspect;
      }
      setDisplay({ w: Math.round(w), h: Math.round(h) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [widthIn, heightIn]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void renderLabelToCanvas({
        widthIn,
        heightIn,
        definition,
        values: previewValues(definition),
        background: bg,
      }).then((canvas) => {
        if (cancelled || !stageRef.current) return;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        canvas.style.pointerEvents = 'none';
        const prev = rasterRef.current;
        if (prev?.parentNode) prev.parentNode.replaceChild(canvas, prev);
        else stageRef.current.insertBefore(canvas, stageRef.current.firstChild);
        rasterRef.current = canvas;
      });
    }, 90);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [widthIn, heightIn, definition, bg]);

  const onPointerDownElement = (e: React.PointerEvent, index: number, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    const el = definition.elements[index];
    if (!el) return;
    onSelect(index);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      mode,
      index,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...el },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !stageRef.current) return;
    const dx = ((e.clientX - drag.startX) / stageRef.current.clientWidth) * 100;
    const dy = ((e.clientY - drag.startY) / stageRef.current.clientHeight) * 100;
    const orig = drag.orig;
    if (drag.mode === 'move') {
      onMove(drag.index, snapPct(orig.x_pct + dx), snapPct(orig.y_pct + dy));
    } else if (orig.type === 'qr' || orig.type === 'barcode') {
      let w = snapPct(orig.w_pct + dx, 1);
      let h = snapPct(orig.h_pct + dy, 1);
      w = Math.max(5, Math.min(100 - orig.x_pct, w));
      h = Math.max(5, Math.min(100 - orig.y_pct, h));
      if (orig.type === 'qr') {
        const side = Math.min(w, h);
        onResize(drag.index, side, side);
      } else {
        onResize(drag.index, w, h);
      }
    }
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <Box sx={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
      <Box
        ref={stageRef}
        onClick={() => onSelect(null)}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        sx={{
          position: 'relative',
          width: display.w,
          height: display.h,
          border: '1px solid #bbb',
          bgcolor: '#fff',
          userSelect: 'none',
        }}
      >
        {definition.elements.map((el, i) => {
          const selected = selectedIndex === i;
          const sized = el.type === 'qr' || el.type === 'barcode';
          return (
            <Box
              key={i}
              onPointerDown={(e) => onPointerDownElement(e, i, 'move')}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(i);
              }}
              sx={{
                position: 'absolute',
                left: `${el.x_pct}%`,
                top: `${el.y_pct}%`,
                width: sized ? `${el.w_pct}%` : 'auto',
                height: sized ? `${el.h_pct}%` : undefined,
                minWidth: sized ? undefined : 28,
                minHeight: sized ? undefined : 18,
                border: selected ? '2px solid #1976d2' : '1px dashed rgba(0,0,0,0.3)',
                boxSizing: 'border-box',
                cursor: 'move',
                background: selected ? 'rgba(25,118,210,0.08)' : 'transparent',
              }}
            >
              {selected && (
                <Box
                  sx={{
                    position: 'absolute',
                    left: 0,
                    top: -20,
                    px: 0.5,
                    maxWidth: 180,
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    fontSize: 10,
                    lineHeight: '18px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    pointerEvents: 'none',
                  }}
                >
                  {elementNames[i] ?? el.type.toUpperCase()}
                </Box>
              )}
              {selected && sized && (
                <Box
                  onPointerDown={(e) => onPointerDownElement(e, i, 'resize')}
                  sx={{
                    position: 'absolute',
                    right: -6,
                    bottom: -6,
                    width: 12,
                    height: 12,
                    bgcolor: '#1976d2',
                    borderRadius: '2px',
                    cursor: 'nwse-resize',
                  }}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
