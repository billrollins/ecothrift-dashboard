import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddLocationAltIcon from '@mui/icons-material/AddLocationAlt';
import { useSnackbar } from 'notistack';
import { canAccess } from '../../auth/access';
import { useAuth } from '../../contexts/AuthContext';
import {
  useCreateMapPin,
  useDeleteMapPin,
  useStoreMap,
  useUpdateMapPin,
} from '../../hooks/useFloorplans';
import { useFloorPlanAssets } from '../../hooks/useFloorplanAssets';
import { useFloorPlanElementKinds } from '../../hooks/useFloorplanElementKinds';
import { migratePlanDocument } from '../../features/floorplan/migrations';
import { buildPaletteIndex, elementKindToPaletteEntry, STATIC_PALETTE } from '../../features/floorplan/palette';
import StoreMapView, { type StoreMapPoint } from '../../features/floorplan/StoreMapView';
import type { MapLayer, MapPin, PlanDocument } from '../../types/floorplan.types';

/** Where a pin that stands for a record opens that record (one line per kind of layer that has one). */
const REF_LINKS: Record<string, { label: string; to: (id: number) => string }> = {
  'signage.sign': { label: 'Open the sign', to: (id) => `/facilities/signage?sign=${id}` },
};

/** What the pin dialog is doing: a new pin at a spot, or editing one. */
type PinDraft = { mode: 'new'; layer: number; point: StoreMapPoint; name: string; note: string }
  | { mode: 'edit'; pin: MapPin; name: string; note: string };

/**
 * Facilities → Store map (#105): the store's Current floor plan with layers of pins. Every staff login can look;
 * managers drop, edit, drag and remove pins. The plan itself is drawn in Studios → Floorplans.
 */
