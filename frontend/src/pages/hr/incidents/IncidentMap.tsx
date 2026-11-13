/**
 * The store map inside an incident report (#131): pick the spot where it happened (a pin on the Incidents layer of
 * the Current plan), or see the marked spot. Uses the same store map as Facilities -> Store map.
 */
import { useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, useMediaQuery, useTheme } from '@mui/material';
import StoreMapView, { type StoreMapPoint } from '../../../features/floorplan/StoreMapView';
import { migratePlanDocument } from '../../../features/floorplan/migrations';
import { buildPaletteIndex, elementKindToPaletteEntry, STATIC_PALETTE } from '../../../features/floorplan/palette';
import { useStoreMap } from '../../../hooks/useFloorplans';
import { useFloorPlanAssets } from '../../../hooks/useFloorplanAssets';
import { useFloorPlanElementKinds } from '../../../hooks/useFloorplanElementKinds';
import type { MapLayer, MapPin, PlanDocument } from '../../../types/floorplan.types';
import type { IncidentSpot } from '../../../api/incidents.api';
import { useIncidentCopy } from './incidentCopy';

export const INCIDENT_LAYER = 'incidents';

/**
 * A plan drawn for a map (the Current one, or `planId`: a past version the spot was marked on), and the Incidents
 * layer; nulls while loading or when there is none.
 */
export function useIncidentMap(enabled = true, planId?: number) {
  const mapQuery = useStoreMap(planId);
  const plan = enabled ? mapQuery.data?.plan ?? null : null;
  const layer: MapLayer | null = mapQuery.data?.layers.find((l) => l.slug === INCIDENT_LAYER) ?? null;
  const assetsQuery = useFloorPlanAssets(plan ? { location: plan.location } : undefined);
  const assets = useMemo(() => new Map((assetsQuery.data ?? []).map((a) => [a.id, a.data])), [assetsQuery.data]);
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
  return { plan, doc, layer, assets, kindIndex, loading: mapQuery.isLoading };
}

function spotPin(spot: IncidentSpot, layer: MapLayer): MapPin {
  return {
    id: -1, plan: spot.plan, layer: layer.id, layer_slug: layer.slug, x: spot.x, y: spot.y, name: '', note: '',
    ref_type: layer.ref_type, ref_id: null, status: 'wanted', created_at: '', updated_at: '',
  };
}

/** Full-screen on a phone: tap where it happened, then Use this spot. */
export function IncidentSpotPicker({ open, value, onClose, onPick }: {
  open: boolean;
  value: IncidentSpot | null;
  onClose: () => void;
  onPick: (spot: IncidentSpot) => void;
}) {
  const { t } = useIncidentCopy();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const { plan, doc, layer, assets, kindIndex } = useIncidentMap(open);
  const [draft, setDraft] = useState<StoreMapPoint | null>(null);
  const point = draft ?? (value && plan && value.plan === plan.id ? value : null);
  const ready = Boolean(plan && doc && layer);
  return (
    <Dialog open={open} onClose={onClose} fullScreen={phone} fullWidth maxWidth="md" data-testid="incident-spot-picker"
      TransitionProps={{ onExited: () => setDraft(null) }}>
      <DialogTitle sx={{ fontWeight: 800 }}>{t('markMap')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1, minHeight: 0 }}>
        <Typography variant="body2" color="text.secondary">{ready ? t('tapMap') : t('noMap')}</Typography>
        {ready && plan && doc && layer ? (
          <Box sx={{ flex: 1, minHeight: phone ? 0 : 420, height: phone ? 'auto' : 420 }}>
            <StoreMapView
              doc={doc}
              layers={[layer]}
              pins={point ? [spotPin({ plan: plan.id, ...point }, layer)] : []}
              visibleLayerIds={new Set([layer.id])}
              assets={assets}
              kindIndex={kindIndex}
              highlightedPinIds={new Set([-1])}
              placing
              onMapClick={setDraft}
              fill
            />
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button
          variant="contained"
          disabled={!point || !plan}
          data-testid="incident-spot-use"
          onClick={() => {
            if (point && plan) onPick({ plan: plan.id, x: point.x, y: point.y });
            onClose();
          }}
        >
          {t('useSpot')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** A report's marked spot, read-only, on the plan it is on (the Current one, or the past version it was marked on). */
export function IncidentSpotView({ spot }: { spot: IncidentSpot }) {
  const { plan, doc, layer, assets, kindIndex } = useIncidentMap(true, spot.plan);
  if (!plan || !doc || !layer || plan.id !== spot.plan) return null;
  return (
    <StoreMapView
      doc={doc}
      layers={[layer]}
      pins={[spotPin(spot, layer)]}
      visibleLayerIds={new Set([layer.id])}
      assets={assets}
      kindIndex={kindIndex}
      highlightedPinIds={new Set([-1])}
      maxHeight={320}
    />
  );
}
