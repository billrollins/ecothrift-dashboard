/**
 * Floorplan document types — schema_version 1.
 *
 * All coordinates and dimensions are in INCHES, measured from the plan origin
 * (top-left), y-down. See apps/floorplan/README.md for the full contract.
 */

export const PLAN_SCHEMA_VERSION = 1;

export type GridStyle = 'faint' | 'normal' | 'strong';

export interface PlanGridSettings {
  visible: boolean;
  /** Minor grid line spacing, inches */
  minor: number;
  /** Major grid line spacing, inches */
  major: number;
  /** Line weight/contrast; optional in stored docs, defaults to 'normal' */
  style?: GridStyle;
}

export interface PlanLabelSettings {
  /** Show element/zone caption text on the canvas */
  show: boolean;
  /** Uniform caption font size in inches */
  fontSize: number;
}

export const DEFAULT_LABEL_SETTINGS: PlanLabelSettings = { show: true, fontSize: 8 };

export interface PlanSettings {
  /** Plan (room) width in inches */
  planWidth: number;
  /** Plan (room) height in inches */
  planHeight: number;
  grid: PlanGridSettings;
  /** Snap increment in inches; 0 = snapping off */
  snap: number;
  /** Element/zone caption settings; optional in stored docs, defaulted on load */
  labels?: PlanLabelSettings;
}

export interface PlanElement {
  id: string;
  /** Palette kind, e.g. 'gondola'. Unknown kinds render as generic rects. */
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 | 90 | 180 | 270, degrees clockwise about the element center */
  rotation: number;
  label: string;
  active: boolean;
  /** Optional group id; members of a group select/move/delete together */
  group?: string;
  /** Optional FloorPlanAsset id; the asset image renders inside the footprint */
  image?: number;
}

export interface PlanZone {
  id: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity: number;
  group?: string;
}

export interface PlanPath {
  id: string;
  /** Polyline points in inches: [[x, y], ...] */
  points: [number, number][];
  stroke: string;
  width: number;
  group?: string;
}

export interface PlanLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  /** Font size in inches (world units) so text scales with zoom */
  fontSize: number;
  color: string;
  group?: string;
}

export type InfoBlockType = 'titleBlock' | 'notes' | 'legend' | 'northArrow' | 'scaleBar';

export interface PlanInfoBlock {
  id: string;
  type: InfoBlockType;
  x: number;
  y: number;
  w: number;
  h: number;
  props: Record<string, unknown>;
  group?: string;
}

export interface PlanDocument {
  schema_version: number;
  settings: PlanSettings;
  elements: PlanElement[];
  zones: PlanZone[];
  paths: PlanPath[];
  labels: PlanLabel[];
  infoBlocks: PlanInfoBlock[];
}

/** Any selectable object on the canvas */
export type PlanObject = PlanElement | PlanZone | PlanPath | PlanLabel | PlanInfoBlock;

export type PlanObjectKind = 'element' | 'zone' | 'path' | 'label' | 'infoBlock';

// ── API resource shapes ──────────────────────────────────────────────────────

export interface FloorPlanListItem {
  id: number;
  name: string;
  location: number;
  location_name: string;
  schema_version: number;
  revision: number;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface FloorPlanDetail extends FloorPlanListItem {
  data: PlanDocument;
}

export interface FloorPlanAsset {
  id: number;
  name: string;
  location: number | null;
  /** Sanitized image as a data URI (SVG/PNG/JPEG) */
  data: string;
  content_type: string;
  created_at: string;
}
