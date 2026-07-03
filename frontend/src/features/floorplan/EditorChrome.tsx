import { useMemo, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  MenuItem,
  Popover,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import GridOnIcon from '@mui/icons-material/GridOn';
import GridOffIcon from '@mui/icons-material/GridOff';
import DeleteIcon from '@mui/icons-material/Delete';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import NearMeIcon from '@mui/icons-material/NearMe';
import LabelIcon from '@mui/icons-material/Label';
import LabelOffIcon from '@mui/icons-material/LabelOff';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ControlPointDuplicateIcon from '@mui/icons-material/ControlPointDuplicate';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import WorkspacesOutlinedIcon from '@mui/icons-material/WorkspacesOutlined';
import PanToolIcon from '@mui/icons-material/PanTool';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import GestureIcon from '@mui/icons-material/Gesture';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import FlipIcon from '@mui/icons-material/Flip';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import LockIcon from '@mui/icons-material/Lock';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import Rotate90DegreesCwIcon from '@mui/icons-material/Rotate90DegreesCw';
import AlignHorizontalLeftIcon from '@mui/icons-material/AlignHorizontalLeft';
import AlignHorizontalCenterIcon from '@mui/icons-material/AlignHorizontalCenter';
import AlignHorizontalRightIcon from '@mui/icons-material/AlignHorizontalRight';
import AlignVerticalTopIcon from '@mui/icons-material/AlignVerticalTop';
import AlignVerticalCenterIcon from '@mui/icons-material/AlignVerticalCenter';
import AlignVerticalBottomIcon from '@mui/icons-material/AlignVerticalBottom';
// This @mui/icons-material version has no HorizontalDistribute/VerticalDistribute;
// evenly-spaced column/row glyphs read the same way.
import HorizontalDistributeIcon from '@mui/icons-material/ViewWeek';
import VerticalDistributeIcon from '@mui/icons-material/ViewStream';
import type {
  FloorPlanAsset,
  GridStyle,
  PlanDocument,
  PlanElement,
  PlanGridSettings,
  PlanInfoBlock,
  PlanLabel,
  PlanPath,
  PlanZone,
} from '../../types/floorplan.types';
import type { AlignMode, EditorAction, EditorState, LockedObjectInfo, SelectionRef, Tool } from './editorState';
import { getObject, selectionIsGrouped, visualBounds } from './editorState';
import { DEFAULT_LABEL_SETTINGS } from '../../types/floorplan.types';
import {
  formatInches,
  parseInches,
  pickScaleBarLength,
  rawRectFromVisual,
  rotatedBounds,
  type Rect,
  type Viewport,
} from './geometry';
import { SNAP_OPTIONS } from './snapping';
import { paletteCategories, type PaletteEntry, type PaletteIndex } from './palette';
import type { DrawStroke } from './FloorplanCanvas';

/** Plan dimension limits (inches): 2 ft – 1000 ft, well under the backend cap. */
const MIN_PLAN_DIM = 24;
const MAX_PLAN_DIM = 12_000;

// ── Toolbar ──────────────────────────────────────────────────────────────────

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; shortcut: string }[] = [
  { id: 'select', label: 'Select (V)', icon: <NearMeIcon fontSize="small" />, shortcut: 'v' },
  { id: 'pan', label: 'Pan (H, or hold Space)', icon: <PanToolIcon fontSize="small" />, shortcut: 'h' },
  { id: 'zone', label: 'Zone (Z)', icon: <CropSquareIcon fontSize="small" />, shortcut: 'z' },
  { id: 'draw', label: 'Draw (D)', icon: <GestureIcon fontSize="small" />, shortcut: 'd' },
  { id: 'label', label: 'Label (T)', icon: <TextFieldsIcon fontSize="small" />, shortcut: 't' },
  { id: 'cut', label: 'Cut wall (C) — click a wall to split it', icon: <ContentCutIcon fontSize="small" />, shortcut: 'c' },
];

interface ToolbarProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onZoom: (factor: number) => void;
  onDeleteSelection: () => void;
  onRotateSelection: () => void;
  onCopySelection: () => void;
  onDuplicateSelection: () => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onAlignSelection: (mode: AlignMode) => void;
  onDistributeSelection: (axis: 'h' | 'v') => void;
  /** Rotate each selected object 90° about its own center */
  onRotateEachSelection: () => void;
  /** Mirror the selection horizontally/vertically about its center */
  onFlipSelection: (axis: 'h' | 'v') => void;
  /** Make the current selection inert (locked) */
  onLockSelection: () => void;
  lockedObjects: LockedObjectInfo[];
  onUnlockObject: (ref: SelectionRef) => void;
  onUnlockAll: () => void;
  readOnly: boolean;
}

const ALIGN_ACTIONS: { mode: AlignMode; label: string; icon: React.ReactNode }[] = [
  { mode: 'left', label: 'Align left edges', icon: <AlignHorizontalLeftIcon fontSize="small" /> },
  { mode: 'centerH', label: 'Align horizontal centers', icon: <AlignHorizontalCenterIcon fontSize="small" /> },
  { mode: 'right', label: 'Align right edges', icon: <AlignHorizontalRightIcon fontSize="small" /> },
  { mode: 'top', label: 'Align top edges', icon: <AlignVerticalTopIcon fontSize="small" /> },
  { mode: 'middleV', label: 'Align vertical centers', icon: <AlignVerticalCenterIcon fontSize="small" /> },
  { mode: 'bottom', label: 'Align bottom edges', icon: <AlignVerticalBottomIcon fontSize="small" /> },
];

