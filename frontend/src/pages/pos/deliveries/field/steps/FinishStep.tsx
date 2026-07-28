import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import type { DeliveryDayDetail, DeliveryRun } from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import {
  clampSelectedStopId,
  defaultSelectedStopId,
  finishStopTone,
  stopDisplayName,
  stopIsOnTruck,
  stopsForUiStep,
} from '../fieldStepUtils';
import { FieldDeliveryPager } from '../components/FieldDeliveryPager';
import { FieldDeliveryCardFrame } from '../components/FieldDeliveryCardFrame';
import { FieldDeliveryDetailsSheet } from '../components/FieldDeliveryDetailsSheet';
import { FieldDayCompleteSummary } from '../components/FieldDayCompleteSummary';
import { FieldStopSummaryRow } from '../components/FieldStopSummaryRow';
import { FieldStepSummaryShell } from '../components/FieldStepSummaryShell';
import { FieldSheet } from '../components/FieldSheet';
import { resolveStepCompletionControl } from '../fieldStepSurface';
import { ecoField, ecoFieldCardSx, ecoFieldPrimaryButtonSx, ecoFieldSecondaryOutlineSx } from '../ecoFieldTheme';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;

type Props = {
  day: DeliveryDayDetail;
  run: DeliveryRun;
  mutations: Mutations;
  busy: boolean;
  canManage?: boolean;
};

