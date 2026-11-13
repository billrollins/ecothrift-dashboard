import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { getFloorPlan, getMapPins, getStoreMap } from '../../api/floorplan.api';
import { getFloorPlanAssets } from '../../api/floorplanAssets.api';
import { useCurrentPreview, useMakeFloorPlanCurrent, useUnsetFloorPlanCurrent } from '../../hooks/useFloorplans';
import { useFloorPlanElementKinds } from '../../hooks/useFloorplanElementKinds';
import type { FloorPlanListItem, PinTransform, PlanDocument } from '../../types/floorplan.types';
import AlignPinsStep from './AlignPinsStep';
import { migratePlanDocument } from './migrations';
import { buildPaletteIndex, elementKindToPaletteEntry, STATIC_PALETTE } from './palette';
import { IDENTITY, suggestTransform } from './pinTransform';

interface CurrentPlanDialogProps {
  /** The plan whose star was clicked; null = closed. A Current plan opens Unset, any other opens Make current. */
  plan: FloorPlanListItem | null;
  onClose: () => void;
}

function docOf(data: PlanDocument): PlanDocument | null {
  try {
    return migratePlanDocument(data);
  } catch {
    return null;
  }
}

const pins = (n: number) => (n === 1 ? '1 pin' : `${n} pins`);

/**
 * The owner's Make current / Unset current (#130, Bill 2026-11-13: "full control when marking or unmarking a
 * floorplan as the current"). Make current keeps the old plan as a past version with its pins and copies the pins
 * onto this plan; when the sizes differ the owner lines them up first (AlignPinsStep). Both answer with what they did.
 */
export default function CurrentPlanDialog({ plan, onClose }: CurrentPlanDialogProps) {
  const { enqueueSnackbar } = useSnackbar();
  const unsetting = Boolean(plan?.is_current);
  const previewQuery = useCurrentPreview(plan && !unsetting ? plan.id : null);
  const preview = previewQuery.data;
  const needsAlign = Boolean(preview?.needs_align && preview.source);

  // The two drawings and the old pins, only for the alignment step.
  const sourceId = needsAlign ? preview!.source!.id : null;
  const alignQuery = useQuery({
    queryKey: ['floorplan-align', plan?.id ?? null, sourceId],
    enabled: Boolean(plan) && sourceId != null,
    queryFn: async () => {
      const [target, source, sourcePins, map, assets] = await Promise.all([
        getFloorPlan(plan!.id),
        getFloorPlan(sourceId!),
        getMapPins({ plan: sourceId! }),
        getStoreMap(),
        getFloorPlanAssets({ page_size: 200 }),
      ]);
      return {
        target: target.data, source: source.data, pins: sourcePins.data, layers: map.data.layers,
        assets: new Map(assets.data.results.map((a) => [a.id, a.data])),
      };
    },
  });
  const targetDoc = useMemo(() => (alignQuery.data ? docOf(alignQuery.data.target.data) : null), [alignQuery.data]);
  const sourceDoc = useMemo(() => (alignQuery.data ? docOf(alignQuery.data.source.data) : null), [alignQuery.data]);
  const kindsQuery = useFloorPlanElementKinds();
  const kindIndex = useMemo(
    () => buildPaletteIndex(kindsQuery.data ? kindsQuery.data.map(elementKindToPaletteEntry) : STATIC_PALETTE),
    [kindsQuery.data],
  );

  const [transform, setTransform] = useState<PinTransform>(IDENTITY);
  useEffect(() => {
    if (preview?.needs_align && preview.source) {
      setTransform(suggestTransform(
        { width: preview.source.width, height: preview.source.height },
        { width: preview.width, height: preview.height },
      ));
    } else {
      setTransform(IDENTITY);
    }
  }, [preview]);

  const make = useMakeFloorPlanCurrent();
  const unset = useUnsetFloorPlanCurrent();
  const busy = make.isPending || unset.isPending;

  const done = (result: { changed: boolean; message: string }) => {
    enqueueSnackbar(result.message, { variant: result.changed ? 'success' : 'info', autoHideDuration: 10_000 });
    onClose();
  };
  const failed = (err: unknown) => {
    const data = (err as { response?: { data?: { detail?: string; code?: string } } })?.response?.data;
    if (data?.code === 'align_required') void previewQuery.refetch();
    enqueueSnackbar(data?.detail ?? 'That did not work. Nothing changed.', { variant: 'error' });
  };

  const confirm = () => {
    if (!plan) return;
    if (unsetting) unset.mutate(plan.id, { onSuccess: done, onError: failed });
    else make.mutate({ id: plan.id, transform: needsAlign ? transform : undefined }, { onSuccess: done, onError: failed });
  };

  const source = preview?.source ?? null;
  const ready = unsetting || (preview && (!needsAlign || (targetDoc && sourceDoc)));

  return (
    <Dialog open={Boolean(plan)} onClose={busy ? undefined : onClose} fullWidth maxWidth={needsAlign ? 'lg' : 'sm'}>
      <DialogTitle>
        {unsetting ? `Unset “${plan?.name}” as the Current plan?` : `Make “${plan?.name}” the Current plan?`}
      </DialogTitle>
      <DialogContent>
        {unsetting && (
          <DialogContentText>
            Facilities → Store map shows no plan until you make one Current. “{plan?.name}” keeps its{' '}
            {pins(plan?.pin_count ?? 0)} as a past version; the next plan you make Current gets a copy of them.
          </DialogContentText>
        )}
        {!unsetting && previewQuery.isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
        )}
        {!unsetting && previewQuery.isError && <Alert severity="error">Could not check this plan. Close and try again.</Alert>}
        {!unsetting && preview && (
          <>
            <DialogContentText sx={{ mb: needsAlign ? 2 : 0 }}>
              Facilities → Store map will show this plan with its layers of pins.{' '}
              {source && source.is_current && `“${source.name}” stops being Current and is kept as a past version with its pins. `}
              {preview.own_pins > 0 && `This plan keeps its own ${pins(preview.own_pins)} (from when it was Current).`}
              {preview.copies_pins && !needsAlign && source && `The ${pins(source.pins)} on “${source.name}” are copied onto it at the same spots (same size).`}
              {preview.copies_pins && needsAlign && source && `The ${pins(source.pins)} on “${source.name}” are copied onto it once you line them up below.`}
              {!source && 'No plan was Current before, so no pins come along.'}
              {source && !preview.copies_pins && preview.own_pins === 0 && `“${source.name}” has no pins to copy.`}
            </DialogContentText>
            {needsAlign && !(targetDoc && sourceDoc) && (
              alignQuery.isError
                ? <Alert severity="error">Could not load the two plans to line them up.</Alert>
                : <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={28} /></Box>
            )}
            {needsAlign && targetDoc && sourceDoc && alignQuery.data && source && (
              <AlignPinsStep
                target={targetDoc}
                source={sourceDoc}
                sourceName={source.name}
                pins={alignQuery.data.pins}
                layers={alignQuery.data.layers}
                value={transform}
                onChange={setTransform}
                assets={alignQuery.data.assets}
                kindIndex={kindIndex}
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color={unsetting ? 'warning' : 'primary'} onClick={confirm} disabled={busy || !ready}>
          {unsetting ? 'Unset current' : needsAlign ? 'Copy the pins and make Current' : 'Make Current'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
