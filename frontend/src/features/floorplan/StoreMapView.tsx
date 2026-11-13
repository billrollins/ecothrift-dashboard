import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import type { MapLayer, MapPin, PlanDocument } from '../../types/floorplan.types';
import { DEFAULT_LABEL_SETTINGS } from '../../types/floorplan.types';
import { ElementShape, LabelShape, PathShape, ZoneShape } from './objectRenderers';
import type { PaletteIndex } from './palette';

/** Room around the drawn plan so a pin on an outside wall is still on the map (inches). */
const MAP_MARGIN = 24;
/** Pin size on screen, whatever the zoom (px). */
const PIN_RADIUS_PX = 9;
const ZOOMS = [1, 1.5, 2, 3, 4];

export interface StoreMapPoint {
  x: number;
  y: number;
}

interface StoreMapViewProps {
  doc: PlanDocument;
  layers: MapLayer[];
  pins: MapPin[];
  /** Layers turned on; pins on other layers are hidden. */
  visibleLayerIds: Set<number>;
  assets?: Map<number, string>;
  kindIndex?: PaletteIndex;
  /** Pins drawn larger with a ring (the pins of the chosen sign, or the tapped pin). */
  highlightedPinIds?: Set<number>;
  /** Dim every pin that is not highlighted. */
  dimOthers?: boolean;
  /** Placing a new pin: crosshair cursor and onMapClick on a tap. */
  placing?: boolean;
  onMapClick?: (point: StoreMapPoint) => void;
  onPinClick?: (pin: MapPin) => void;
  /** Managers: drag a pin to move it. Omit for a read-only map. */
  onPinMove?: (pin: MapPin, point: StoreMapPoint) => void;
  /** Show each pin's name beside it. */
  showNames?: boolean;
  /** Tallest the map may be before it scrolls (px). */
  maxHeight?: number | string;
  /**
   * Fill the parent's height (#129): the box takes all the room it is given and the whole store fits inside it at
   * the first zoom step, however tall the plan is. The parent needs a height.
   */
  fill?: boolean;
  /** A pin's own colour (e.g. by its status); the layer colour when it gives none. */
  pinColor?: (pin: MapPin) => string | undefined;
}

/**
 * The store map: a plan drawn read-only with its layers of pins on top (#105). Coordinates are plan inches,
 * the same frame as the plan document, so pins line up with the Studio designer's drawing.
 */
