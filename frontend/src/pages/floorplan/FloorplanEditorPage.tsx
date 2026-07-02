import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useSnackbar } from 'notistack';
import { isAxiosError } from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useFloorPlan, useSaveFloorPlan } from '../../hooks/useFloorplans';
import { useFloorPlanAssets, useUploadFloorPlanAsset } from '../../hooks/useFloorplanAssets';
import { useFloorPlanElementKinds } from '../../hooks/useFloorplanElementKinds';
import type { FloorPlanElementKind, PlanElement, PlanInfoBlock } from '../../types/floorplan.types';
import {
  addElement,
  addInfoBlock,
  alignObjects,
  cloneObjects,
  collectionKeyFor,
  deleteObjects,
  distributeObjects,
  editorReducer,
  getObject,
  groupObjects,
  initialEditorState,
  moveObjects,
  rotateObjects90,
  newId,
  selectionIsGrouped,
  ungroupObjects,
  updateObject,
  type AlignMode,
  type SelectionRef,
} from '../../features/floorplan/editorState';
import { migratePlanDocument, UnsupportedSchemaError } from '../../features/floorplan/migrations';
import type { Viewport, Point } from '../../features/floorplan/geometry';
import {
  buildPaletteIndex,
  elementKindToPaletteEntry,
  paletteCategories,
  STATIC_PALETTE,
  type PaletteEntry,
} from '../../features/floorplan/palette';
import FloorplanCanvas, { defaultInfoBlock, type DrawStroke } from '../../features/floorplan/FloorplanCanvas';
import { EditorToolbar, PaletteSidebar, PropertiesPanel, ScaleBarOverlay } from '../../features/floorplan/EditorChrome';
import ElementKindDialog from '../../features/floorplan/ElementKindDialog';
import { exportPlanJson, exportPlanPng } from '../../features/floorplan/exportPlan';

const EMPTY_DOC_STATE = initialEditorState({
  schema_version: 1,
  settings: { planWidth: 1200, planHeight: 720, grid: { visible: true, minor: 6, major: 12 }, snap: 1 },
  elements: [],
  zones: [],
  paths: [],
  labels: [],
  infoBlocks: [],
});

