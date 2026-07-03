import type {
  PlanDocument,
  PlanElement,
  PlanInfoBlock,
  PlanLabel,
  PlanLabelSettings,
  PlanPath,
  PlanZone,
} from '../../types/floorplan.types';
import { DEFAULT_LABEL_SETTINGS } from '../../types/floorplan.types';
import { paletteEntryFor, type PaletteIndex } from './palette';

/** Stroke width in inches that stays readable at typical zooms. */
const HAIRLINE = 0.75;

export function ElementShape({
  element,
  selected,
  labelSettings = DEFAULT_LABEL_SETTINGS,
  imageHref,
  kindIndex,
}: {
  element: PlanElement;
  selected: boolean;
  labelSettings?: PlanLabelSettings;
  /** Resolved data URI for element.image; base rect stays as fallback */
  imageHref?: string;
  /** Element kind catalog; unknown kinds fall back to a generic rect */
  kindIndex?: PaletteIndex;
}) {
  const entry = paletteEntryFor(element.kind, kindIndex);
  const cx = element.x + element.w / 2;
  const cy = element.y + element.h / 2;
  const round = entry.shape === 'circle';
  // Stroke is drawn fully INSIDE the footprint (inset by half the stroke
  // width) so the border never makes an element render larger than w×h.
  const strokeW = selected ? HAIRLINE * 2 : HAIRLINE;
  const inset = strokeW / 2;
  // Uniform caption size across all elements, clamped so tiny footprints don't overflow.
  const fontSize = Math.min(labelSettings.fontSize, Math.max(3, Math.min(element.w, element.h) * 0.45));
  // Mirror shape + image about the element center; the caption stays readable
  const flipTransform =
    element.flipH || element.flipV
      ? `translate(${cx} ${cy}) scale(${element.flipH ? -1 : 1} ${element.flipV ? -1 : 1}) translate(${-cx} ${-cy})`
      : undefined;
  return (
    <g
      transform={`rotate(${element.rotation} ${cx} ${cy})`}
      opacity={element.active ? 1 : 0.45}
    >
      <g transform={flipTransform}>
      {round ? (
        <ellipse
          cx={cx}
          cy={cy}
          rx={Math.max(0.1, element.w / 2 - inset)}
          ry={Math.max(0.1, element.h / 2 - inset)}
          fill={entry.color}
          fillOpacity={0.85}
          stroke={selected ? '#1565c0' : '#37474f'}
          strokeWidth={strokeW}
          strokeDasharray={element.active ? undefined : '4 3'}
        />
      ) : (
        <rect
          x={element.x + inset}
          y={element.y + inset}
          width={Math.max(0.1, element.w - strokeW)}
          height={Math.max(0.1, element.h - strokeW)}
          rx={Math.max(0, (entry.cornerRadius || 0) - inset)}
          fill={imageHref ? '#fff' : entry.color}
          fillOpacity={imageHref ? 0.9 : 0.85}
          stroke={selected ? '#1565c0' : '#37474f'}
          strokeWidth={strokeW}
          strokeDasharray={element.active ? undefined : '4 3'}
        />
      )}
      {imageHref && (
        // Stretch to fill the footprint so resizing an element squishes its
        // image instead of letterboxing (e.g. a 48×22 gondola from a 48×48 art)
        <image
          href={imageHref}
          x={element.x}
          y={element.y}
          width={element.w}
          height={element.h}
          preserveAspectRatio="none"
          pointerEvents="none"
        />
      )}
      </g>
      {labelSettings.show && !element.labelHidden && (
        // Counter-rotate so the caption stays horizontal regardless of element rotation
        <text
          x={cx}
          y={cy}
          transform={`rotate(${-element.rotation} ${cx} ${cy})`}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fill={imageHref ? '#263238' : '#fff'}
          stroke={imageHref ? '#fff' : undefined}
          strokeWidth={imageHref ? fontSize * 0.12 : undefined}
          paintOrder="stroke"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {element.label || entry.label}
        </text>
      )}
    </g>
  );
}