export default function StoreMapPage() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const canManage = canAccess(user, ['floorplan:write', 'studios:manage']);
  // Versions (#130): a past Current plan with the pins it kept; read-only. Picked by its stretch as Current.
  const [versionId, setVersionId] = useState<number | null>(null);
  const [versionPlan, setVersionPlan] = useState<number | undefined>(undefined);
  const mapQuery = useStoreMap(versionPlan);
  const plan = mapQuery.data?.plan ?? null;
  const isHistory = Boolean(mapQuery.data?.is_history);
  const canEdit = canManage && !isHistory;
  const versions = mapQuery.data?.versions ?? [];
  const shownVersion = versions.find((v) => v.id === versionId) ?? versions.find((v) => v.is_current) ?? null;
  const layers = useMemo(() => mapQuery.data?.layers ?? [], [mapQuery.data]);
  const pins = useMemo(() => mapQuery.data?.pins ?? [], [mapQuery.data]);

  const assetsQuery = useFloorPlanAssets(plan ? { location: plan.location } : undefined);
  const assetMap = useMemo(() => new Map((assetsQuery.data ?? []).map((a) => [a.id, a.data])), [assetsQuery.data]);
  const kindsQuery = useFloorPlanElementKinds();
  const kindIndex = useMemo(
    () => buildPaletteIndex(kindsQuery.data ? kindsQuery.data.map(elementKindToPaletteEntry) : STATIC_PALETTE),
    [kindsQuery.data],
  );
  const doc = useMemo<PlanDocument | null>(() => {
    if (!plan) return null;
    try {
      return migratePlanDocument(plan.data);
    } catch {
      return null;
    }
  }, [plan]);

  // Every layer starts on; the choice holds while the page is open.
  const [hiddenLayers, setHiddenLayers] = useState<Set<number>>(new Set());
  const visibleLayerIds = useMemo(
    () => new Set(layers.filter((l) => !hiddenLayers.has(l.id)).map((l) => l.id)),
    [layers, hiddenLayers],
  );
  const toggleLayer = (id: number) =>
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  // A removed pin simply stops matching; a new one matches once the map refetches.
  const selected = pins.find((p) => p.id === selectedId) ?? null;

  // Placing: a layer is chosen, the next tap on the map opens the dialog.
  // Layers whose pins point at a record (signs) get their pins from that record's page.
  const plainLayers = layers.filter((l) => !l.ref_type);
  const [placingLayer, setPlacingLayer] = useState<number | null>(null);
  const [draft, setDraft] = useState<PinDraft | null>(null);
  const createPin = useCreateMapPin();
  const updatePin = useUpdateMapPin();
  const deletePin = useDeleteMapPin();

  const onError = (fallback: string) => (err: unknown) => {
    const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
    const first = data ? Object.values(data)[0] : null;
    enqueueSnackbar(Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : fallback, { variant: 'error' });
  };

  const savePin = () => {
    if (!draft || !plan || !draft.name.trim()) return;
    if (draft.mode === 'new') {
      createPin.mutate(
        { plan: plan.id, layer: draft.layer, x: draft.point.x, y: draft.point.y, name: draft.name.trim(), note: draft.note.trim() },
        {
          onSuccess: (pin) => {
            setDraft(null);
            setSelectedId(pin.id);
          },
          onError: onError('Could not save the pin.'),
        },
      );
    } else {
      updatePin.mutate(
        { id: draft.pin.id, name: draft.name.trim(), note: draft.note.trim() },
        { onSuccess: () => setDraft(null), onError: onError('Could not save the pin.') },
      );
    }
  };

  const movePin = (pin: MapPin, point: StoreMapPoint) =>
    updatePin.mutate({ id: pin.id, x: point.x, y: point.y }, { onError: onError('Could not move the pin.') });

  const removePin = (pin: MapPin) => {
    if (!window.confirm(`Remove the pin "${pin.name}" from the map?`)) return;
    deletePin.mutate(pin.id, { onError: onError('Could not remove the pin.') });
  };

  const layerById = new Map(layers.map((l) => [l.id, l]));
  const countFor = (layer: MapLayer) => pins.filter((p) => p.layer === layer.id).length;
  const shownPins = pins.filter((p) => visibleLayerIds.has(p.layer));
  const fmtDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const versionLabel = (v: { plan_name: string; started_at: string; ended_at: string | null }) =>
    `${v.plan_name} · ${fmtDay(v.started_at)} – ${v.ended_at ? fmtDay(v.ended_at) : 'now'}`;

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Store map</Typography>
          {plan && (
            <Typography variant="body2" color="text.secondary">
              {isHistory
                ? `Past version (read-only): ${plan.name}`
                : `Current plan: ${plan.name}`}
              {canEdit && (
                <>
                  {' · '}
                  <RouterLink to={`/floor-ops/floorplans/${plan.id}/edit`}>Edit the drawing</RouterLink>
                </>
              )}
            </Typography>
          )}
        </Box>
        {versions.length > 1 && (
          <TextField
            select
            size="small"
            label="Version"
            value={shownVersion?.id ?? ''}
            onChange={(e) => {
              const picked = versions.find((v) => v.id === Number(e.target.value));
              setVersionId(picked?.id ?? null);
              setVersionPlan(picked && !picked.is_current ? picked.plan_id : undefined);
              setSelectedId(null);
              setPlacingLayer(null);
            }}
            sx={{ minWidth: 260 }}
          >
            {versions.map((v) => (
              <MenuItem key={v.id} value={v.id}>{versionLabel(v)}</MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      {mapQuery.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}
      {mapQuery.isError && <Alert severity="error">Could not load the store map.</Alert>}
      {mapQuery.data && !plan && (
        <Alert severity="info">
          No floor plan is marked Current yet. The owner marks one in Studios → Floorplans (the star on a plan).
        </Alert>
      )}
      {plan && !doc && (
        <Alert severity="warning">This plan was saved by a newer Dash. Reload the page to see it.</Alert>
      )}

      {plan && doc && (
        <>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mb: 1.5 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>Layers</Typography>
            {layers.map((layer) => {
              const on = visibleLayerIds.has(layer.id);
              return (
                <Chip
                  key={layer.id}
                  label={`${layer.name} (${countFor(layer)})`}
                  onClick={() => toggleLayer(layer.id)}
                  variant={on ? 'filled' : 'outlined'}
                  sx={on ? { bgcolor: layer.color, color: '#fff', '&:hover': { bgcolor: layer.color } } : { borderColor: layer.color, color: layer.color }}
                  aria-pressed={on}
                />
              );
            })}
          </Stack>

          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' }, alignItems: 'start' }}>
            <StoreMapView
              doc={doc}
              layers={layers}
              pins={pins}
              visibleLayerIds={visibleLayerIds}
              assets={assetMap}
              kindIndex={kindIndex}
              highlightedPinIds={selected ? new Set([selected.id]) : undefined}
              placing={placingLayer != null}
              onMapClick={(point) => {
                if (placingLayer == null) return;
                setDraft({ mode: 'new', layer: placingLayer, point, name: '', note: '' });
                setPlacingLayer(null);
              }}
              onPinClick={(pin) => setSelectedId(pin.id === selectedId ? null : pin.id)}
              onPinMove={canEdit ? movePin : undefined}
            />

            <Stack spacing={2}>
              {selected && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="overline" sx={{ color: layerById.get(selected.layer)?.color }}>
                    {layerById.get(selected.layer)?.name}
                  </Typography>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{selected.name}</Typography>
                  {selected.note && (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>{selected.note}</Typography>
                  )}
                  {selected.ref_id != null && REF_LINKS[selected.ref_type] && (
                    <Button
                      size="small"
                      variant="outlined"
                      component={RouterLink}
                      to={REF_LINKS[selected.ref_type].to(selected.ref_id)}
                      sx={{ mt: 1.5 }}
                    >
                      {REF_LINKS[selected.ref_type].label}
                    </Button>
                  )}
                  {canEdit && !(selected.ref_id != null && REF_LINKS[selected.ref_type]) && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                      <Button size="small" onClick={() => setDraft({ mode: 'edit', pin: selected, name: selected.name, note: selected.note })}>
                        Edit
                      </Button>
                      <Button size="small" color="error" onClick={() => removePin(selected)}>Remove</Button>
                    </Stack>
                  )}
                </Paper>
              )}

              {canEdit && plainLayers.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Add a pin</Typography>
                  {placingLayer == null ? (
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {plainLayers.map((layer) => (
                        <Button
                          key={layer.id}
                          size="small"
                          variant="outlined"
                          startIcon={<AddLocationAltIcon />}
                          onClick={() => {
                            setPlacingLayer(layer.id);
                            setHiddenLayers((prev) => {
                              const next = new Set(prev);
                              next.delete(layer.id);
                              return next;
                            });
                          }}
                        >
                          {layer.name}
                        </Button>
                      ))}
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2">Tap the map where it goes.</Typography>
                      <Button size="small" onClick={() => setPlacingLayer(null)}>Cancel</Button>
                    </Stack>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Drag a pin to move it.
                  </Typography>
                </Paper>
              )}

              {canEdit && layers.some((l) => l.ref_type === 'signage.sign') && (
                <Typography variant="caption" color="text.secondary">
                  Signs get their spots on <RouterLink to="/facilities/signage">Facilities → Signage</RouterLink>. Drag a pin to move it.
                </Typography>
              )}

              <Paper variant="outlined">
                <Typography variant="subtitle2" sx={{ px: 2, pt: 1.5 }}>
                  Pins shown ({shownPins.length})
                </Typography>
                {shownPins.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ px: 2, pb: 2, pt: 0.5 }}>
                    No pins on the layers that are on.
                  </Typography>
                ) : (
                  <List dense sx={{ maxHeight: 360, overflow: 'auto' }}>
                    {shownPins.map((pin) => (
                      <ListItemButton key={pin.id} selected={pin.id === selectedId} onClick={() => setSelectedId(pin.id)}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: layerById.get(pin.layer)?.color, mr: 1.5, flexShrink: 0 }} />
                        <ListItemText primary={pin.name} secondary={layerById.get(pin.layer)?.name} />
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Paper>
            </Stack>
          </Box>
        </>
      )}

      <Dialog open={Boolean(draft)} onClose={() => setDraft(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {draft?.mode === 'new' ? `New ${layerById.get(draft.layer)?.name ?? ''} pin` : 'Edit pin'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Name"
              value={draft?.name ?? ''}
              onChange={(e) => draft && setDraft({ ...draft, name: e.target.value })}
              autoFocus
              fullWidth
              inputProps={{ maxLength: 120 }}
            />
            <TextField
              label="Note"
              value={draft?.note ?? ''}
              onChange={(e) => draft && setDraft({ ...draft, note: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDraft(null)}>Cancel</Button>
          <Button variant="contained" onClick={savePin} disabled={!draft?.name.trim() || createPin.isPending || updatePin.isPending}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