export default function StoreMapView({
  doc,
  layers,
  pins,
  visibleLayerIds,
  assets,
  kindIndex,
  highlightedPinIds,
  dimOthers = false,
  placing = false,
  onMapClick,
  onPinClick,
  onPinMove,
  showNames = false,
  maxHeight = '70vh',
  fill = false,
  pinColor,
}: StoreMapViewProps) {
  const { planWidth, planHeight } = doc.settings;
  const labelSettings = doc.settings.labels ?? DEFAULT_LABEL_SETTINGS;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const zoom = ZOOMS[zoomIndex];
  const [svgWidthPx, setSvgWidthPx] = useState(800);
  // The ref is what the pointer handlers read (events can arrive before a re-render); the state draws the pin.
  type Drag = { pin: MapPin; point: StoreMapPoint; moved: boolean };
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const updateDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  // fill: the scroll box's size, so zoom 1 fits the whole plan inside it.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!fill || !el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setBox({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fill]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setSvgWidthPx(entry.contentRect.width || 800));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const viewW = planWidth + MAP_MARGIN * 2;
  const viewH = planHeight + MAP_MARGIN * 2;
  // Inches per screen pixel, so pins keep one size on screen at every zoom.
  const inchPerPx = viewW / Math.max(1, svgWidthPx);
  const pinR = PIN_RADIUS_PX * inchPerPx;
  // fill: the widest the plan can be while all of it shows in the box (whole pixels, so no scroll bar at zoom 1).
  const fitWidthPx = fill && box ? Math.floor(Math.min(box.w, (box.h * viewW) / viewH)) : null;

  const layerById = useMemo(() => new Map(layers.map((l) => [l.id, l])), [layers]);
  const shownPins = useMemo(() => {
    const visible = pins.filter((p) => visibleLayerIds.has(p.layer));
    // Highlighted pins draw last, on top.
    return visible.sort((a, b) => Number(highlightedPinIds?.has(a.id) ?? false) - Number(highlightedPinIds?.has(b.id) ?? false));
  }, [pins, visibleLayerIds, highlightedPinIds]);

  const toPlan = (clientX: number, clientY: number): StoreMapPoint | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const m = ctm.inverse();
    const x = m.a * clientX + m.c * clientY + m.e;
    const y = m.b * clientX + m.d * clientY + m.f;
    // Half-inch steps: plenty for a pin, and the saved numbers stay short.
    return { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 };
  };

  const handleBackgroundClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!placing || !onMapClick) return;
    const point = toPlan(e.clientX, e.clientY);
    if (point) onMapClick(point);
  };

  const handlePinPointerDown = (pin: MapPin) => (e: ReactPointerEvent<SVGGElement>) => {
    e.stopPropagation();
    if (!onPinMove) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    updateDrag({ pin, point: { x: pin.x, y: pin.y }, moved: false });
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const point = toPlan(e.clientX, e.clientY);
    if (!point) return;
    const far = Math.hypot(point.x - current.pin.x, point.y - current.pin.y) > pinR * 0.6;
    if (far || current.moved) updateDrag({ ...current, point, moved: true });
  };

  const finishDrag = () => {
    const current = dragRef.current;
    if (!current) return;
    updateDrag(null);
    if (current.moved && onPinMove) onPinMove(current.pin, current.point);
    else onPinClick?.(current.pin);
  };

  return (
    <Box
      sx={{
        position: 'relative', border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: '#fff',
        ...(fill ? { height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' } : {}),
      }}
    >
      <Stack
        direction="row"
        spacing={0.5}
        sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, bgcolor: 'background.paper', borderRadius: 1, boxShadow: 1 }}
      >
        <Tooltip title="Zoom out">
          <span>
            <IconButton size="small" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex((z) => Math.max(0, z - 1))}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Whole store">
          <span>
            <IconButton size="small" aria-label="Whole store" disabled={zoomIndex === 0} onClick={() => setZoomIndex(0)}>
              <FitScreenIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Zoom in">
          <span>
            <IconButton size="small" aria-label="Zoom in" disabled={zoomIndex === ZOOMS.length - 1} onClick={() => setZoomIndex((z) => Math.min(ZOOMS.length - 1, z + 1))}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      {placing && (
        <Typography
          variant="caption"
          sx={{ position: 'absolute', top: 10, left: 10, zIndex: 1, bgcolor: 'primary.main', color: 'primary.contrastText', px: 1, py: 0.25, borderRadius: 1 }}
        >
          Tap the map where it goes
        </Typography>
      )}
      <Box ref={boxRef} sx={fill ? { overflow: 'auto', flex: 1, minHeight: 0 } : { overflow: 'auto', maxHeight }}>
        <svg
          ref={svgRef}
          role="img"
          aria-label="Store map"
          viewBox={`${-MAP_MARGIN} ${-MAP_MARGIN} ${viewW} ${viewH}`}
          width={fitWidthPx != null ? fitWidthPx * zoom : `${zoom * 100}%`}
          style={{
            display: 'block',
            margin: fitWidthPx != null ? '0 auto' : undefined,
            cursor: placing ? 'crosshair' : 'default',
            touchAction: drag ? 'none' : 'auto',
          }}
          onClick={handleBackgroundClick}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={() => updateDrag(null)}
        >
          <rect x={0} y={0} width={planWidth} height={planHeight} fill="#fafafa" stroke="#90a4ae" strokeWidth={inchPerPx} />
          <g opacity={0.9} pointerEvents="none">
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
          </g>
          {shownPins.map((pin) => {
            const layer = layerById.get(pin.layer);
            const color = pinColor?.(pin) ?? layer?.color ?? '#2563eb';
            const highlighted = highlightedPinIds?.has(pin.id) ?? false;
            const dragging = drag?.pin.id === pin.id;
            const x = dragging ? drag.point.x : pin.x;
            const y = dragging ? drag.point.y : pin.y;
            const r = highlighted ? pinR * 1.35 : pinR;
            return (
              <g
                key={pin.id}
                role="button"
                aria-label={`${layer?.name ?? 'Pin'}: ${pin.name}`}
                style={{ cursor: onPinMove ? 'grab' : 'pointer' }}
                opacity={dimOthers && !highlighted ? 0.35 : 1}
                onPointerDown={handlePinPointerDown(pin)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!onPinMove) onPinClick?.(pin);
                }}
              >
                {highlighted && <circle cx={x} cy={y} r={r + pinR * 0.6} fill={color} fillOpacity={0.2} />}
                <circle cx={x} cy={y} r={r} fill={color} stroke="#fff" strokeWidth={pinR * 0.3} />
                {(showNames || highlighted) && (
                  <text
                    x={x + r + pinR * 0.4}
                    y={y}
                    dominantBaseline="central"
                    fontSize={12 * inchPerPx}
                    fontWeight={600}
                    fill="#1e293b"
                    stroke="#fff"
                    strokeWidth={3 * inchPerPx}
                    paintOrder="stroke"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {pin.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </Box>
    </Box>
  );
}