export function ZoneShape({
  zone,
  selected,
  labelSettings = DEFAULT_LABEL_SETTINGS,
}: {
  zone: PlanZone;
  selected: boolean;
  labelSettings?: PlanLabelSettings;
}) {
  const fontSize = Math.min(labelSettings.fontSize * 1.25, Math.max(4, zone.h * 0.45));
  return (
    <g>
      <rect
        x={zone.x}
        y={zone.y}
        width={zone.w}
        height={zone.h}
        fill={zone.color}
        fillOpacity={zone.opacity}
        stroke={selected ? '#1565c0' : zone.color}
        strokeWidth={selected ? HAIRLINE * 2 : HAIRLINE}
        strokeDasharray="6 4"
      />
      {labelSettings.show && (
        <text
          x={zone.x + 3}
          y={zone.y + 3}
          dominantBaseline="hanging"
          fontSize={fontSize}
          fill={zone.color}
          fontWeight={600}
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {zone.label}
        </text>
      )}
    </g>
  );
}

export function PathShape({ path, selected }: { path: PlanPath; selected: boolean }) {
  const d = path.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={selected ? '#1565c0' : path.stroke}
        strokeWidth={path.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

export function LabelShape({ label, selected }: { label: PlanLabel; selected: boolean }) {
  return (
    <text
      x={label.x}
      y={label.y}
      fontSize={label.fontSize}
      fill={selected ? '#1565c0' : label.color}
      dominantBaseline="hanging"
      fontWeight={500}
      style={{ userSelect: 'none' }}
    >
      {label.text}
    </text>
  );
}

function usedKinds(elements: PlanElement[], kindIndex: PaletteIndex): string[] {
  return [...new Set(elements.map((e) => e.kind))].filter((k) => kindIndex[k]);
}

export function InfoBlockShape({
  block,
  elements,
  selected,
  kindIndex = {},
}: {
  block: PlanInfoBlock;
  /** Placed elements, used by the legend block */
  elements: PlanElement[];
  selected: boolean;
  /** Element kind catalog, used by the legend block */
  kindIndex?: PaletteIndex;
}) {
  const frame = (
    <rect
      x={block.x}
      y={block.y}
      width={block.w}
      height={block.h}
      fill="#fff"
      fillOpacity={0.92}
      stroke={selected ? '#1565c0' : '#546e7a'}
      strokeWidth={selected ? HAIRLINE * 2 : HAIRLINE}
    />
  );
  const pad = 3;

  switch (block.type) {
    case 'titleBlock': {
      const title = String(block.props.title ?? 'Untitled plan');
      const subtitle = String(block.props.subtitle ?? '');
      const date = String(block.props.date ?? '');
      return (
        <g>
          {frame}
          <text x={block.x + pad} y={block.y + pad} dominantBaseline="hanging" fontSize={block.h * 0.28} fontWeight={700} fill="#263238" style={{ userSelect: 'none' }}>
            {title}
          </text>
          <text x={block.x + pad} y={block.y + block.h * 0.45} dominantBaseline="hanging" fontSize={block.h * 0.18} fill="#546e7a" style={{ userSelect: 'none' }}>
            {subtitle}
          </text>
          <text x={block.x + pad} y={block.y + block.h * 0.7} dominantBaseline="hanging" fontSize={block.h * 0.16} fill="#78909c" style={{ userSelect: 'none' }}>
            {date}
          </text>
        </g>
      );
    }
    case 'notes': {
      const text = String(block.props.text ?? 'Notes…');
      const fontSize = Math.min(8, block.h * 0.14);
      const lineHeight = fontSize * 1.35;
      const charsPerLine = Math.max(8, Math.floor((block.w - pad * 2) / (fontSize * 0.55)));
      const lines: string[] = [];
      for (const para of text.split('\n')) {
        let rest = para;
        do {
          lines.push(rest.slice(0, charsPerLine));
          rest = rest.slice(charsPerLine);
        } while (rest.length > 0);
      }
      const maxLines = Math.floor((block.h - pad * 2 - fontSize * 1.6) / lineHeight);
      return (
        <g>
          {frame}
          <text x={block.x + pad} y={block.y + pad} dominantBaseline="hanging" fontSize={fontSize} fontWeight={700} fill="#263238" style={{ userSelect: 'none' }}>
            NOTES
          </text>
          {lines.slice(0, Math.max(0, maxLines)).map((line, i) => (
            <text
              key={i}
              x={block.x + pad}
              y={block.y + pad + fontSize * 1.6 + i * lineHeight}
              dominantBaseline="hanging"
              fontSize={fontSize}
              fill="#455a64"
              style={{ userSelect: 'none' }}
            >
              {line}
            </text>
          ))}
        </g>
      );
    }
    case 'legend': {
      const kinds = usedKinds(elements, kindIndex);
      const fontSize = Math.min(7, block.h * 0.12);
      const rowH = fontSize * 1.6;
      const maxRows = Math.max(0, Math.floor((block.h - pad * 2 - fontSize * 1.8) / rowH));
      return (
        <g>
          {frame}
          <text x={block.x + pad} y={block.y + pad} dominantBaseline="hanging" fontSize={fontSize} fontWeight={700} fill="#263238" style={{ userSelect: 'none' }}>
            LEGEND
          </text>
          {kinds.slice(0, maxRows).map((kind, i) => {
            const entry = kindIndex[kind];
            const y = block.y + pad + fontSize * 1.8 + i * rowH;
            return (
              <g key={kind}>
                <rect x={block.x + pad} y={y} width={fontSize} height={fontSize} fill={entry.color} />
                <text x={block.x + pad + fontSize * 1.5} y={y} dominantBaseline="hanging" fontSize={fontSize} fill="#455a64" style={{ userSelect: 'none' }}>
                  {entry.label}
                </text>
              </g>
            );
          })}
        </g>
      );
    }
    case 'northArrow': {
      const cx = block.x + block.w / 2;
      const cy = block.y + block.h / 2;
      const r = Math.min(block.w, block.h) / 2 - pad;
      const rotation = Number(block.props.rotation ?? 0);
      return (
        <g>
          <circle cx={cx} cy={cy} r={r + pad * 0.6} fill="#fff" fillOpacity={0.92} stroke={selected ? '#1565c0' : '#546e7a'} strokeWidth={selected ? HAIRLINE * 2 : HAIRLINE} />
          <g transform={`rotate(${rotation} ${cx} ${cy})`}>
            <path
              d={`M${cx} ${cy - r} L${cx + r * 0.35} ${cy + r * 0.45} L${cx} ${cy + r * 0.2} L${cx - r * 0.35} ${cy + r * 0.45} Z`}
              fill="#c62828"
            />
            <text x={cx} y={cy - r * 0.15} textAnchor="middle" fontSize={r * 0.55} fontWeight={700} fill="#263238" style={{ userSelect: 'none' }}>
              N
            </text>
          </g>
        </g>
      );
    }
    case 'scaleBar': {
      const length = Number(block.props.length ?? 120); // inches represented
      const feet = length / 12;
      const barH = Math.min(6, block.h * 0.25);
      const x0 = block.x + pad;
      const y0 = block.y + block.h - pad - barH;
      const drawn = Math.min(length, block.w - pad * 2);
      const half = drawn / 2;
      return (
        <g>
          {frame}
          <text x={block.x + pad} y={block.y + pad} dominantBaseline="hanging" fontSize={Math.min(7, block.h * 0.2)} fill="#455a64" style={{ userSelect: 'none' }}>
            {`Scale: bar = ${feet} ft`}
          </text>
          <rect x={x0} y={y0} width={half} height={barH} fill="#263238" />
          <rect x={x0 + half} y={y0} width={half} height={barH} fill="#fff" stroke="#263238" strokeWidth={HAIRLINE / 2} />
        </g>
      );
    }
    default:
      return frame;
  }
}
