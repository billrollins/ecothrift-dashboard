import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, Button, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import type { MapLayer, MapPin, PinTransform, PlanDocument } from '../../types/floorplan.types';
import { DEFAULT_LABEL_SETTINGS } from '../../types/floorplan.types';
import { ElementShape, LabelShape, PathShape, ZoneShape } from './objectRenderers';
import type { PaletteIndex } from './palette';
import { applyTransform, IDENTITY, isOffPlan, round, suggestTransform } from './pinTransform';

interface AlignPinsStepProps {
  /** The plan becoming Current (drawn solid). */
  target: PlanDocument;
  /** The plan the pins are on now (drawn faint, scaled and moved with the pins). */
  source: PlanDocument;
  sourceName: string;
  pins: MapPin[];
  layers: MapLayer[];
  value: PinTransform;
  onChange: (next: PinTransform) => void;
  assets?: Map<number, string>;
  kindIndex?: PaletteIndex;
}

const PIN_PX = 7;

function PlanDrawing({ doc, assets, kindIndex }: { doc: PlanDocument; assets?: Map<number, string>; kindIndex?: PaletteIndex }) {
  const labelSettings = doc.settings.labels ?? DEFAULT_LABEL_SETTINGS;
  return (
    <>
      {doc.zones.map((zone) => (
        <ZoneShape key={zone.id} zone={zone} selected={false} labelSettings={labelSettings} />
      ))}
      {doc.elements.map((el) => (
        <ElementShape
          key={el.id}
          element={el}
          selected={false}
          labelSettings={labelSettings}
          imageHref={el.image != null ? assets?.get(el.image) : undefined}
          kindIndex={kindIndex}
        />
      ))}
      {doc.paths.map((path) => (
        <PathShape key={path.id} path={path} selected={false} />
      ))}
      {doc.labels.map((label) => (
        <LabelShape key={label.id} label={label} selected={false} />
      ))}
    </>
  );
}

/**
 * The alignment step of Make current (#130): the new plan with the old plan laid over it, faint, together with its
 * pins. The owner scales and moves the old plan (fields, or drag it) until the walls match, then confirms; the pins
 * are copied onto the new plan through that scale and move.
 */
