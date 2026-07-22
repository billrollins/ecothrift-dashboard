import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Stack } from '@mui/material';
import { useSnackbar } from 'notistack';
import type { DeliveryDayDetail, DeliveryRun } from '../../../../types/pos.types';
import {
  useFieldDeliveryRunMutations,
} from '../../../../hooks/useFieldDeliveryRun';
import { FieldBottomShortcuts } from './FieldBottomShortcuts';
import { FieldStageHeader } from './FieldStageHeader';
import {
  fieldPrimaryAction,
  normalizeFieldPhase,
  resolveFieldStage,
  type FieldStage,
} from './fieldRunUtils';
import { useFieldPhotoUpload } from './useFieldPhotoUpload';
import { FieldContactStage } from './stages/FieldContactStage';
import { FieldLoadStage } from './stages/FieldLoadStage';
import { FieldTruckCloseStage } from './stages/FieldTruckCloseStage';
import { FieldRouteReviewStage } from './stages/FieldRouteReviewStage';
import { FieldDriveDeliverStage } from './stages/FieldDriveDeliverStage';
import { FieldReturnEndDayStage } from './stages/FieldReturnEndDayStage';

type Props = {
  day: DeliveryDayDetail;
  run: DeliveryRun;
  canManage?: boolean;
};

export function FieldRunShell({ day, run, canManage }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const mutations = useFieldDeliveryRunMutations(day.id);
  const photo = useFieldPhotoUpload(run, mutations);
  const [tick, setTick] = useState(0);
  const topRef = useRef<HTMLDivElement | null>(null);
  const stage = resolveFieldStage(day, run, false) as Exclude<FieldStage, 'planned' | 'readonly'>;
  const busy =
    mutations.contactAttempt.isPending ||
    mutations.disposition.isPending ||
    mutations.scanItem.isPending ||
    mutations.closeTruck.isPending ||
    mutations.beginRoute.isPending ||
    mutations.finish.isPending;

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const scrollTop = useCallback(() => {
    topRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const goRouteStage = useCallback(async () => {
    if (normalizeFieldPhase(run.phase) !== 'route') {
      await mutations.setPhase.mutateAsync({ runId: run.id, phase: 'route' });
    }
    scrollTop();
  }, [mutations.setPhase, run.id, run.phase, scrollTop]);

  const primary = fieldPrimaryAction(run);

  const handlePrimary = async () => {
    if (!primary) return;
    try {
      switch (primary.action) {
        case 'set_phase:load':
          await mutations.setPhase.mutateAsync({ runId: run.id, phase: 'load' });
          break;
        case 'set_phase:truck':
          await mutations.setPhase.mutateAsync({ runId: run.id, phase: 'truck' });
          break;
        case 'set_phase:route':
          await mutations.setPhase.mutateAsync({ runId: run.id, phase: 'route' });
          break;
        case 'upload_truck_photo':
          photo.pickPhoto('truck');
          break;
        case 'close_truck':
          await mutations.closeTruck.mutateAsync(run.id);
          break;
        case 'begin_route':
          await mutations.beginRoute.mutateAsync(run.id);
          break;
        case 'return_store':
          await mutations.returnToStore.mutateAsync(run.id);
          break;
        case 'finish':
          await mutations.finish.mutateAsync({ runId: run.id });
          break;
        default:
          scrollTop();
      }
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      enqueueSnackbar(detail || 'Action failed', { variant: 'error' });
    }
  };

  const renderStage = () => {
    const phase = normalizeFieldPhase(run.phase);
    if (phase === 'calls') {
      return <FieldContactStage run={run} mutations={mutations} busy={busy} />;
    }
    if (phase === 'load') {
      return <FieldLoadStage run={run} mutations={mutations} photo={photo} busy={busy} />;
    }
    if (phase === 'truck') {
      return (
        <FieldTruckCloseStage
          run={run}
          mutations={mutations}
          photo={photo}
          busy={busy}
          canOverride={Boolean(canManage)}
        />
      );
    }
    if (phase === 'route') {
      return <FieldRouteReviewStage run={run} mutations={mutations} busy={busy} />;
    }
    if (phase === 'active') {
      return <FieldDriveDeliverStage run={run} mutations={mutations} photo={photo} busy={busy} />;
    }
    if (phase === 'return') {
      return (
        <FieldReturnEndDayStage
          run={run}
          mutations={mutations}
          busy={busy}
          canForceFinish={Boolean(canManage)}
        />
      );
    }
    return null;
  };

  return (
    <Box ref={topRef}>
      <input
        ref={photo.fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void photo.onFilePicked(e.target.files?.[0] ?? null)}
      />
      <FieldStageHeader run={run} stage={stage} tick={tick} />
      {renderStage()}
      {primary && (
        <Stack
          sx={{
            position: 'fixed',
            bottom: 56,
            left: 0,
            right: 0,
            px: 2,
            pb: 'calc(8px + env(safe-area-inset-bottom))',
            zIndex: 11,
          }}
        >
          <Button
            variant="contained"
            size="large"
            disabled={busy || primary.disabled}
            onClick={() => void handlePrimary()}
            sx={{ minHeight: 52 }}
          >
            {primary.label}
          </Button>
        </Stack>
      )}
      <FieldBottomShortcuts run={run} onScrollTop={scrollTop} onOpenRoute={() => void goRouteStage()} />
    </Box>
  );
}