export default function FloorplanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const planId = Number(id);
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { user } = useAuth();
  const readOnly = !user?.role || !['Manager', 'Admin'].includes(user.role);
  const canManageKinds = Boolean(user?.is_superuser);

  const planQuery = useFloorPlan(Number.isFinite(planId) ? planId : null);
  const saveMutation = useSaveFloorPlan();
  const assetsQuery = useFloorPlanAssets(
    planQuery.data ? { location: planQuery.data.location } : undefined,
  );
  const uploadAsset = useUploadFloorPlanAsset();
  const assets = assetsQuery.data ?? [];
  const assetMap = useMemo(
    () => new Map(assets.map((a) => [a.id, a.data])),
    [assets],
  );

  // Element kind catalog (DB-backed palette). The static mirror of the seeded
  // built-ins keeps first paint correct while the query loads.
  const kindsQuery = useFloorPlanElementKinds();
  const paletteEntries = useMemo(
    () => (kindsQuery.data ? kindsQuery.data.map(elementKindToPaletteEntry) : STATIC_PALETTE),
    [kindsQuery.data],
  );
  const kindIndex = useMemo(() => buildPaletteIndex(paletteEntries), [paletteEntries]);
  const kindCategories = useMemo(() => paletteCategories(paletteEntries), [paletteEntries]);
  const [kindDialog, setKindDialog] = useState<{ open: boolean; kind: FloorPlanElementKind | null }>({
    open: false,
    kind: null,
  });

  const handleUploadAsset = useCallback(
    async (file: File) => {
      try {
        const asset = await uploadAsset.mutateAsync({
          file,
          location: planQuery.data?.location ?? null,
        });
        enqueueSnackbar(`Uploaded "${asset.name}"`, { variant: 'success' });
        return asset;
      } catch (err) {
        const detail =
          isAxiosError(err) && err.response?.data && typeof err.response.data === 'object'
            ? String((err.response.data as { file?: string }).file ?? '')
            : '';
        enqueueSnackbar(detail || 'Upload failed. SVG, PNG, or JPEG up to 512 KB.', { variant: 'error' });
        return null;
      }
    },
    [uploadAsset, planQuery.data?.location, enqueueSnackbar],
  );

  const [state, dispatch] = useReducer(editorReducer, EMPTY_DOC_STATE);
  const [viewport, setViewport] = useState<Viewport>({ x: -40, y: -40, scale: 0.8 });
  const [pendingPlacement, setPendingPlacement] = useState<PaletteEntry | null>(null);
  const [drawStroke, setDrawStroke] = useState<DrawStroke>({ color: '#37474f', width: 2 });
  const [conflict, setConflict] = useState<{ currentRevision: number } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportAnchor, setExportAnchor] = useState<HTMLElement | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const revisionRef = useRef<number>(1);
  const loadedRef = useRef(false);

  const stateRef = useRef(state);
  stateRef.current = state;

  // Load document into the editor once
  useEffect(() => {
    if (!planQuery.data || loadedRef.current) return;
    try {
      const doc = migratePlanDocument(planQuery.data.data);
      revisionRef.current = planQuery.data.revision;
      dispatch({ type: 'load', doc });
      loadedRef.current = true;
      // Fit plan into view with a margin
      const { planWidth, planHeight } = doc.settings;
      const availableW = window.innerWidth - 500;
      const availableH = window.innerHeight - 160;
      const scale = Math.max(0.05, Math.min(availableW / (planWidth * 1.1), availableH / (planHeight * 1.1)));
      setViewport({
        x: -(availableW / scale - planWidth) / 2,
        y: -(availableH / scale - planHeight) / 2,
        scale,
      });
    } catch (err) {
      setLoadError(
        err instanceof UnsupportedSchemaError
          ? 'This plan was saved with a newer version of the app. Refresh your browser and try again.'
          : 'Failed to load plan document.',
      );
    }
  }, [planQuery.data]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const doSave = useCallback(
    (revisionOverride?: number) => {
      const current = stateRef.current;
      if (readOnly || saveMutation.isPending) return;
      saveMutation.mutate(
        { id: planId, data: current.doc, revision: revisionOverride ?? revisionRef.current },
        {
          onSuccess: (result) => {
            revisionRef.current = result.revision;
            setConflict(null);
            dispatch({ type: 'markSaved' });
            enqueueSnackbar('Plan saved', { variant: 'success' });
          },
          onError: (err) => {
            if (isAxiosError(err) && err.response?.status === 409) {
              setConflict({ currentRevision: (err.response.data as { current_revision: number }).current_revision });
            } else {
              enqueueSnackbar('Failed to save plan. Check your connection and try again.', { variant: 'error' });
            }
          },
        },
      );
    },
    [planId, readOnly, saveMutation, enqueueSnackbar],
  );

  // Unsaved-change protection for refresh/close
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (stateRef.current.dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ── Editing actions ───────────────────────────────────────────────────────

  const deleteSelection = useCallback(() => {
    const current = stateRef.current;
    if (current.selection.length === 0) return;
    dispatch({ type: 'commit', doc: deleteObjects(current.doc, current.selection) });
    dispatch({ type: 'setSelection', selection: [] });
  }, []);

  // ── Clipboard (in-memory) ─────────────────────────────────────────────────
  // Holds the source doc + refs at copy time; paste clones from that snapshot.
  const clipboardRef = useRef<{ doc: typeof EMPTY_DOC_STATE.doc; refs: SelectionRef[]; pasteCount: number } | null>(null);
  const PASTE_OFFSET = 12; // inches

  const copySelection = useCallback(() => {
    const current = stateRef.current;
    if (current.selection.length === 0) return;
    clipboardRef.current = { doc: current.doc, refs: current.selection, pasteCount: 0 };
    enqueueSnackbar(`Copied ${current.selection.length} object${current.selection.length > 1 ? 's' : ''}`, { variant: 'info' });
  }, [enqueueSnackbar]);

  const cutSelection = useCallback(() => {
    const current = stateRef.current;
    if (current.selection.length === 0) return;
    clipboardRef.current = { doc: current.doc, refs: current.selection, pasteCount: 0 };
    dispatch({ type: 'commit', doc: deleteObjects(current.doc, current.selection) });
    dispatch({ type: 'setSelection', selection: [] });
  }, []);

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    clip.pasteCount += 1;
    const offset = PASTE_OFFSET * clip.pasteCount;
    // Clone out of the copy-time snapshot, then merge the clones into the current doc.
    const cloned = cloneObjects(clip.doc, clip.refs, offset, offset);
    const current = stateRef.current;
    let doc = current.doc;
    const newRefs: SelectionRef[] = [];
    for (const ref of cloned.newRefs) {
      const obj = getObject(cloned.doc, ref);
      if (!obj) continue;
      const key = collectionKeyFor(ref.kind);
      doc = { ...doc, [key]: [...(doc[key] as object[]), obj] };
      newRefs.push(ref);
    }
    if (newRefs.length === 0) return;
    dispatch({ type: 'commit', doc });
    dispatch({ type: 'setSelection', selection: newRefs });
  }, []);

  const duplicateSelection = useCallback(() => {
    const current = stateRef.current;
    if (current.selection.length === 0) return;
    const { doc, newRefs } = cloneObjects(current.doc, current.selection, PASTE_OFFSET, PASTE_OFFSET);
    dispatch({ type: 'commit', doc });
    dispatch({ type: 'setSelection', selection: newRefs });
  }, []);

  const groupSelection = useCallback(() => {
    const current = stateRef.current;
    if (current.selection.length < 2 || selectionIsGrouped(current.doc, current.selection)) return;
    const { doc } = groupObjects(current.doc, current.selection);
    dispatch({ type: 'commit', doc });
  }, []);

  const ungroupSelection = useCallback(() => {
    const current = stateRef.current;
    if (current.selection.length === 0) return;
    dispatch({ type: 'commit', doc: ungroupObjects(current.doc, current.selection) });
  }, []);

  const selectAll = useCallback(() => {
    const doc = stateRef.current.doc;
    const refs: SelectionRef[] = [
      ...doc.elements.map((o) => ({ kind: 'element' as const, id: o.id })),
      ...doc.zones.map((o) => ({ kind: 'zone' as const, id: o.id })),
      ...doc.paths.map((o) => ({ kind: 'path' as const, id: o.id })),
      ...doc.labels.map((o) => ({ kind: 'label' as const, id: o.id })),
      ...doc.infoBlocks.map((o) => ({ kind: 'infoBlock' as const, id: o.id })),
    ];
    if (refs.length > 0) dispatch({ type: 'setSelection', selection: refs });
  }, []);

  /** Set (or clear, with null) the image on every selected element. */
  const applyImageToSelection = useCallback((image: number | null) => {
    const current = stateRef.current;
    let doc = current.doc;
    for (const ref of current.selection) {
      if (ref.kind !== 'element') continue;
      doc = updateObject(doc, ref, { image: image ?? undefined });
    }
    if (doc !== current.doc) dispatch({ type: 'commit', doc });
  }, []);

  /**
   * Reset every selected element's image to its kind's CURRENT default —
   * re-running this after a kind's default image changes adopts the new one.
   */
  const resetSelectionImages = useCallback(() => {
    const current = stateRef.current;
    let doc = current.doc;
    for (const ref of current.selection) {
      if (ref.kind !== 'element') continue;
      const el = getObject(doc, ref) as PlanElement | undefined;
      if (!el) continue;
      doc = updateObject(doc, ref, { image: kindIndex[el.kind]?.image ?? undefined });
    }
    if (doc !== current.doc) dispatch({ type: 'commit', doc });
  }, [kindIndex]);

  const alignSelection = useCallback((mode: AlignMode) => {
    const current = stateRef.current;
    if (current.selection.length < 2) return;
    const doc = alignObjects(current.doc, current.selection, mode);
    if (doc !== current.doc) dispatch({ type: 'commit', doc });
  }, []);

  const distributeSelection = useCallback((axis: 'h' | 'v') => {
    const current = stateRef.current;
    if (current.selection.length < 3) return;
    const doc = distributeObjects(current.doc, current.selection, axis);
    if (doc !== current.doc) dispatch({ type: 'commit', doc });
  }, []);

  // Arrow keys nudge the selection by the smallest increment (1"), 1' with Shift.
  const nudgeSelection = useCallback((dx: number, dy: number) => {
    const current = stateRef.current;
    if (current.selection.length === 0) return;
    dispatch({ type: 'commit', doc: moveObjects(current.doc, current.selection, dx, dy) });
  }, []);

  const rotateSelection = useCallback(() => {
    const current = stateRef.current;
    let doc = current.doc;
    if (current.selection.length > 1) {
      // Groups / multi-selections rotate as one rigid unit about their common center
      doc = rotateObjects90(doc, current.selection);
    } else {
      for (const ref of current.selection) {
        if (ref.kind !== 'element') continue;
        const el = getObject(doc, ref) as PlanElement | undefined;
        if (el) doc = updateObject<PlanElement>(doc, ref, { rotation: (el.rotation + 90) % 360 });
      }
    }
    if (doc !== current.doc) dispatch({ type: 'commit', doc });
  }, []);

  const handlePlace = useCallback((entry: PaletteEntry, position: Point, keepPlacing?: boolean) => {
    const current = stateRef.current;
    const element: PlanElement = {
      id: newId('el'),
      kind: entry.kind,
      x: position.x - entry.w / 2,
      y: position.y - entry.h / 2,
      w: entry.w,
      h: entry.h,
      rotation: 0,
      label: entry.image != null ? entry.label : '',
      active: true,
      ...(entry.image != null ? { image: entry.image } : {}),
    };
    dispatch({ type: 'commit', doc: addElement(current.doc, element) });
    dispatch({ type: 'setSelection', selection: [{ kind: 'element', id: element.id }] });
    // Single placement by default; hold Shift while clicking to place more.
    if (!keepPlacing) setPendingPlacement(null);
  }, []);

  // Switching tools always cancels a pending palette placement.
  useEffect(() => {
    setPendingPlacement(null);
  }, [state.tool]);

  const handleAddInfoBlock = useCallback(
    (type: PlanInfoBlock['type']) => {
      const current = stateRef.current;
      // Drop near the current viewport center
      const cx = viewport.x + (window.innerWidth - 470) / 2 / viewport.scale;
      const cy = viewport.y + (window.innerHeight - 160) / 2 / viewport.scale;
      const block = defaultInfoBlock(type, { x: cx, y: cy });
      dispatch({ type: 'commit', doc: addInfoBlock(current.doc, block) });
      dispatch({ type: 'setSelection', selection: [{ kind: 'infoBlock', id: block.id }] });
    },
    [viewport],
  );

  const handlePatch = useCallback((ref: SelectionRef, patch: Record<string, unknown>) => {
    const current = stateRef.current;
    dispatch({ type: 'commit', doc: updateObject(current.doc, ref, patch) });
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setViewport((vp) => {
      const cx = (window.innerWidth - 470) / 2;
      const cy = (window.innerHeight - 160) / 2;
      const world = { x: cx / vp.scale + vp.x, y: cy / vp.scale + vp.y };
      const scale = Math.min(40, Math.max(0.05, vp.scale * factor));
      return { scale, x: world.x - cx / scale, y: world.y - cy / scale };
    });
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        doSave();
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'undo' });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        dispatch({ type: 'redo' });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (readOnly) return;
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'c':
            e.preventDefault();
            copySelection();
            return;
          case 'x':
            e.preventDefault();
            cutSelection();
            return;
          case 'v':
            e.preventDefault();
            pasteClipboard();
            return;
          case 'd':
            e.preventDefault();
            duplicateSelection();
            return;
          case 'g':
            e.preventDefault();
            if (e.shiftKey) ungroupSelection();
            else groupSelection();
            return;
          default:
            return;
        }
      }
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (stateRef.current.selection.length === 0) break;
          e.preventDefault();
          const step = e.shiftKey ? 12 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          nudgeSelection(dx, dy);
          break;
        }
        case 'Delete':
        case 'Backspace':
          deleteSelection();
          break;
        case 'Escape':
          setPendingPlacement(null);
          dispatch({ type: 'setSelection', selection: [] });
          break;
        case 'v':
          dispatch({ type: 'setTool', tool: 'select' });
          break;
        case 'h':
          dispatch({ type: 'setTool', tool: 'pan' });
          break;
        case 'z':
          dispatch({ type: 'setTool', tool: 'zone' });
          break;
        case 'd':
          dispatch({ type: 'setTool', tool: 'draw' });
          break;
        case 't':
          dispatch({ type: 'setTool', tool: 'label' });
          break;
        case 'r':
          rotateSelection();
          break;
        case 'g': {
          const doc = stateRef.current.doc;
          dispatch({
            type: 'commit',
            doc: { ...doc, settings: { ...doc.settings, grid: { ...doc.settings.grid, visible: !doc.settings.grid.visible } } },
          });
          break;
        }
        case '+':
        case '=':
          zoomBy(1.25);
          break;
        case '-':
          zoomBy(1 / 1.25);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [doSave, deleteSelection, rotateSelection, zoomBy, readOnly, copySelection, cutSelection, pasteClipboard, duplicateSelection, groupSelection, ungroupSelection, nudgeSelection, selectAll]);

  // ── Export ────────────────────────────────────────────────────────────────

  const planName = planQuery.data?.name ?? 'floorplan';

  const handleExportJson = () => {
    exportPlanJson(stateRef.current.doc, planName);
    setExportAnchor(null);
  };

  const handleExportPng = async () => {
    setExportAnchor(null);
    if (!svgRef.current) return;
    try {
      await exportPlanPng(svgRef.current, stateRef.current.doc, planName);
    } catch {
      enqueueSnackbar('PNG export failed.', { variant: 'error' });
    }
  };

  const handleBack = () => {
    if (state.dirty && !readOnly) {
      setConfirmLeave(true);
    } else {
      navigate('/floor-ops/floorplans');
    }
  };

  const objectCount = useMemo(
    () =>
      state.doc.elements.length + state.doc.zones.length + state.doc.paths.length +
      state.doc.labels.length + state.doc.infoBlocks.length,
    [state.doc],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (planQuery.isLoading) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (planQuery.isError || loadError) {
    return (
      <Box sx={{ p: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError ?? 'Failed to load this floorplan. It may have been deleted or you may not have access.'}
        </Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/floor-ops/floorplans')}>
          Back to floorplans
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar variant="dense" sx={{ gap: 1 }}>
          <IconButton edge="start" onClick={handleBack} aria-label="Back to floorplan list">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mr: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {planName}
          </Typography>
          <Chip
            size="small"
            label={readOnly ? 'View only' : state.dirty ? 'Unsaved changes' : 'Saved'}
            color={readOnly ? 'default' : state.dirty ? 'warning' : 'success'}
            variant={state.dirty ? 'filled' : 'outlined'}
          />
          {objectCount > 500 && (
            <Tooltip title="Large plans may feel slower to edit.">
              <Chip size="small" color="warning" label={`${objectCount} objects`} />
            </Tooltip>
          )}
          <Box sx={{ flex: 1 }} />
          <Button size="small" startIcon={<FileDownloadIcon />} onClick={(e) => setExportAnchor(e.currentTarget)}>
            Export
          </Button>
          <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
            <MenuItem onClick={handleExportJson}>JSON (backup / interchange)</MenuItem>
            <MenuItem onClick={handleExportPng}>PNG image</MenuItem>
          </Menu>
          {!readOnly && (
            <Button
              size="small"
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={() => doSave()}
              disabled={saveMutation.isPending || !state.dirty}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <EditorToolbar
        state={state}
        dispatch={dispatch}
        onZoom={zoomBy}
        onDeleteSelection={deleteSelection}
        onRotateSelection={rotateSelection}
        onCopySelection={copySelection}
        onDuplicateSelection={duplicateSelection}
        onGroupSelection={groupSelection}
        onUngroupSelection={ungroupSelection}
        onAlignSelection={alignSelection}
        onDistributeSelection={distributeSelection}
        readOnly={readOnly}
      />

      <Stack direction="row" sx={{ flex: 1, minHeight: 0 }}>
        <PaletteSidebar
          entries={paletteEntries}
          pendingPlacement={pendingPlacement}
          onPick={setPendingPlacement}
          onAddInfoBlock={handleAddInfoBlock}
          drawStroke={drawStroke}
          onDrawStrokeChange={setDrawStroke}
          activeTool={state.tool}
          readOnly={readOnly}
          canManageKinds={canManageKinds}
          onCreateKind={() => setKindDialog({ open: true, kind: null })}
          onEditKind={(entry) => {
            const kind = kindsQuery.data?.find((k) => k.id === entry.kindId) ?? null;
            if (kind) setKindDialog({ open: true, kind });
          }}
        />
        <Box sx={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex' }}>
          <FloorplanCanvas
            state={state}
            dispatch={dispatch}
            viewport={viewport}
            onViewportChange={setViewport}
            pendingPlacement={pendingPlacement}
            onPlace={handlePlace}
            drawStroke={drawStroke}
            svgRef={svgRef}
            readOnly={readOnly}
            assets={assetMap}
            kindIndex={kindIndex}
          />
          <ScaleBarOverlay viewport={viewport} />
        </Box>
        <PropertiesPanel
          state={state}
          dispatch={dispatch}
          onPatch={handlePatch}
          readOnly={readOnly}
          assets={assets}
          onUploadAsset={handleUploadAsset}
          kindIndex={kindIndex}
          onApplyImageToSelection={applyImageToSelection}
          onResetSelectionImages={resetSelectionImages}
        />
      </Stack>

      {canManageKinds && (
        <ElementKindDialog
          open={kindDialog.open}
          kind={kindDialog.kind}
          categories={kindCategories}
          assets={assets}
          onUploadAsset={handleUploadAsset}
          onClose={() => setKindDialog({ open: false, kind: null })}
        />
      )}

      {/* Save conflict dialog */}
      <Dialog open={Boolean(conflict)} onClose={() => setConflict(null)}>
        <DialogTitle>Plan was modified by someone else</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Someone saved a newer version of this plan while you were editing. You can overwrite
            their changes with your version, or discard your changes and reload theirs.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => window.location.reload()}>Discard mine and reload</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => conflict && doSave(conflict.currentRevision)}
          >
            Overwrite with my version
          </Button>
        </DialogActions>
      </Dialog>

      {/* Unsaved changes on back */}
      <Dialog open={confirmLeave} onClose={() => setConfirmLeave(false)}>
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogContent>
          <DialogContentText>You have unsaved changes. Leave without saving?</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLeave(false)}>Keep editing</Button>
          <Button color="error" onClick={() => navigate('/floor-ops/floorplans')}>
            Leave without saving
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