export function FinishStep({ day, run, mutations, busy, canManage }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const exceptions = useMemo(() => stopsForUiStep(run, 'finish'), [run]);
  const unloadReminders = useMemo(() => {
    return (run.stops ?? [])
      .filter((s) => (s.off_route || s.excluded_unconfirmed) && !exceptions.some((e) => e.id === s.id))
      .map((s) => {
        const items = s.stop_items ?? [];
        const count = items.filter((i) => i.is_ready || i.loaded_at).length;
        if (!count && !stopIsOnTruck(s)) return null;
        return {
          id: s.id,
          name: stopDisplayName(s).split(' ')[0],
          count: count || s.items_ready_count || s.item_count || 1,
        };
      })
      .filter((x): x is { id: number; name: string; count: number } => Boolean(x));
  }, [run.stops, exceptions]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setSelectedId((prev) =>
      clampSelectedStopId(exceptions, prev, defaultSelectedStopId(run, 'finish')),
    );
  }, [exceptions, run]);

  useEffect(() => {
    if (!exceptions.length) setEditing(false);
  }, [exceptions.length]);

  const stop = exceptions.find((s) => s.id === selectedId) ?? null;
  const completion = resolveStepCompletionControl({
    step: 'finish',
    run,
    workComplete: !exceptions.length,
    editing,
  });

  if (run.status === 'completed') {
    return (
      <FieldDayCompleteSummary
        run={run}
        onDone={() => navigate('/pos/deliveries/field/days')}
      />
    );
  }

  // Prefer Deliveries summary for returnToStore; keep a compact gate if user jumped here early.
  if (!run.returned_to_store_at) {
    return (
      <FieldStepSummaryShell
        header="Return & reconcile"
        completion={completion}
        onCompletionAction={() =>
          void mutations.returnToStore
            .mutateAsync(run.id)
            .catch(() => enqueueSnackbar('Could not mark returned', { variant: 'error' }))
        }
        primaryDisabled={busy}
        primaryBusy={busy}
      >
        <Box sx={{ ...ecoFieldCardSx, p: 2.5 }}>
          <Typography fontWeight={750}>Confirm you’re back before reconciling.</Typography>
        </Box>
      </FieldStepSummaryShell>
    );
  }

  const unloadReminderBanner =
    unloadReminders.length > 0 ? (
      <Box
        sx={{
          ...ecoFieldCardSx,
          p: 1.5,
          bgcolor: ecoField.amberTint,
          border: '1px solid',
          borderColor: 'rgba(180,120,20,.35)',
        }}
      >
        <Typography variant="body2" fontWeight={800} sx={{ mb: 0.5 }}>
          Remember to unload when you get back
        </Typography>
        {unloadReminders.map((r) => (
          <Typography key={r.id} variant="body2" fontWeight={700}>
            {r.name}: {r.count} item{r.count === 1 ? '' : 's'} still on the truck (off route)
          </Typography>
        ))}
      </Box>
    ) : null;

  if (!exceptions.length) {
    return (
      <FieldStepSummaryShell
        header="Everything reconciled"
        completion={completion}
        onCompletionAction={() =>
          void mutations.finish
            .mutateAsync({ runId: run.id })
            .catch(() => enqueueSnackbar('Could not end day', { variant: 'error' }))
        }
        primaryDisabled={busy || !run.can_finish}
        primaryBusy={busy}
      >
        <Stack spacing={1.25}>
          {unloadReminderBanner}
          <Box sx={{ ...ecoFieldCardSx, p: 3, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 42, color: ecoField.greenDeep }}>✓</Typography>
            <Typography variant="h6" fontWeight={800}>
              Ready to close
            </Typography>
          </Box>
        </Stack>
      </FieldStepSummaryShell>
    );
  }

  if (!editing) {
    return (
      <FieldStepSummaryShell
        header={`${exceptions.length} to reconcile`}
        footerExtra={
          canManage ? (
            <Button
              fullWidth
              variant="outlined"
              disabled={busy || !run.returned_to_store_at}
              onClick={() => {
                const reason = window.prompt(
                  'Force-finish reason (required). Unreconciled returns will remain on the record.',
                );
                if (!reason?.trim()) return;
                void mutations.finish
                  .mutateAsync({ runId: run.id, force: true, reason: reason.trim() })
                  .catch((err: unknown) => {
                    let detail = 'Force finish failed';
                    if (
                      err &&
                      typeof err === 'object' &&
                      'response' in err &&
                      (err as { response?: { data?: { detail?: unknown } } }).response?.data
                        ?.detail != null
                    ) {
                      const raw = (err as { response?: { data?: { detail?: unknown } } }).response
                        ?.data?.detail;
                      if (typeof raw === 'string' && raw.trim()) detail = raw;
                    }
                    enqueueSnackbar(detail, { variant: 'error' });
                  });
              }}
              sx={{
                ...ecoFieldSecondaryOutlineSx,
                minHeight: 48,
                color: ecoField.red,
                borderColor: ecoField.red,
              }}
            >
              Manager force finish
            </Button>
          ) : undefined
        }
      >
        <Stack spacing={1}>
          {unloadReminderBanner}
          {exceptions.map((s) => {
            const tone = finishStopTone(s);
            return (
              <FieldStopSummaryRow
                key={s.id}
                stop={s}
                tone={tone}
                subtitle={s.hold_reason || s.contact_disposition || s.address}
                statusLabel="Needs reconcile"
                complete={false}
                onActivate={() => {
                  setSelectedId(s.id);
                  setEditing(true);
                }}
                disabled={busy}
              />
            );
          })}
        </Stack>
      </FieldStepSummaryShell>
    );
  }

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <FieldDeliveryPager
        stops={exceptions}
        selectedId={selectedId}
        toneFor={finishStopTone}
        onSelect={setSelectedId}
        disabled={busy}
      >
        {stop && (
          <FieldDeliveryCardFrame
            stop={stop}
            statusLabel={stop.hold_reason || stop.contact_disposition || 'Needs reconcile'}
            statusTone={finishStopTone(stop) === 'complete' ? 'ok' : 'bad'}
            onOpenDetails={() => setDetailsOpen(true)}
            onOpenItems={() => setItemsOpen(true)}
          >
            <Button
              fullWidth
              variant="contained"
              disabled={busy}
              onClick={() =>
                void mutations.returnReconcile.mutateAsync({
                  stopId: stop.id,
                  unloaded: true,
                  items_stored: true,
                  reconcile: true,
                })
              }
              sx={ecoFieldPrimaryButtonSx}
            >
              Mark unloaded & stored
            </Button>
          </FieldDeliveryCardFrame>
        )}
      </FieldDeliveryPager>

      <Box sx={{ px: 2, pb: 1 }}>
        <Button
          fullWidth
          variant="outlined"
          onClick={() => setEditing(false)}
          sx={{ ...ecoFieldSecondaryOutlineSx, minHeight: 48 }}
        >
          Done editing
        </Button>
      </Box>

      <FieldSheet open={itemsOpen} onClose={() => setItemsOpen(false)} title="Items">
        <Stack spacing={1}>
          {(stop?.stop_items ?? stop?.line_items ?? []).map((item, idx) => (
            <Typography key={`${'id' in item ? item.id : idx}-${item.description}`} fontWeight={700}>
              ×{item.quantity} {item.description}
            </Typography>
          ))}
        </Stack>
      </FieldSheet>

      <FieldDeliveryDetailsSheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        day={day}
        stop={stop}
        canManage={canManage}
      />
    </Stack>
  );
}
