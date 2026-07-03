import { useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import type { PlanDocument, PlanElement } from '../../types/floorplan.types';
import { DEFAULT_LABEL_SETTINGS } from '../../types/floorplan.types';
import { paletteEntryFor, type PaletteIndex } from './palette';
import { rotatedBounds } from './geometry';

export interface PrintOptions {
  blackWhite: boolean;
  /** How element footprints render */
  elementStyle: 'image' | 'fill' | 'outline';
  showElementLabels: boolean;
  showZones: boolean;
  showZoneLabels: boolean;
  showPaths: boolean;
  showTextLabels: boolean;
  showInfoBlocks: boolean;
  showGrid: boolean;
  /** Stroke weight multiplier for element borders */
  borderWeight: number;
  showPlanBorder: boolean;
  showInactive: boolean;
}

const DEFAULT_OPTIONS: PrintOptions = {
  blackWhite: false,
  elementStyle: 'image',
  showElementLabels: true,
  showZones: true,
  showZoneLabels: true,
  showPaths: true,
  showTextLabels: true,
  showInfoBlocks: true,
  showGrid: false,
  borderWeight: 1,
  showPlanBorder: true,
  showInactive: true,
};

/** Preset that matches "print an outline so we can sketch new layouts on it". */
const OUTLINE_PRESET: PrintOptions = {
  blackWhite: true,
  elementStyle: 'outline',
  showElementLabels: false,
  showZones: false,
  showZoneLabels: false,
  showPaths: false,
  showTextLabels: false,
  showInfoBlocks: false,
  showGrid: true,
  borderWeight: 1,
  showPlanBorder: true,
  showInactive: false,
};

interface PrintDialogProps {
  open: boolean;
  onClose: () => void;
  doc: PlanDocument;
  planName: string;
  /** Asset id -> data URI for element images */
  assets: Map<number, string>;
  kindIndex: PaletteIndex;
}

export default function PrintDialog({ open, onClose, doc, planName, assets, kindIndex }: PrintDialogProps) {
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_OPTIONS);
  const svgRef = useRef<SVGSVGElement>(null);
  const set = (patch: Partial<PrintOptions>) => setOptions((prev) => ({ ...prev, ...patch }));

  const handlePrint = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!doctype html>
<html>
<head>
<title>${planName.replace(/</g, '&lt;')}</title>
<style>
  @page { size: landscape; margin: 10mm; }
  html, body { margin: 0; height: 100%; }
  body { display: flex; align-items: center; justify-content: center; }
  svg { width: 100%; height: 100%; max-height: 100vh; }
</style>
</head>
<body>${svg.outerHTML}</body>
</html>`);
    win.document.close();
    win.focus();
    // Give the new window a beat to layout/load data-URI images before printing
    setTimeout(() => {
      win.print();
    }, 400);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Print floorplan</DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          {/* Options */}
          <Stack spacing={0.75} sx={{ width: { xs: '100%', md: 250 }, flexShrink: 0 }}>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="outlined" onClick={() => setOptions(OUTLINE_PRESET)} sx={{ textTransform: 'none' }}>
                Outline preset
              </Button>
              <Button size="small" onClick={() => setOptions(DEFAULT_OPTIONS)} sx={{ textTransform: 'none' }}>
                Reset
              </Button>
            </Stack>
            <Divider />
            <TextField
              select
              size="small"
              label="Element style"
              value={options.elementStyle}
              onChange={(e) => set({ elementStyle: e.target.value as PrintOptions['elementStyle'] })}
              sx={{ mt: 1 }}
            >
              <MenuItem value="image">Images + fill</MenuItem>
              <MenuItem value="fill">Solid fill (no images)</MenuItem>
              <MenuItem value="outline">Outline only</MenuItem>
            </TextField>
            <TextField
              select
              size="small"
              label="Border weight"
              value={options.borderWeight}
              onChange={(e) => set({ borderWeight: Number(e.target.value) })}
            >
              <MenuItem value={0.5}>Thin</MenuItem>
              <MenuItem value={1}>Normal</MenuItem>
              <MenuItem value={2}>Heavy</MenuItem>
              <MenuItem value={3}>Extra heavy</MenuItem>
            </TextField>
            <OptionSwitch label="Black & white" checked={options.blackWhite} onChange={(v) => set({ blackWhite: v })} />
            <OptionSwitch label="Element labels" checked={options.showElementLabels} onChange={(v) => set({ showElementLabels: v })} />
            <OptionSwitch label="Zones" checked={options.showZones} onChange={(v) => set({ showZones: v })} />
            <OptionSwitch
              label="Zone labels"
              checked={options.showZones && options.showZoneLabels}
              onChange={(v) => set({ showZoneLabels: v })}
              disabled={!options.showZones}
            />
            <OptionSwitch label="Drawings (freehand)" checked={options.showPaths} onChange={(v) => set({ showPaths: v })} />
            <OptionSwitch label="Text labels" checked={options.showTextLabels} onChange={(v) => set({ showTextLabels: v })} />
            <OptionSwitch label="Info blocks (legend, title…)" checked={options.showInfoBlocks} onChange={(v) => set({ showInfoBlocks: v })} />
            <OptionSwitch label="Grid" checked={options.showGrid} onChange={(v) => set({ showGrid: v })} />
            <OptionSwitch label="Plan border" checked={options.showPlanBorder} onChange={(v) => set({ showPlanBorder: v })} />
            <OptionSwitch label="Inactive elements" checked={options.showInactive} onChange={(v) => set({ showInactive: v })} />
          </Stack>

          {/* Preview */}
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              bgcolor: '#f5f5f5',
              p: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 380,
            }}
          >
            <PrintPreviewSvg svgRef={svgRef} doc={doc} options={options} assets={assets} kindIndex={kindIndex} />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint}>
          Print
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function OptionSwitch({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <FormControlLabel
      control={<Switch size="small" checked={checked} disabled={disabled} onChange={(_, v) => onChange(v)} />}
      label={<Typography variant="body2">{label}</Typography>}
      sx={{ ml: 0 }}
    />
  );
}

// ── Print renderer (independent of the editor canvas visuals) ────────────────

function PrintPreviewSvg({ svgRef, doc, options, assets, kindIndex }: {
  svgRef: React.RefObject<SVGSVGElement | null>;
  doc: PlanDocument;
  options: PrintOptions;
  assets: Map<number, string>;
  kindIndex: PaletteIndex;
}) {
  const { planWidth, planHeight, grid } = doc.settings;
  const labelSettings = doc.settings.labels ?? DEFAULT_LABEL_SETTINGS;
  const bw = options.blackWhite;
  const strokeColor = '#111';
  const hairline = 0.75 * options.borderWeight;

  const gridLines = useMemo(() => {
    if (!options.showGrid) return [];
    const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
    for (let x = 0; x <= planWidth + 0.001; x += grid.minor) {
      lines.push({ x1: x, y1: 0, x2: x, y2: planHeight, major: x % grid.major === 0 });
    }
    for (let y = 0; y <= planHeight + 0.001; y += grid.minor) {
      lines.push({ x1: 0, y1: y, x2: planWidth, y2: y, major: y % grid.major === 0 });
    }
    return lines;
  }, [options.showGrid, planWidth, planHeight, grid.minor, grid.major]);

  const elements = options.showInactive ? doc.elements : doc.elements.filter((el) => el.active);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${planWidth} ${planHeight}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ maxWidth: '100%', maxHeight: 520, background: '#fff', filter: bw ? 'grayscale(1)' : undefined }}
    >
      {/* Grayscale must survive the print window, where inline React style filters do */}
      {options.showPlanBorder && (
        <rect x={0} y={0} width={planWidth} height={planHeight} fill="none" stroke={strokeColor} strokeWidth={hairline * 1.5} />
      )}
      {gridLines.map((line, i) => (
        <line
          key={`g${i}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke={line.major ? '#9e9e9e' : '#d5d5d5'}
          strokeWidth={(line.major ? 0.5 : 0.3) * options.borderWeight}
        />
      ))}

      {options.showZones &&
        doc.zones.map((zone) => (
          <g key={zone.id}>
            <rect
              x={zone.x}
              y={zone.y}
              width={zone.w}
              height={zone.h}
              fill={zone.color}
              fillOpacity={bw ? 0.08 : zone.opacity}
              stroke={bw ? strokeColor : zone.color}
              strokeWidth={hairline}
              strokeDasharray="6 4"
            />
            {options.showZoneLabels && (
              <text x={zone.x + 3} y={zone.y + 3} dominantBaseline="hanging" fontSize={Math.min(10, zone.h * 0.4)} fontWeight={600} fill={bw ? strokeColor : zone.color}>
                {zone.label}
              </text>
            )}
          </g>
        ))}

      {elements.map((el) => (
        <PrintElement key={el.id} element={el} options={options} assets={assets} kindIndex={kindIndex} labelFontSize={labelSettings.fontSize} hairline={hairline} />
      ))}

      {options.showPaths &&
        doc.paths.map((path) => (
          <path
            key={path.id}
            d={path.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')}
            fill="none"
            stroke={bw ? strokeColor : path.stroke}
            strokeWidth={path.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

      {options.showTextLabels &&
        doc.labels.map((label) => (
          <text key={label.id} x={label.x} y={label.y} fontSize={label.fontSize} fill={bw ? strokeColor : label.color} dominantBaseline="hanging" fontWeight={500}>
            {label.text}
          </text>
        ))}

      {options.showInfoBlocks &&
        doc.infoBlocks.map((block) => (
          <g key={block.id}>
            <rect x={block.x} y={block.y} width={block.w} height={block.h} fill="#fff" stroke={strokeColor} strokeWidth={hairline * 0.75} />
            <text x={block.x + 3} y={block.y + 3} dominantBaseline="hanging" fontSize={Math.min(8, block.h * 0.2)} fontWeight={700} fill={strokeColor}>
              {block.type === 'titleBlock' ? String(block.props.title ?? '') : block.type.toUpperCase()}
            </text>
          </g>
        ))}
    </svg>
  );
}

function PrintElement({ element, options, assets, kindIndex, labelFontSize, hairline }: {
  element: PlanElement;
  options: PrintOptions;
  assets: Map<number, string>;
  kindIndex: PaletteIndex;
  labelFontSize: number;
  hairline: number;
}) {
  const entry = paletteEntryFor(element.kind, kindIndex);
  const cx = element.x + element.w / 2;
  const cy = element.y + element.h / 2;
  const round = entry.shape === 'circle';
  const outline = options.elementStyle === 'outline';
  const strokeColor = '#111';
  const fill = outline ? 'none' : entry.color;
  const imageHref =
    options.elementStyle === 'image' && element.image != null ? assets.get(element.image) : undefined;
  const fontSize = Math.min(labelFontSize, Math.max(3, Math.min(element.w, element.h) * 0.45));
  const flipTransform =
    element.flipH || element.flipV
      ? `translate(${cx} ${cy}) scale(${element.flipH ? -1 : 1} ${element.flipV ? -1 : 1}) translate(${-cx} ${-cy})`
      : undefined;

  // Visual bounds label placement stays horizontal
  const visual = rotatedBounds({ x: element.x, y: element.y, w: element.w, h: element.h }, element.rotation);

  return (
    <g transform={`rotate(${element.rotation} ${cx} ${cy})`} opacity={element.active ? 1 : 0.5}>
      <g transform={flipTransform}>
        {round ? (
          <ellipse
            cx={cx}
            cy={cy}
            rx={Math.max(0.1, element.w / 2 - hairline / 2)}
            ry={Math.max(0.1, element.h / 2 - hairline / 2)}
            fill={fill}
            fillOpacity={outline ? undefined : 0.85}
            stroke={strokeColor}
            strokeWidth={hairline}
            strokeDasharray={element.active ? undefined : '4 3'}
          />
        ) : (
          <rect
            x={element.x + hairline / 2}
            y={element.y + hairline / 2}
            width={Math.max(0.1, element.w - hairline)}
            height={Math.max(0.1, element.h - hairline)}
            rx={Math.max(0, (entry.cornerRadius || 0) - hairline / 2)}
            fill={imageHref ? '#fff' : fill}
            fillOpacity={outline ? undefined : 0.85}
            stroke={strokeColor}
            strokeWidth={hairline}
            strokeDasharray={element.active ? undefined : '4 3'}
          />
        )}
        {imageHref && (
          <image href={imageHref} x={element.x} y={element.y} width={element.w} height={element.h} preserveAspectRatio="none" />
        )}
      </g>
      {options.showElementLabels && !element.labelHidden && (
        <text
          x={cx}
          y={cy}
          transform={`rotate(${-element.rotation} ${cx} ${cy})`}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.min(fontSize, Math.max(3, Math.min(visual.w, visual.h) * 0.45))}
          fill={outline || imageHref ? '#111' : '#fff'}
          stroke={imageHref ? '#fff' : undefined}
          strokeWidth={imageHref ? fontSize * 0.12 : undefined}
          paintOrder="stroke"
        >
          {element.label || entry.label}
        </text>
      )}
    </g>
  );
}