export function EditorToolbar({
  state,
  dispatch,
  onZoom,
  onDeleteSelection,
  onRotateSelection,
  onCopySelection,
  onDuplicateSelection,
  onGroupSelection,
  onUngroupSelection,
  onAlignSelection,
  onDistributeSelection,
  onRotateEachSelection,
  onFlipSelection,
  onLockSelection,
  lockedObjects,
  onUnlockObject,
  onUnlockAll,
  readOnly,
}: ToolbarProps) {
  const { doc, tool, selection } = state;
  const grid = doc.settings.grid;
  const labels = doc.settings.labels ?? DEFAULT_LABEL_SETTINGS;
  const [gridAnchor, setGridAnchor] = useState<HTMLElement | null>(null);
  const [lockAnchor, setLockAnchor] = useState<HTMLElement | null>(null);

  const setSettings = (patch: Partial<PlanDocument['settings']>) =>
    dispatch({ type: 'commit', doc: { ...doc, settings: { ...doc.settings, ...patch } } });

  // Single elements rotate in place; any multi-selection rotates as a unit
  const hasRotatable = selection.length > 1 || selection.some((s) => s.kind === 'element');
  const grouped = selectionIsGrouped(doc, selection);

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexWrap: 'wrap' }}>
      <ToggleButtonGroup
        size="small"
        value={tool}
        exclusive
        onChange={(_, value: Tool | null) => value && dispatch({ type: 'setTool', tool: value })}
        aria-label="Active tool"
        disabled={readOnly}
      >
        {TOOLS.map((t) => (
          <ToggleButton key={t.id} value={t.id} aria-label={t.label}>
            <Tooltip title={t.label}>{t.icon as React.ReactElement}</Tooltip>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Divider orientation="vertical" flexItem />

      <Tooltip title="Undo (Ctrl+Z)">
        <span>
          <IconButton size="small" onClick={() => dispatch({ type: 'undo' })} disabled={readOnly || state.past.length === 0} aria-label="Undo">
            <UndoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="Redo (Ctrl+Y)">
        <span>
          <IconButton size="small" onClick={() => dispatch({ type: 'redo' })} disabled={readOnly || state.future.length === 0} aria-label="Redo">
            <RedoIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>

      <Divider orientation="vertical" flexItem />

      <Tooltip title="Grid & snap options">
        <Button
          size="small"
          color="inherit"
          onClick={(e) => setGridAnchor(e.currentTarget)}
          startIcon={grid.visible ? <GridOnIcon fontSize="small" /> : <GridOffIcon fontSize="small" />}
          endIcon={<ArrowDropDownIcon fontSize="small" />}
          sx={{ textTransform: 'none', color: 'text.secondary', minWidth: 0 }}
          aria-label="Grid and snap options"
        >
          Grid
        </Button>
      </Tooltip>
      <GridOptionsPopover
        anchorEl={gridAnchor}
        onClose={() => setGridAnchor(null)}
        grid={grid}
        snap={doc.settings.snap}
        onChange={setSettings}
        readOnly={readOnly}
      />

      <Tooltip title={labels.show ? 'Hide element labels' : 'Show element labels'}>
        <IconButton
          size="small"
          color={labels.show ? 'default' : 'primary'}
          onClick={() => setSettings({ labels: { ...labels, show: !labels.show } })}
          aria-label="Toggle element labels"
        >
          {labels.show ? <LabelIcon fontSize="small" /> : <LabelOffIcon fontSize="small" />}
        </IconButton>
      </Tooltip>

      <Divider orientation="vertical" flexItem />

      <Tooltip title="Zoom out (-)">
        <IconButton size="small" onClick={() => onZoom(1 / 1.25)} aria-label="Zoom out">
          <ZoomOutIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Zoom in (+)">
        <IconButton size="small" onClick={() => onZoom(1.25)} aria-label="Zoom in">
          <ZoomInIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {lockedObjects.length > 0 && (
        <>
          <Tooltip title={`${lockedObjects.length} locked object${lockedObjects.length > 1 ? 's' : ''}`}>
            <Button
              size="small"
              color="inherit"
              startIcon={<LockIcon fontSize="small" />}
              onClick={(e) => setLockAnchor(e.currentTarget)}
              sx={{ textTransform: 'none', color: 'text.secondary', minWidth: 0 }}
              aria-label="Locked objects"
            >
              {lockedObjects.length}
            </Button>
          </Tooltip>
          <Popover
            open={Boolean(lockAnchor)}
            anchorEl={lockAnchor}
            onClose={() => setLockAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            <Stack spacing={0.5} sx={{ p: 1.5, minWidth: 240, maxHeight: 320, overflowY: 'auto' }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="subtitle2">Locked objects</Typography>
                {!readOnly && (
                  <Button size="small" onClick={() => { onUnlockAll(); setLockAnchor(null); }} sx={{ textTransform: 'none' }}>
                    Unlock all
                  </Button>
                )}
              </Stack>
              {lockedObjects.map(({ ref, label }) => (
                <Stack key={`${ref.kind}:${ref.id}`} direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                    {label}
                  </Typography>
                  {!readOnly && (
                    <Tooltip title="Unlock (selects it)">
                      <IconButton size="small" onClick={() => onUnlockObject(ref)} aria-label={`Unlock ${label}`}>
                        <LockOpenIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              ))}
            </Stack>
          </Popover>
        </>
      )}

      {selection.length > 0 && !readOnly && (
        <>
          <Divider orientation="vertical" flexItem />
          <Chip size="small" label={grouped ? `${selection.length} selected (grouped)` : `${selection.length} selected`} />
          {hasRotatable && (
            <Tooltip title={selection.length > 1 ? 'Rotate as one unit 90° (R)' : 'Rotate 90° (R)'}>
              <IconButton size="small" onClick={onRotateSelection} aria-label="Rotate selection">
                <RotateRightIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {selection.length > 1 && (
            <Tooltip title="Rotate each in place 90° (Shift+R)">
              <IconButton size="small" onClick={onRotateEachSelection} aria-label="Rotate each selected object in place">
                <Rotate90DegreesCwIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Flip horizontally">
            <IconButton size="small" onClick={() => onFlipSelection('h')} aria-label="Flip selection horizontally">
              <FlipIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Flip vertically">
            <IconButton size="small" onClick={() => onFlipSelection('v')} aria-label="Flip selection vertically">
              <FlipIcon fontSize="small" sx={{ transform: 'rotate(90deg)' }} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Lock (make inert; unlock from the toolbar lock list)">
            <IconButton size="small" onClick={onLockSelection} aria-label="Lock selection">
              <LockIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Copy (Ctrl+C)">
            <IconButton size="small" onClick={onCopySelection} aria-label="Copy selection">
              <ContentCopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Duplicate (Ctrl+D)">
            <IconButton size="small" onClick={onDuplicateSelection} aria-label="Duplicate selection">
              <ControlPointDuplicateIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {selection.length > 1 && !grouped && (
            <Tooltip title="Group (Ctrl+G)">
              <IconButton size="small" onClick={onGroupSelection} aria-label="Group selection">
                <WorkspacesIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {grouped && (
            <Tooltip title="Ungroup (Ctrl+Shift+G)">
              <IconButton size="small" onClick={onUngroupSelection} aria-label="Ungroup selection">
                <WorkspacesOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {selection.length > 1 && (
            <>
              <Divider orientation="vertical" flexItem />
              {ALIGN_ACTIONS.map(({ mode, label, icon }) => (
                <Tooltip key={mode} title={label}>
                  <IconButton size="small" onClick={() => onAlignSelection(mode)} aria-label={label}>
                    {icon}
                  </IconButton>
                </Tooltip>
              ))}
              <Tooltip title={selection.length < 3 ? 'Distribute horizontally (needs 3+)' : 'Distribute horizontally'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={selection.length < 3}
                    onClick={() => onDistributeSelection('h')}
                    aria-label="Distribute horizontally"
                  >
                    <HorizontalDistributeIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title={selection.length < 3 ? 'Distribute vertically (needs 3+)' : 'Distribute vertically'}>
                <span>
                  <IconButton
                    size="small"
                    disabled={selection.length < 3}
                    onClick={() => onDistributeSelection('v')}
                    aria-label="Distribute vertically"
                  >
                    <VerticalDistributeIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </>
          )}
          <Tooltip title="Delete (Del)">
            <IconButton size="small" color="error" onClick={onDeleteSelection} aria-label="Delete selection">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </>
      )}
    </Stack>
  );
}

// ── Grid & snap options popover ──────────────────────────────────────────────

/** Minor/major spacing presets (inches). Keep majors as multiples of minors. */
const GRID_SIZE_PRESETS: { minor: number; major: number; label: string }[] = [
  { minor: 3, major: 12, label: 'Fine — 3" / 1\'' },
  { minor: 6, major: 12, label: 'Standard — 6" / 1\'' },
  { minor: 12, major: 48, label: 'Wide — 1\' / 4\'' },
  { minor: 24, major: 96, label: 'Extra wide — 2\' / 8\'' },
];

const GRID_STYLE_OPTIONS: { value: GridStyle; label: string; helper: string }[] = [
  { value: 'faint', label: 'Faint', helper: 'Barely-there guide lines' },
  { value: 'normal', label: 'Normal', helper: 'Default balance' },
  { value: 'strong', label: 'Strong', helper: 'High contrast lines' },
];

interface GridOptionsPopoverProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  grid: PlanGridSettings;
  snap: number;
  onChange: (patch: Partial<PlanDocument['settings']>) => void;
  readOnly: boolean;
}

function GridOptionsPopover({ anchorEl, onClose, grid, snap, onChange, readOnly }: GridOptionsPopoverProps) {
  const sizeKey = `${grid.minor}/${grid.major}`;
  const matchesPreset = GRID_SIZE_PRESETS.some((p) => `${p.minor}/${p.major}` === sizeKey);
  const style = grid.style ?? 'normal';

  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Stack spacing={1.5} sx={{ p: 2, width: 260 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle2">Grid</Typography>
          <FormControlLabel
            sx={{ mr: 0 }}
            control={
              <Switch
                size="small"
                checked={grid.visible}
                onChange={(e) => onChange({ grid: { ...grid, visible: e.target.checked } })}
              />
            }
            label={<Typography variant="caption">Show (G)</Typography>}
            labelPlacement="start"
          />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">Spacing (minor / major)</Typography>
          <Select
            size="small"
            value={matchesPreset ? sizeKey : 'custom'}
            disabled={readOnly}
            onChange={(e) => {
              const preset = GRID_SIZE_PRESETS.find((p) => `${p.minor}/${p.major}` === e.target.value);
              if (preset) onChange({ grid: { ...grid, minor: preset.minor, major: preset.major } });
            }}
            aria-label="Grid spacing"
          >
            {GRID_SIZE_PRESETS.map((p) => (
              <MenuItem key={`${p.minor}/${p.major}`} value={`${p.minor}/${p.major}`}>{p.label}</MenuItem>
            ))}
            {!matchesPreset && (
              <MenuItem value="custom" disabled>
                {`Custom — ${formatInches(grid.minor)} / ${formatInches(grid.major)}`}
              </MenuItem>
            )}
          </Select>
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">Line style</Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            fullWidth
            value={style}
            disabled={readOnly}
            onChange={(_, value: GridStyle | null) => value && onChange({ grid: { ...grid, style: value } })}
            aria-label="Grid line style"
          >
            {GRID_STYLE_OPTIONS.map((opt) => (
              <ToggleButton key={opt.value} value={opt.value} aria-label={opt.helper}>
                <Tooltip title={opt.helper}>
                  <span>{opt.label}</span>
                </Tooltip>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Stack>

        <Divider />

        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">Snap placement to</Typography>
          <Select
            size="small"
            value={snap}
            disabled={readOnly}
            onChange={(e) => onChange({ snap: Number(e.target.value) })}
            aria-label="Snap increment"
          >
            {SNAP_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.value === 0 ? 'Nothing (free placement)' : `${opt.label} increments`}
              </MenuItem>
            ))}
            {!SNAP_OPTIONS.some((o) => o.value === snap) && (
              <MenuItem value={snap}>{`${formatInches(snap)} increments`}</MenuItem>
            )}
          </Select>
          <Button
            size="small"
            variant="text"
            disabled={readOnly || snap === grid.minor}
            onClick={() => onChange({ snap: grid.minor })}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            {`Match grid (${formatInches(grid.minor)})`}
          </Button>
        </Stack>
      </Stack>
    </Popover>
  );
}

// ── Palette sidebar ──────────────────────────────────────────────────────────

interface PaletteSidebarProps {
  /** Element kinds to offer, ordered by category + sort order */
  entries: PaletteEntry[];
  pendingPlacement: PaletteEntry | null;
  onPick: (entry: PaletteEntry | null) => void;
  onAddInfoBlock: (type: PlanInfoBlock['type']) => void;
  drawStroke: DrawStroke;
  onDrawStrokeChange: (stroke: DrawStroke) => void;
  activeTool: Tool;
  readOnly: boolean;
  /** Super Admin: show "New element type" + per-kind edit affordances */
  canManageKinds?: boolean;
  onCreateKind?: () => void;
  onEditKind?: (entry: PaletteEntry) => void;
}

const INFO_BLOCK_TYPES: { type: PlanInfoBlock['type']; label: string }[] = [
  { type: 'titleBlock', label: 'Title block' },
  { type: 'notes', label: 'Notes area' },
  { type: 'legend', label: 'Legend' },
  { type: 'northArrow', label: 'North arrow' },
  { type: 'scaleBar', label: 'Scale reference' },
];

export function PaletteSidebar({ entries, pendingPlacement, onPick, onAddInfoBlock, drawStroke, onDrawStrokeChange, activeTool, readOnly, canManageKinds = false, onCreateKind, onEditKind }: PaletteSidebarProps) {
  const grouped = useMemo(
    () => paletteCategories(entries).map((cat) => ({ cat, entries: entries.filter((e) => e.category === cat) })),
    [entries],
  );

  return (
    <Box sx={{ width: 220, flexShrink: 0, borderRight: 1, borderColor: 'divider', overflowY: 'auto', bgcolor: 'background.paper' }}>
      {readOnly && (
        <Typography variant="caption" color="warning.main" sx={{ p: 1, display: 'block' }}>
          View only — Manager or Admin role required to edit.
        </Typography>
      )}
      {canManageKinds && onCreateKind && (
        <Box sx={{ px: 1, pt: 1 }}>
          <Button size="small" fullWidth variant="outlined" startIcon={<AddIcon />} onClick={onCreateKind} sx={{ textTransform: 'none' }}>
            New element type
          </Button>
        </Box>
      )}
      <List dense disablePadding subheader={<li />} sx={{ '& ul': { p: 0 } }}>
        {grouped.map(({ cat, entries: catEntries }) => (
          <li key={cat}>
            <ul>
              <ListSubheader sx={{ lineHeight: '28px' }}>{cat}</ListSubheader>
              {catEntries.map((entry) => (
                <ListItemButton
                  key={entry.kind}
                  dense
                  selected={pendingPlacement?.kind === entry.kind}
                  disabled={readOnly}
                  onClick={() => onPick(pendingPlacement?.kind === entry.kind ? null : entry)}
                  sx={{ '&:hover .kind-edit': { opacity: 1 } }}
                >
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      bgcolor: entry.color,
                      borderRadius: entry.shape === 'circle' ? '50%' : 0.5,
                      mr: 1,
                      flexShrink: 0,
                    }}
                  />
                  <ListItemText
                    primary={entry.label}
                    secondary={`${formatInches(entry.w)} × ${formatInches(entry.h)}`}
                    primaryTypographyProps={{ variant: 'body2' }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                  />
                  {canManageKinds && onEditKind && entry.kindId != null && (
                    <IconButton
                      className="kind-edit"
                      size="small"
                      aria-label={`Edit ${entry.label}`}
                      sx={{ opacity: { xs: 1, md: 0 }, transition: 'opacity 120ms' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditKind(entry);
                      }}
                    >
                      <EditIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  )}
                </ListItemButton>
              ))}
            </ul>
          </li>
        ))}
        <li>
          <ul>
            <ListSubheader sx={{ lineHeight: '28px' }}>Plan info</ListSubheader>
            {INFO_BLOCK_TYPES.map(({ type, label }) => (
              <ListItemButton key={type} dense disabled={readOnly} onClick={() => onAddInfoBlock(type)}>
                <ListItemText primary={label} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItemButton>
            ))}
          </ul>
        </li>
      </List>
      {activeTool === 'draw' && (
        <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">Draw stroke</Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
            <input
              type="color"
              value={drawStroke.color}
              onChange={(e) => onDrawStrokeChange({ ...drawStroke, color: e.target.value })}
              aria-label="Stroke color"
              style={{ width: 32, height: 26, border: 'none', padding: 0, background: 'none' }}
            />
            <Select
              size="small"
              value={drawStroke.width}
              onChange={(e) => onDrawStrokeChange({ ...drawStroke, width: Number(e.target.value) })}
              aria-label="Stroke width"
              sx={{ flex: 1, '& .MuiSelect-select': { py: 0.25 } }}
            >
              {[1, 2, 3, 4, 6].map((w) => (
                <MenuItem key={w} value={w}>{w}" wide</MenuItem>
              ))}
            </Select>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

// ── Properties panel ─────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  onPatch: (ref: SelectionRef, patch: Record<string, unknown>) => void;
  readOnly: boolean;
  /** Image asset library (for the element image picker) */
  assets?: FloorPlanAsset[];
  /** Uploads a file to the library; resolves to the new asset or null on failure */
  onUploadAsset?: (file: File) => Promise<FloorPlanAsset | null>;
  /** Element kind catalog (for "reset to kind default" image actions) */
  kindIndex?: PaletteIndex;
  /** Sets (or clears with null) the image on every selected element */
  onApplyImageToSelection?: (image: number | null) => void;
  /** Resets every selected element's image to its kind's current default */
  onResetSelectionImages?: () => void;
  /** Bulk hide/show captions on every selected element */
  onSetSelectionLabelsHidden?: (hidden: boolean) => void;
  /** Scale the whole selection so its combined bounds get the given size */
  onResizeSelection?: (patch: { w?: number; h?: number }, lockAspect: boolean) => void;
  /** Set the thickness (raw h) of every selected wall element */
  onSetWallThickness?: (thickness: number) => void;
}

function ElementImagePicker({
  element,
  assets,
  onUploadAsset,
  patch,
  readOnly,
  defaultImage,
}: {
  element: PlanElement;
  assets: FloorPlanAsset[];
  onUploadAsset?: (file: File) => Promise<FloorPlanAsset | null>;
  patch: (p: Record<string, unknown>) => void;
  readOnly: boolean;
  /** The element kind's current default image id, if any */
  defaultImage?: number;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const current = element.image != null ? assets.find((a) => a.id === element.image) : undefined;

  const handleFile = async (file: File | undefined) => {
    if (!file || !onUploadAsset) return;
    setUploading(true);
    const asset = await onUploadAsset(file);
    setUploading(false);
    if (asset) patch({ image: asset.id });
  };

  return (
    <Stack spacing={0.75}>
      <Typography variant="caption" color="text.secondary">Image</Typography>
      {current && (
        <Box
          component="img"
          src={current.data}
          alt={current.name}
          sx={{ width: '100%', maxHeight: 90, objectFit: 'contain', border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: '#fff' }}
        />
      )}
      <Select<number | ''>
        size="small"
        displayEmpty
        value={current ? current.id : ''}
        disabled={readOnly}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '' || v == null) patch({ image: undefined });
          else patch({ image: Number(v) });
        }}
        renderValue={(v) => (v === '' ? 'None (solid color)' : assets.find((a) => a.id === v)?.name ?? `Asset ${v}`)}
        aria-label="Element image"
      >
        <MenuItem value="">None (solid color)</MenuItem>
        {assets.map((asset) => (
          <MenuItem key={asset.id} value={asset.id}>
            <Box component="img" src={asset.data} alt="" sx={{ width: 18, height: 18, objectFit: 'contain', mr: 1 }} />
            {asset.name}
          </MenuItem>
        ))}
      </Select>
      {element.image != null && !current && (
        <Typography variant="caption" color="warning.main">
          The assigned image was deleted from the library; the element falls back to a solid color.
        </Typography>
      )}
      {onUploadAsset && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/svg+xml,image/png,image/jpeg"
            hidden
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            disabled={readOnly || uploading}
            onClick={() => fileInputRef.current?.click()}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            {uploading ? 'Uploading…' : 'Choose from file…'}
          </Button>
        </>
      )}
      {defaultImage !== element.image && (
        <Button
          size="small"
          variant="text"
          disabled={readOnly}
          onClick={() => patch({ image: defaultImage })}
          sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
        >
          Reset to kind default
        </Button>
      )}
    </Stack>
  );
}

/** Combined selection size — type a new width/height to scale the selection. */
function SelectionSizeSection({
  doc,
  selection,
  readOnly,
  onResize,
}: {
  doc: EditorState['doc'];
  selection: SelectionRef[];
  readOnly: boolean;
  onResize: (patch: { w?: number; h?: number }, lockAspect: boolean) => void;
}) {
  const [lockAspect, setLockAspect] = useState(true);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ref of selection) {
    const b = visualBounds(doc, ref);
    if (!b) continue;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  if (!Number.isFinite(minX)) return null;
  const w = maxX - minX;
  const h = maxY - minY;

  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">Selection size</Typography>
      <Stack direction="row" spacing={0.5} alignItems="center">
        <DimensionField
          label="Width"
          value={w}
          disabled={readOnly}
          onCommit={(next) => next > 0 && onResize({ w: next }, lockAspect)}
        />
        <Tooltip title={lockAspect ? 'Aspect locked — unlock to stretch one axis' : 'Aspect unlocked'}>
          <IconButton
            size="small"
            onClick={() => setLockAspect((v) => !v)}
            aria-label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            color={lockAspect ? 'primary' : 'default'}
          >
            {lockAspect ? <LinkIcon fontSize="small" /> : <LinkOffIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <DimensionField
          label="Height"
          value={h}
          disabled={readOnly}
          onCommit={(next) => next > 0 && onResize({ h: next }, lockAspect)}
        />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Scales the whole selection; walls keep their thickness.
      </Typography>
    </Stack>
  );
}

/** Bulk image actions shown when multiple elements are selected. */
function MultiElementImageTools({
  count,
  assets,
  onUploadAsset,
  onApplyImage,
  onResetImages,
}: {
  count: number;
  assets: FloorPlanAsset[];
  onUploadAsset?: (file: File) => Promise<FloorPlanAsset | null>;
  onApplyImage: (image: number | null) => void;
  onResetImages?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || !onUploadAsset) return;
    setUploading(true);
    const asset = await onUploadAsset(file);
    setUploading(false);
    if (asset) onApplyImage(asset.id);
  };

  return (
    <Stack spacing={0.75}>
      <Divider />
      <Typography variant="subtitle2">{`Image — ${count} element${count > 1 ? 's' : ''}`}</Typography>
      <Select<number | ''>
        size="small"
        displayEmpty
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v !== '' && v != null) onApplyImage(Number(v));
        }}
        renderValue={() => 'Set image for all…'}
        aria-label="Set image on all selected elements"
      >
        {assets.map((asset) => (
          <MenuItem key={asset.id} value={asset.id}>
            <Box component="img" src={asset.data} alt="" sx={{ width: 18, height: 18, objectFit: 'contain', mr: 1 }} />
            {asset.name}
          </MenuItem>
        ))}
      </Select>
      {onUploadAsset && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/svg+xml,image/png,image/jpeg"
            hidden
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
          >
            {uploading ? 'Uploading…' : 'Choose from file…'}
          </Button>
        </>
      )}
      {onResetImages && (
        <Button size="small" variant="text" onClick={onResetImages} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
          Reset to kind defaults
        </Button>
      )}
      <Button size="small" variant="text" color="inherit" onClick={() => onApplyImage(null)} sx={{ alignSelf: 'flex-start', textTransform: 'none' }}>
        Clear images (solid color)
      </Button>
    </Stack>
  );
}

function DimensionField({ label, value, onCommit, disabled }: { label: string; value: number; onCommit: (v: number) => void; disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <TextField
      size="small"
      label={label}
      value={text ?? formatInches(value)}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text != null) {
          const parsed = parseInches(text);
          if (parsed != null) onCommit(parsed);
        }
        setText(null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      sx={{ width: '48%' }}
    />
  );
}

export function PropertiesPanel({ state, dispatch, onPatch, readOnly, assets = [], onUploadAsset, kindIndex, onApplyImageToSelection, onResetSelectionImages, onSetSelectionLabelsHidden, onResizeSelection, onSetWallThickness }: PropertiesPanelProps) {
  const { doc, selection } = state;
  const selectedElementCount = selection.filter((s) => s.kind === 'element').length;

  // Selection composition: walls vs other elements vs everything else
  const isWallRef = (ref: SelectionRef) =>
    ref.kind === 'element' &&
    Boolean(kindIndex?.[(getObject(doc, ref) as PlanElement | undefined)?.kind ?? '']?.isWall);
  const wallRefs = selection.filter(isWallRef);
  const wallCount = wallRefs.length;
  const nonWallElementCount = selectedElementCount - wallCount;
  const otherCount = selection.length - selectedElementCount;

  // Uniform thickness across selected walls ('' when mixed)
  const wallThicknesses = new Set(
    wallRefs.map((ref) => (getObject(doc, ref) as PlanElement).h),
  );
  const commonWallThickness = wallThicknesses.size === 1 ? [...wallThicknesses][0] : null;

  if (selection.length !== 1) {
    const setPlanSize = (patch: Partial<Pick<PlanDocument['settings'], 'planWidth' | 'planHeight'>>) =>
      dispatch({ type: 'commit', doc: { ...doc, settings: { ...doc.settings, ...patch } } });
    const clampPlanDim = (v: number) => Math.min(MAX_PLAN_DIM, Math.max(MIN_PLAN_DIM, v));
    return (
      <Box sx={{ width: 250, flexShrink: 0, borderLeft: 1, borderColor: 'divider', p: 2, bgcolor: 'background.paper', overflowY: 'auto' }}>
        {selection.length === 0 ? (
          <Stack spacing={1.5}>
            <Typography variant="subtitle2">Plan settings</Typography>
            <Stack direction="row" spacing={1} justifyContent="space-between">
              <DimensionField
                label="Plan width"
                value={doc.settings.planWidth}
                disabled={readOnly}
                onCommit={(w) => setPlanSize({ planWidth: clampPlanDim(w) })}
              />
              <DimensionField
                label="Plan height"
                value={doc.settings.planHeight}
                disabled={readOnly}
                onCommit={(h) => setPlanSize({ planHeight: clampPlanDim(h) })}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Accepts feet/inches, e.g. 100' or 45' 6". Objects outside a smaller
              plan are kept and stay selectable.
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">Label size</Typography>
              <Select
                size="small"
                value={(doc.settings.labels ?? DEFAULT_LABEL_SETTINGS).fontSize}
                disabled={readOnly}
                onChange={(e) =>
                  dispatch({
                    type: 'commit',
                    doc: {
                      ...doc,
                      settings: {
                        ...doc.settings,
                        labels: { ...(doc.settings.labels ?? DEFAULT_LABEL_SETTINGS), fontSize: Number(e.target.value) },
                      },
                    },
                  })
                }
                sx={{ '& .MuiSelect-select': { py: 0.25 } }}
                aria-label="Element label size"
              >
                {[6, 8, 10, 12].map((s) => (
                  <MenuItem key={s} value={s}>{s}"</MenuItem>
                ))}
              </Select>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ pt: 1 }}>
              Select an object to edit its properties.
            </Typography>
          </Stack>
        ) : (
          <Stack spacing={1.5}>
            <Typography variant="subtitle2">
              {`${selection.length} selected`}
              {wallCount > 0 || otherCount > 0
                ? ` — ${[
                    wallCount > 0 ? `${wallCount} wall${wallCount > 1 ? 's' : ''}` : null,
                    nonWallElementCount > 0 ? `${nonWallElementCount} element${nonWallElementCount > 1 ? 's' : ''}` : null,
                    otherCount > 0 ? `${otherCount} other` : null,
                  ].filter(Boolean).join(', ')}`
                : ''}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {selectionIsGrouped(doc, selection)
                ? 'Grouped — moves and deletes together; Ctrl+Shift+G to ungroup.'
                : 'Drag to move, Delete to remove, Ctrl+G to group.'}
            </Typography>

            {onResizeSelection && (
              <SelectionSizeSection
                doc={doc}
                selection={selection}
                readOnly={readOnly}
                onResize={onResizeSelection}
              />
            )}

            {wallCount > 0 && onSetWallThickness && (
              <Stack spacing={0.5}>
                <Typography variant="caption" color="text.secondary">
                  {wallCount === selection.length
                    ? 'Wall thickness (all selected walls)'
                    : `Wall thickness (applies to the ${wallCount} wall${wallCount > 1 ? 's' : ''})`}
                </Typography>
                <DimensionField
                  label="Thickness"
                  value={commonWallThickness ?? 0}
                  disabled={readOnly}
                  onCommit={(t) => onSetWallThickness(Math.max(1, t))}
                />
                {commonWallThickness == null && (
                  <Typography variant="caption" color="text.secondary">
                    Mixed thicknesses — type a value to unify.
                  </Typography>
                )}
              </Stack>
            )}

            {selectedElementCount > 0 && !readOnly && onSetSelectionLabelsHidden && (
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={() => onSetSelectionLabelsHidden(true)} sx={{ textTransform: 'none' }}>
                  Hide labels
                </Button>
                <Button size="small" variant="outlined" onClick={() => onSetSelectionLabelsHidden(false)} sx={{ textTransform: 'none' }}>
                  Show labels
                </Button>
              </Stack>
            )}
            {nonWallElementCount > 0 && !readOnly && onApplyImageToSelection && (
              <MultiElementImageTools
                count={selectedElementCount}
                assets={assets}
                onUploadAsset={onUploadAsset}
                onApplyImage={onApplyImageToSelection}
                onResetImages={onResetSelectionImages}
              />
            )}
          </Stack>
        )}
      </Box>
    );
  }

  const ref = selection[0];
  const obj = getObject(doc, ref);
  if (!obj) return null;
  const patch = (p: Record<string, unknown>) => onPatch(ref, p);

  return (
    <Box sx={{ width: 250, flexShrink: 0, borderLeft: 1, borderColor: 'divider', p: 2, bgcolor: 'background.paper', overflowY: 'auto' }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
          {ref.kind === 'infoBlock' ? 'Info block' : ref.kind}
        </Typography>

        {ref.kind === 'element' && (() => {
          const el = obj as PlanElement;
          const isWall = Boolean(kindIndex?.[el.kind]?.isWall);
          // Display/edit the on-floor (visual) footprint: at 90°/270° the raw
          // w/h are swapped, so a rotated 48×144 gondola shows 144 wide × 48 deep.
          const visual = rotatedBounds({ x: el.x, y: el.y, w: el.w, h: el.h }, el.rotation);
          const commitVisual = (patchVisual: Partial<Rect>) => {
            patch({ ...rawRectFromVisual({ ...visual, ...patchVisual }, el.rotation) });
          };
          return (
            <>
              <TextField size="small" label="Label" value={el.label} disabled={readOnly} onChange={(e) => patch({ label: e.target.value })} />
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary">Show label on plan</Typography>
                <Switch
                  size="small"
                  checked={!el.labelHidden}
                  disabled={readOnly}
                  onChange={(_, v) => patch({ labelHidden: v ? undefined : true })}
                  inputProps={{ 'aria-label': 'Show label on plan' }}
                />
              </Stack>
              {isWall ? (
                // Walls are structural: Length + Thickness (raw dims) survive rotation
                <Stack direction="row" spacing={1} justifyContent="space-between">
                  <DimensionField label="Length" value={el.w} disabled={readOnly} onCommit={(w) => patch({ w: Math.max(2, w) })} />
                  <DimensionField label="Thickness" value={el.h} disabled={readOnly} onCommit={(h) => patch({ h: Math.max(1, h) })} />
                </Stack>
              ) : (
                <Stack direction="row" spacing={1} justifyContent="space-between">
                  <DimensionField label="Width" value={visual.w} disabled={readOnly} onCommit={(w) => commitVisual({ w: Math.max(2, w) })} />
                  <DimensionField label="Depth" value={visual.h} disabled={readOnly} onCommit={(h) => commitVisual({ h: Math.max(2, h) })} />
                </Stack>
              )}
              <Stack direction="row" spacing={1} justifyContent="space-between">
                <DimensionField label="X" value={visual.x} disabled={readOnly} onCommit={(x) => commitVisual({ x })} />
                <DimensionField label="Y" value={visual.y} disabled={readOnly} onCommit={(y) => commitVisual({ y })} />
              </Stack>
              <Typography variant="caption" color="text.secondary">Rotation: {el.rotation}°</Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Button size="small" variant="outlined" disabled={readOnly} onClick={() => patch({ rotation: (el.rotation + 90) % 360 })} startIcon={<RotateRightIcon />}>
                  Rotate 90°
                </Button>
              </Stack>
              <Button size="small" variant="outlined" color={el.active ? 'warning' : 'success'} disabled={readOnly} onClick={() => patch({ active: !el.active })}>
                {el.active ? 'Mark inactive' : 'Mark active'}
              </Button>
              <Divider />
              <ElementImagePicker
                element={el}
                assets={assets}
                onUploadAsset={onUploadAsset}
                patch={patch}
                readOnly={readOnly}
                defaultImage={kindIndex?.[el.kind]?.image}
              />
            </>
          );
        })()}

        {ref.kind === 'zone' && (() => {
          const zone = obj as PlanZone;
          return (
            <>
              <TextField size="small" label="Label" value={zone.label} disabled={readOnly} onChange={(e) => patch({ label: e.target.value })} />
              <Stack direction="row" spacing={1} justifyContent="space-between">
                <DimensionField label="Width" value={zone.w} disabled={readOnly} onCommit={(w) => patch({ w: Math.max(2, w) })} />
                <DimensionField label="Height" value={zone.h} disabled={readOnly} onCommit={(h) => patch({ h: Math.max(2, h) })} />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary">Color</Typography>
                <input type="color" value={zone.color} disabled={readOnly} onChange={(e) => patch({ color: e.target.value })} aria-label="Zone color" style={{ width: 32, height: 26, border: 'none', padding: 0, background: 'none' }} />
                <Typography variant="caption" color="text.secondary">Opacity</Typography>
                <Select size="small" value={zone.opacity} disabled={readOnly} onChange={(e) => patch({ opacity: Number(e.target.value) })} sx={{ '& .MuiSelect-select': { py: 0.25 } }}>
                  {[0.1, 0.25, 0.4, 0.6].map((o) => <MenuItem key={o} value={o}>{Math.round(o * 100)}%</MenuItem>)}
                </Select>
              </Stack>
            </>
          );
        })()}

        {ref.kind === 'path' && (() => {
          const path = obj as PlanPath;
          return (
            <>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary">Stroke</Typography>
                <input type="color" value={path.stroke} disabled={readOnly} onChange={(e) => patch({ stroke: e.target.value })} aria-label="Path color" style={{ width: 32, height: 26, border: 'none', padding: 0, background: 'none' }} />
                <Select size="small" value={path.width} disabled={readOnly} onChange={(e) => patch({ width: Number(e.target.value) })} sx={{ '& .MuiSelect-select': { py: 0.25 } }}>
                  {[1, 2, 3, 4, 6].map((w) => <MenuItem key={w} value={w}>{w}"</MenuItem>)}
                </Select>
              </Stack>
              <Typography variant="caption" color="text.secondary">{path.points.length} points</Typography>
            </>
          );
        })()}

        {ref.kind === 'label' && (() => {
          const label = obj as PlanLabel;
          return (
            <>
              <TextField size="small" label="Text" value={label.text} disabled={readOnly} multiline maxRows={3} onChange={(e) => patch({ text: e.target.value })} />
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" color="text.secondary">Size</Typography>
                <Select size="small" value={label.fontSize} disabled={readOnly} onChange={(e) => patch({ fontSize: Number(e.target.value) })} sx={{ '& .MuiSelect-select': { py: 0.25 } }}>
                  {[6, 9, 12, 18, 24, 36].map((s) => <MenuItem key={s} value={s}>{s}"</MenuItem>)}
                </Select>
                <Typography variant="caption" color="text.secondary">Color</Typography>
                <input type="color" value={label.color} disabled={readOnly} onChange={(e) => patch({ color: e.target.value })} aria-label="Label color" style={{ width: 32, height: 26, border: 'none', padding: 0, background: 'none' }} />
              </Stack>
            </>
          );
        })()}

        {ref.kind === 'infoBlock' && (() => {
          const block = obj as PlanInfoBlock;
          const patchProps = (p: Record<string, unknown>) => patch({ props: { ...block.props, ...p } });
          return (
            <>
              {block.type === 'titleBlock' && (
                <>
                  <TextField size="small" label="Title" value={String(block.props.title ?? '')} disabled={readOnly} onChange={(e) => patchProps({ title: e.target.value })} />
                  <TextField size="small" label="Subtitle" value={String(block.props.subtitle ?? '')} disabled={readOnly} onChange={(e) => patchProps({ subtitle: e.target.value })} />
                  <TextField size="small" label="Date" value={String(block.props.date ?? '')} disabled={readOnly} onChange={(e) => patchProps({ date: e.target.value })} />
                </>
              )}
              {block.type === 'notes' && (
                <TextField size="small" label="Notes" value={String(block.props.text ?? '')} disabled={readOnly} multiline minRows={4} onChange={(e) => patchProps({ text: e.target.value })} />
              )}
              {block.type === 'northArrow' && (
                <Button size="small" variant="outlined" disabled={readOnly} startIcon={<RotateRightIcon />} onClick={() => patchProps({ rotation: (Number(block.props.rotation ?? 0) + 45) % 360 })}>
                  Rotate 45°
                </Button>
              )}
              {block.type === 'scaleBar' && (
                <Select size="small" value={Number(block.props.length ?? 120)} disabled={readOnly} onChange={(e) => patchProps({ length: Number(e.target.value) })}>
                  {[60, 120, 240, 600].map((len) => <MenuItem key={len} value={len}>{len / 12} ft bar</MenuItem>)}
                </Select>
              )}
              {block.type === 'legend' && (
                <Typography variant="caption" color="text.secondary">
                  The legend lists element types currently placed on the plan.
                </Typography>
              )}
              <Stack direction="row" spacing={1} justifyContent="space-between">
                <DimensionField label="Width" value={block.w} disabled={readOnly} onCommit={(w) => patch({ w: Math.max(12, w) })} />
                <DimensionField label="Height" value={block.h} disabled={readOnly} onCommit={(h) => patch({ h: Math.max(12, h) })} />
              </Stack>
            </>
          );
        })()}

      </Stack>
    </Box>
  );
}

// ── Scale bar overlay (HTML, pinned to canvas corner) ────────────────────────

export function ScaleBarOverlay({ viewport }: { viewport: Viewport }) {
  const lengthInches = pickScaleBarLength(viewport.scale, 320);
  const px = lengthInches * viewport.scale;
  return (
    <Box
      sx={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        bgcolor: 'rgba(255,255,255,0.9)',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        px: 1,
        py: 0.5,
        pointerEvents: 'none',
      }}
    >
      <Box sx={{ width: px, height: 6, display: 'flex' }}>
        <Box sx={{ flex: 1, bgcolor: '#263238' }} />
        <Box sx={{ flex: 1, bgcolor: '#fff', border: '1px solid #263238' }} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {formatInches(lengthInches)}
      </Typography>
    </Box>
  );
}