export default function AlignPinsStep({
  target, source, sourceName, pins, layers, value, onChange, assets, kindIndex,
}: AlignPinsStepProps) {
  const tw = target.settings.planWidth;
  const th = target.settings.planHeight;
  const sw = source.settings.planWidth;
  const sh = source.settings.planHeight;
  const suggested = useMemo(() => suggestTransform({ width: sw, height: sh }, { width: tw, height: th }), [sw, sh, tw, th]);

  // The view holds both plans wherever the old one is moved, with room for pins just outside.
  const ox = Math.min(0, value.dx);
  const oy = Math.min(0, value.dy);
  const ex = Math.max(tw, value.dx + sw * value.scale);
  const ey = Math.max(th, value.dy + sh * value.scale);
  const pad = Math.max(ex - ox, ey - oy) * 0.04;
  const view = { x: ox - pad, y: oy - pad, w: ex - ox + pad * 2, h: ey - oy + pad * 2 };

  const svgRef = useRef<SVGSVGElement | null>(null);
  // The drawing fits the box (width, or the height cap): strokes and pins keep one size on screen.
  const [boxPx, setBoxPx] = useState({ w: 800, h: 450 });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) =>
      setBoxPx({ w: entry.contentRect.width || 800, h: entry.contentRect.height || 450 }),
    );
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const inchPerPx = Math.max(view.w / Math.max(1, boxPx.w), view.h / Math.max(1, boxPx.h));
  const pinR = PIN_PX * inchPerPx;
  const layerColor = new Map(layers.map((l) => [l.id, l.color]));

  const moved = pins.map((p) => ({ pin: p, at: applyTransform(p, value) }));
  const off = moved.filter((m) => isOffPlan(m.at, { width: tw, height: th })).length;

  // Drag the old plan to move it.
  const drag = useRef<{ x: number; y: number; start: PinTransform } | null>(null);
  const toPlan = (clientX: number, clientY: number) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const m = ctm.inverse();
    return { x: m.a * clientX + m.c * clientY + m.e, y: m.b * clientX + m.d * clientY + m.f };
  };
  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = toPlan(e.clientX, e.clientY);
    if (!p) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { ...p, start: value };
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toPlan(e.clientX, e.clientY);
    if (!p) return;
    onChange({ ...d.start, dx: round(d.start.dx + p.x - d.x, 1), dy: round(d.start.dy + p.y - d.y, 1) });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const commit = (key: keyof PinTransform, n: number) => onChange({ ...value, [key]: round(n, 4) });

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2">
        This plan is {fmtSize(tw, th)}; “{sourceName}” is {fmtSize(sw, sh)}. Drag the faint plan (or type a scale and a
        move) until its walls sit on this one. Its {pins.length} pin{pins.length === 1 ? '' : 's'} move with it.
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
        <DraftNumber label="Scale" unit="%" width={130} value={round(value.scale * 100, 2)} min={1} max={10000}
          onCommit={(n) => commit('scale', n / 100)} />
        <DraftNumber label="Move across" unit="in" width={150} value={value.dx} onCommit={(n) => commit('dx', n)} />
        <DraftNumber label="Move down" unit="in" width={150} value={value.dy} onCommit={(n) => commit('dy', n)} />
        <Button size="small" onClick={() => onChange(suggested)}>Best guess</Button>
        <Button size="small" onClick={() => onChange(IDENTITY)}>No change</Button>
      </Stack>
      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
        <svg
          ref={svgRef}
          role="img"
          aria-label="Line up the old pins"
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          width="100%"
          style={{ display: 'block', height: '55vh', cursor: 'move', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <rect x={0} y={0} width={tw} height={th} fill="#fafafa" stroke="#90a4ae" strokeWidth={inchPerPx} />
          {/* The new plan a little faded, the old one over it in a wash of orange, so both read. */}
          <g pointerEvents="none" opacity={0.55}>
            <PlanDrawing doc={target} assets={assets} kindIndex={kindIndex} />
          </g>
          <g transform={`translate(${value.dx} ${value.dy}) scale(${value.scale})`} pointerEvents="none">
            <rect x={0} y={0} width={sw} height={sh} fill="#f59e0b" fillOpacity={0.08} />
            <g opacity={0.45}>
              <PlanDrawing doc={source} assets={assets} kindIndex={kindIndex} />
            </g>
            <rect x={0} y={0} width={sw} height={sh} fill="none" stroke="#d97706" strokeWidth={(3 * inchPerPx) / value.scale} strokeDasharray={`${(10 * inchPerPx) / value.scale}`} />
          </g>
          {moved.map(({ pin, at }) => {
            const offPlan = isOffPlan(at, { width: tw, height: th });
            return (
              <circle
                key={pin.id}
                cx={at.x}
                cy={at.y}
                r={pinR}
                fill={offPlan ? '#dc2626' : layerColor.get(pin.layer) ?? '#2563eb'}
                stroke="#fff"
                strokeWidth={pinR * 0.3}
                pointerEvents="none"
              >
                <title>{pin.name}</title>
              </circle>
            );
          })}
        </svg>
      </Box>
      {/* Fixed-height line: the warning comes and goes without moving the buttons (no layout shift). */}
      <Typography variant="body2" color={off ? 'error' : 'text.secondary'} sx={{ minHeight: 20 }}>
        {off
          ? `${off} pin${off === 1 ? '' : 's'} (red) would land off this plan; they will be set at its edge.`
          : `Faint orange outline: “${sourceName}”. Every pin lands on this plan.`}
      </Typography>
    </Stack>
  );
}

/** A number field that applies on Enter or when you leave it, so typing "120" never passes through 1%. */
function DraftNumber({ label, unit, width, value, onCommit, min, max }: {
  label: string; unit: string; width: number; value: number; onCommit: (n: number) => void; min?: number; max?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const apply = () => {
    if (draft == null) return;
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n) && (min == null || n >= min) && (max == null || n <= max)) onCommit(n);
    setDraft(null);
  };
  return (
    <TextField
      label={label}
      size="small"
      type="number"
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          apply();
        }
      }}
      slotProps={{ input: { endAdornment: <InputAdornment position="end">{unit}</InputAdornment> } }}
      sx={{ width }}
    />
  );
}

function fmtSize(w: number, h: number): string {
  const ft = (inches: number) => `${round(inches / 12, 1)}'`;
  return `${ft(w)} × ${ft(h)}`;
}
