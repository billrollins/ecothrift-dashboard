import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import MapOutlined from '@mui/icons-material/MapOutlined';
import SouthRounded from '@mui/icons-material/SouthRounded';
import NorthRounded from '@mui/icons-material/NorthRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import RouteRounded from '@mui/icons-material/RouteRounded';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSnackbar } from 'notistack';
import type { DeliveryDayDetail, DeliveryRun, DeliveryRunStop } from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import { DISPOSITION_LABELS, mapsNavigateUrl } from '../fieldRunUtils';
import {
  isOnRoute,
  pendingRouteDecisionStops,
  routeInclusionTone,
  stopDisplayName,
  stopIsOnTruck,
  stopsForUiStep,
} from '../fieldStepUtils';
import { FieldDeliveryDetailsSheet } from '../components/FieldDeliveryDetailsSheet';
import { FieldStopSummaryRow } from '../components/FieldStopSummaryRow';
import { FieldStepSummaryShell } from '../components/FieldStepSummaryShell';
import { FieldSheet } from '../components/FieldSheet';
import {
  canBeginRouteFromRun,
  canReopenTruckFromRun,
  resolveStepCompletionControl,
  runAllowsAction,
} from '../fieldStepSurface';
import { finalActionThenAdvance } from '../finalActionAdvance';
import {
  ecoField,
  ecoFieldPrimaryButtonSx,
  ecoFieldSecondaryOutlineSx,
} from '../ecoFieldTheme';

const ON_ROUTE_ZONE = 'zone-on-route';
const OFF_ROUTE_ZONE = 'zone-off-route';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;

type InsertPreview = {
  proposed_position: number;
  neighbors?: {
    before?: { id: number; name: string } | null;
    after?: { id: number; name: string } | null;
  };
  added_drive_seconds?: number;
  added_service_seconds?: number;
  provisional_eta?: string | null;
  provider_status?: string;
  route_revision?: number;
};

type Props = {
  day: DeliveryDayDetail;
  run: DeliveryRun;
  mutations: Mutations;
  busy: boolean;
  canManage?: boolean;
  onContinueDeliveries: () => void;
  onGoToLoad: () => void;
};

function mutationErrorDetail(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'response' in err &&
    err.response &&
    typeof err.response === 'object' &&
    'data' in err.response &&
    err.response.data &&
    typeof err.response.data === 'object' &&
    'detail' in err.response.data
  ) {
    return String((err.response.data as { detail?: unknown }).detail || '');
  }
  return '';
}

function SortableRow({
  id,
  children,
}: {
  id: number;
  children: (dragHandleProps: Record<string, unknown>) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { container: 'on-route' },
  });
  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.9 : 1,
        zIndex: isDragging ? 5 : 'auto',
      }}
    >
      {children({ ...attributes, ...listeners })}
    </Box>
  );
}

function DraggableOffRouteRow({
  id,
  children,
}: {
  id: number;
  children: (dragHandleProps: Record<string, unknown>) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { container: 'off-route' },
  });
  return (
    <Box
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 5 : 'auto',
      }}
    >
      {children({ ...attributes, ...listeners })}
    </Box>
  );
}

function DropZone({
  id,
  children,
  label,
  onIsOverChange,
  minHeight = 40,
}: {
  id: string;
  children: ReactNode;
  label: string;
  onIsOverChange?: (isOver: boolean) => void;
  minHeight?: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  useEffect(() => {
    onIsOverChange?.(isOver);
    // Intentionally depend only on isOver — parent passes an inline callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOver]);
  return (
    <Box
      ref={setNodeRef}
      sx={{
        borderRadius: 2,
        p: 0.5,
        minHeight,
        border: '1.5px dashed',
        borderColor: isOver ? ecoField.green : 'transparent',
        bgcolor: isOver ? 'rgba(46,125,50,.08)' : 'transparent',
        transition: 'background-color 120ms ease, border-color 120ms ease',
      }}
      aria-label={label}
    >
      {children}
    </Box>
  );
}

function formatEta(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatMinutes(seconds?: number | null) {
  if (seconds == null) return '—';
  const mins = Math.max(0, Math.round(seconds / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Short form for dense row meta: 12m / 1h 5m */
function formatCompactMinutes(seconds?: number | null) {
  if (seconds == null) return null;
  const mins = Math.max(0, Math.round(seconds / 60));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatClock(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const stickySectionSx = {
  position: 'sticky' as const,
  top: 0,
  zIndex: 2,
  bgcolor: ecoField.paper,
  py: 0.5,
  color: ecoField.muted,
  letterSpacing: '.08em',
  textTransform: 'uppercase' as const,
};


function dispositionLabel(stop: DeliveryRunStop) {
  if (!stop.contact_disposition) return 'No outcome';
  return DISPOSITION_LABELS[stop.contact_disposition] || stop.contact_disposition;
}

function routeCardStatusLabel(stop: DeliveryRunStop) {
  const tone = routeInclusionTone(stop);
  if (stop.off_route || stop.excluded_unconfirmed) {
    return stop.is_confirmed ? 'Off route' : 'Not today';
  }
  if (tone === 'issue') return 'Not today';
  if (isOnRoute(stop) && !stopIsOnTruck(stop)) return 'Not on truck';
  if (tone === 'caution') return 'Needs decision';
  return dispositionLabel(stop);
}

export function RoutesStep({
  day,
  run,
  mutations,
  busy,
  canManage,
  onContinueDeliveries,
  onGoToLoad,
}: Props) {
  const { enqueueSnackbar, closeSnackbar } = useSnackbar();
  const allStops = useMemo(() => stopsForUiStep(run, 'routes'), [run]);
  const routed = useMemo(
    () => allStops.filter(isOnRoute).sort((a, b) => a.position - b.position || a.id - b.id),
    [allStops],
  );
  const offRoute = useMemo(
    () => allStops.filter((s) => !isOnRoute(s)),
    [allStops],
  );
  const pendingDecisions = useMemo(
    () => pendingRouteDecisionStops(allStops),
    [allStops],
  );
  const canBeginRoute = canBeginRouteFromRun(run);

  const [detailsStop, setDetailsStop] = useState<DeliveryRunStop | null>(null);
  const [actionStop, setActionStop] = useState<DeliveryRunStop | null>(null);
  const [outcomeStop, setOutcomeStop] = useState<DeliveryRunStop | null>(null);
  const [previewStop, setPreviewStop] = useState<DeliveryRunStop | null>(null);
  const [preview, setPreview] = useState<InsertPreview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [offRouteExpanded, setOffRouteExpanded] = useState(() => offRoute.length <= 3);
  const canEditRoute =
    runAllowsAction(run.allowed_actions, 'reorder') ||
    runAllowsAction(run.allowed_actions, 'begin_route') ||
    runAllowsAction(run.allowed_actions, 'optimize') ||
    runAllowsAction(run.allowed_actions, 'disposition') ||
    runAllowsAction(run.allowed_actions, 'exclude_unconfirmed');
  const completion = resolveStepCompletionControl({
    step: 'routes',
    run,
    workComplete: pendingDecisions.length === 0 && routed.length > 0,
    canMutate: canEditRoute,
  });

  const provider =
    run.route_summary?.provider_status ?? run.monitor?.route?.provider_status ?? 'none';
  const fallbackReason = run.route_summary?.fallback_reason ?? null;
  const lateConfirmCandidates = useMemo(
    () => offRoute.filter((s) => s.is_confirmed && (s.off_route || s.excluded_unconfirmed)),
    [offRoute],
  );

  useEffect(() => {
    if (offRoute.length <= 3) setOffRouteExpanded(true);
  }, [offRoute.length]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  const resolveContainer = (overId: string | number): 'on-route' | 'off-route' | null => {
    if (overId === ON_ROUTE_ZONE) return 'on-route';
    if (overId === OFF_ROUTE_ZONE) return 'off-route';
    const n = Number(overId);
    if (routed.some((s) => s.id === n)) return 'on-route';
    if (offRoute.some((s) => s.id === n)) return 'off-route';
    return null;
  };

  const takeOffRoute = async (stop: DeliveryRunStop) => {
    try {
      await mutations.excludeUnconfirmed.mutateAsync({
        stopId: stop.id,
        reason: 'Taken off route',
      });
      const onTruck = (stop.stop_items ?? []).filter((i) => i.is_ready || i.loaded_at).length;
      enqueueSnackbar(
        onTruck > 0
          ? `Off route — remember to unload ${onTruck} item(s) when you get back`
          : 'Moved off route',
        { variant: 'info' },
      );
    } catch {
      enqueueSnackbar('Could not move off route', { variant: 'error' });
    }
  };

  const putOnRoute = async (stop: DeliveryRunStop, position?: number) => {
    try {
      // commitInsert confirms (if needed), clears off-route exclusion, and places the stop.
      await mutations.commitInsert.mutateAsync({
        runId: run.id,
        stopId: stop.id,
        base_revision: run.route_revision,
        position,
      });
      enqueueSnackbar('Added to route', { variant: 'success' });
    } catch (err: unknown) {
      enqueueSnackbar(mutationErrorDetail(err) || 'Could not add to route', { variant: 'error' });
    }
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeId = Number(active.id);
    const activeStop =
      routed.find((s) => s.id === activeId) || offRoute.find((s) => s.id === activeId);
    if (!activeStop) return;

    const from = isOnRoute(activeStop) ? 'on-route' : 'off-route';
    const to = resolveContainer(over.id);
    if (!to) return;

    if (from === 'on-route' && to === 'off-route') {
      await takeOffRoute(activeStop);
      return;
    }

    if (from === 'off-route' && to === 'on-route') {
      const overNum = Number(over.id);
      const overIndex = routed.findIndex((s) => s.id === overNum);
      const position = overIndex >= 0 ? overIndex : routed.length;
      await putOnRoute(activeStop, position);
      return;
    }

    if (from === 'on-route' && to === 'on-route') {
      const ids = routed.map((s) => s.id);
      const oldIndex = ids.indexOf(activeId);
      const newIndex = ids.indexOf(Number(over.id));
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      const previous = ids;
      const next = arrayMove(ids, oldIndex, newIndex);
      try {
        await mutations.reorder.mutateAsync({
          runId: run.id,
          stop_ids: next,
          base_revision: run.route_revision,
        });
        enqueueSnackbar('Order updated', {
          variant: 'success',
          action: (key) => (
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                closeSnackbar(key);
                void mutations.reorder
                  .mutateAsync({
                    runId: run.id,
                    stop_ids: previous,
                  })
                  .catch(() =>
                    enqueueSnackbar('Could not undo — refresh and try again', {
                      variant: 'warning',
                    }),
                  );
              }}
            >
              Undo
            </Button>
          ),
        });
      } catch {
        enqueueSnackbar('Route changed — refresh and try again', { variant: 'warning' });
      }
    }
  };

  const openInsertPreview = async (stop: DeliveryRunStop) => {
    setActionStop(null);
    setPreviewStop(stop);
    setPreview(null);
    setPreviewBusy(true);
    try {
      const data = await mutations.previewInsert.mutateAsync({
        runId: run.id,
        stopId: stop.id,
        base_revision: run.route_revision,
      });
      setPreview(data as InsertPreview);
    } catch {
      enqueueSnackbar('Could not preview insert', { variant: 'error' });
      setPreviewStop(null);
    } finally {
      setPreviewBusy(false);
    }
  };

  const commitInsert = async () => {
    if (!previewStop) return;
    try {
      await mutations.commitInsert.mutateAsync({
        runId: run.id,
        stopId: previewStop.id,
        base_revision: run.route_revision,
        position: preview?.proposed_position,
      });
      setPreviewStop(null);
      setPreview(null);
      enqueueSnackbar('Added to route', { variant: 'success' });
    } catch (err: unknown) {
      enqueueSnackbar(
        mutationErrorDetail(err) || 'Insert failed — route may have changed',
        { variant: 'error' },
      );
    }
  };

  const loadNow = async (stop: DeliveryRunStop) => {
    setActionStop(null);
    try {
      if (canReopenTruckFromRun(run)) {
        await mutations.reopenTruck.mutateAsync({ runId: run.id });
        enqueueSnackbar('Truck reopened — load it now', { variant: 'info' });
      } else {
        enqueueSnackbar(`Go load ${stopDisplayName(stop).split(' ')[0]}`, {
          variant: 'info',
        });
      }
      onGoToLoad();
    } catch (err: unknown) {
      enqueueSnackbar(mutationErrorDetail(err) || 'Could not reopen truck', {
        variant: 'error',
      });
    }
  };

  const removeFromRoute = async (stop: DeliveryRunStop) => {
    setActionStop(null);
    await takeOffRoute(stop);
  };

  const chooseOutcome = async (value: string) => {
    if (!outcomeStop) return;
    try {
      await mutations.disposition.mutateAsync({
        stopId: outcomeStop.id,
        disposition: value,
      });
      setOutcomeStop(null);
      enqueueSnackbar('Outcome updated', { variant: 'success' });
    } catch {
      enqueueSnackbar('Could not update outcome', { variant: 'error' });
    }
  };

  const renderStopRow = (
    stop: DeliveryRunStop,
    options?: { index?: number; sortable?: boolean; offRouteDraggable?: boolean },
  ) => {
    const tone = routeInclusionTone(stop);
    const onRoute = isOnRoute(stop);
    const driveShort = formatCompactMinutes(stop.drive_seconds_from_prev);
    const titleMeta =
      options?.index != null
        ? `#${options.index + 1} · ${formatEta(stop.eta_arrive_at)}${
            driveShort ? ` · +${driveShort}` : ''
          }`
        : undefined;
    const card = (dragHandleProps?: Record<string, unknown>) => (
      <Stack direction="row" spacing={0.25} alignItems="stretch" sx={{ width: '100%' }}>
        {canEditRoute && (options?.sortable || options?.offRouteDraggable) && (
          <Box
            {...dragHandleProps}
            onClick={(event) => event.stopPropagation()}
            sx={{
              width: 26,
              minHeight: 52,
              display: 'grid',
              placeItems: 'center',
              color: ecoField.muted,
              touchAction: 'none',
              flexShrink: 0,
            }}
            aria-label={
              onRoute
                ? `Drag ${stopDisplayName(stop)}`
                : `Drag ${stopDisplayName(stop)} onto route`
            }
          >
            <DragIndicatorRounded sx={{ fontSize: 18 }} />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <FieldStopSummaryRow
            stop={stop}
            tone={tone}
            titleMeta={titleMeta}
            subtitle={stop.address}
            statusLabel={routeCardStatusLabel(stop)}
            complete={tone === 'complete'}
            onActivate={() => setActionStop(stop)}
            onStatusClick={canEditRoute ? () => setOutcomeStop(stop) : undefined}
            disabled={busy}
            density="compact"
          />
        </Box>
        {canEditRoute && (
          <IconButton
            size="small"
            disabled={busy}
            onClick={(event) => {
              event.stopPropagation();
              if (onRoute) void takeOffRoute(stop);
              else void putOnRoute(stop);
            }}
            aria-label={onRoute ? 'Take off route' : 'Add to route'}
            sx={{
              alignSelf: 'center',
              color: onRoute ? ecoField.red : ecoField.green,
              flexShrink: 0,
              width: 30,
              height: 30,
              p: 0.25,
            }}
          >
            {onRoute ? <SouthRounded sx={{ fontSize: 18 }} /> : <NorthRounded sx={{ fontSize: 18 }} />}
          </IconButton>
        )}
      </Stack>
    );

    if (options?.sortable && canEditRoute) {
      return (
        <SortableRow key={stop.id} id={stop.id}>
          {(dragHandleProps) => card(dragHandleProps)}
        </SortableRow>
      );
    }
    if (options?.offRouteDraggable && canEditRoute) {
      return (
        <DraggableOffRouteRow key={stop.id} id={stop.id}>
          {(dragHandleProps) => card(dragHandleProps)}
        </DraggableOffRouteRow>
      );
    }
    return <Box key={stop.id}>{card()}</Box>;
  };

  const summary = run.route_summary;
  const providerLabel =
    provider === 'optimized'
      ? 'Optimized route'
      : provider === 'fallback'
        ? `ETAs limited${fallbackReason ? ` — ${fallbackReason}` : ''}`
        : 'Route not calculated';
  const stripEta =
    summary?.total_eta_seconds != null || summary?.total_drive_seconds != null
      ? `${formatClock(summary?.departure_at)} → ${formatClock(summary?.estimated_finish_at)} · ${formatMinutes(summary?.total_eta_seconds ?? summary?.total_drive_seconds)}`
      : null;
  const routeHeader = (
    <Box>
      <Box
        role="button"
        tabIndex={0}
        onClick={() => setHeaderExpanded((v) => !v)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setHeaderExpanded((v) => !v);
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          cursor: 'pointer',
          minHeight: 32,
          borderRadius: 1.5,
          px: 0.25,
          '&:focus-visible': { outline: `2px solid ${ecoField.green}`, outlineOffset: 2 },
        }}
        aria-expanded={headerExpanded}
        aria-label="Toggle route details"
      >
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: provider === 'optimized' ? ecoField.green : ecoField.amber,
            flexShrink: 0,
          }}
        />
        <Typography
          variant="caption"
          fontWeight={750}
          noWrap
          sx={{ flex: 1, minWidth: 0, color: 'text.secondary' }}
        >
          {routed.length} on · {offRoute.length} off
          {stripEta ? ` · ${stripEta}` : ''}
          {provider !== 'optimized' ? ' · ETAs limited' : ''}
        </Typography>
        {pendingDecisions.length > 0 && (
          <Chip
            size="small"
            label={`${pendingDecisions.length} need decision`}
            sx={{
              height: 22,
              fontWeight: 750,
              bgcolor: ecoField.amberTint,
              color: ecoField.amber,
              flexShrink: 0,
            }}
          />
        )}
        {headerExpanded ? (
          <ExpandLessRounded sx={{ fontSize: 20, color: ecoField.muted, flexShrink: 0 }} />
        ) : (
          <ExpandMoreRounded sx={{ fontSize: 20, color: ecoField.muted, flexShrink: 0 }} />
        )}
      </Box>
      <Collapse in={headerExpanded}>
        <Box sx={{ pt: 0.75, pl: 0.25 }}>
          <Typography variant="caption" fontWeight={750} color="text.secondary" display="block">
            {providerLabel} · Rev {run.route_revision}
          </Typography>
          {summary?.total_drive_seconds != null && summary?.total_service_seconds != null && (
            <Typography variant="caption" fontWeight={700} display="block" sx={{ mt: 0.25 }}>
              {formatMinutes(summary.total_drive_seconds)} drive +{' '}
              {formatMinutes(summary.total_service_seconds)} unload
            </Typography>
          )}
          {run.service_minutes_per_stop != null && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
              Unload assumption {run.service_minutes_per_stop} min / stop
            </Typography>
          )}
          {run.last_optimized_at && (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
              Last optimized {formatClock(run.last_optimized_at)}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Box>
  );

  const offRouteHeader = (
    <Box
      onClick={() => setOffRouteExpanded((v) => !v)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        cursor: 'pointer',
        ...stickySectionSx,
        mt: 0.75,
      }}
      role="button"
      tabIndex={0}
      aria-expanded={offRouteExpanded}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setOffRouteExpanded((v) => !v);
        }
      }}
    >
      <Typography variant="caption" fontWeight={800} sx={{ flex: 1 }}>
        Off route ({offRoute.length})
      </Typography>
      {offRouteExpanded ? (
        <ExpandLessRounded sx={{ fontSize: 18 }} />
      ) : (
        <ExpandMoreRounded sx={{ fontSize: 18 }} />
      )}
    </Box>
  );

  const routeLists = (
    <Stack spacing={0.75}>
      {canEditRoute ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void onDragEnd(e)}>
          <Typography variant="caption" fontWeight={800} sx={stickySectionSx}>
            On route ({routed.length})
          </Typography>
          <DropZone id={ON_ROUTE_ZONE} label="Drop here to put on route">
            <SortableContext items={routed.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <Stack spacing={0.75}>
                {routed.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 1 }}>
                    Drag stops here · or tap ↑
                  </Typography>
                ) : (
                  routed.map((stop, index) => renderStopRow(stop, { index, sortable: true }))
                )}
              </Stack>
            </SortableContext>
          </DropZone>

          <DropZone
            id={OFF_ROUTE_ZONE}
            label="Drop here to take off route"
            minHeight={36}
            onIsOverChange={(isOver) => {
              if (isOver) setOffRouteExpanded(true);
            }}
          >
            {offRouteHeader}
            <Collapse in={offRouteExpanded}>
              <Stack spacing={0.75} sx={{ pt: 0.25 }}>
                {offRoute.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 1 }}>
                    Drag here to remove from planning · or tap ↓
                  </Typography>
                ) : (
                  offRoute.map((stop) => renderStopRow(stop, { offRouteDraggable: true }))
                )}
              </Stack>
            </Collapse>
          </DropZone>
        </DndContext>
      ) : (
        <>
          <Typography variant="caption" fontWeight={800} sx={stickySectionSx}>
            On route ({routed.length})
          </Typography>
          <Stack spacing={0.75}>
            {routed.map((stop, index) => renderStopRow(stop, { index, sortable: false }))}
          </Stack>
          {offRouteHeader}
          <Collapse in={offRouteExpanded}>
            <Stack spacing={0.75}>{offRoute.map((stop) => renderStopRow(stop))}</Stack>
          </Collapse>
        </>
      )}
    </Stack>
  );

  const startDeliveries = () => {
    if (!canBeginRouteFromRun(run)) {
      const first = pendingRouteDecisionStops(allStops)[0];
      const hint = first
        ? isOnRoute(first) && !stopIsOnTruck(first)
          ? `${stopDisplayName(first).split(' ')[0]} is confirmed but not on the truck — remove from route, or reopen the truck to load it`
          : `${pendingRouteDecisionStops(allStops).length} stop(s) still need an Add/Remove decision`
        : 'Route is not ready to start';
      enqueueSnackbar(hint, { variant: 'warning' });
      return;
    }
    void finalActionThenAdvance(
      () => mutations.beginRoute.mutateAsync(run.id),
      onContinueDeliveries,
    ).catch((err: unknown) => {
      enqueueSnackbar(mutationErrorDetail(err) || 'Could not start route', {
        variant: 'error',
      });
    });
  };

  return (
    <Stack sx={{ flex: 1, minHeight: 0 }}>
      <FieldStepSummaryShell
        header={routeHeader}
        completion={completion}
        onCompletionAction={startDeliveries}
        primaryDisabled={busy || routed.length === 0 || !canBeginRoute || pendingDecisions.length > 0}
        primaryBusy={busy}
        footerExtra={
          <Stack direction="row" spacing={0.75}>
            {canEditRoute && (
              <Button
                variant="outlined"
                disabled={busy || routed.length === 0}
                startIcon={<RouteRounded sx={{ fontSize: 18 }} />}
                onClick={() =>
                  void mutations.optimize
                    .mutateAsync({
                      runId: run.id,
                      optimize: true,
                      base_revision: run.route_revision,
                    })
                    .then(() => enqueueSnackbar('Route optimized', { variant: 'success' }))
                    .catch(() => enqueueSnackbar('Optimize failed', { variant: 'error' }))
                }
                sx={{
                  ...ecoFieldSecondaryOutlineSx,
                  flex: 1,
                  minHeight: 44,
                  px: 1,
                  fontSize: 13,
                  fontWeight: 750,
                }}
              >
                {provider === 'optimized' ? 'Re-opt' : 'Optimize'}
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<MapOutlined sx={{ fontSize: 18 }} />}
              component="a"
              href={
                run.maps_url || (routed[0] ? mapsNavigateUrl(routed[0].address) : undefined)
              }
              target="_blank"
              rel="noreferrer"
              disabled={!routed.length && !run.maps_url}
              sx={{
                ...ecoFieldSecondaryOutlineSx,
                flex: 1,
                minHeight: 44,
                px: 1,
                fontSize: 13,
                fontWeight: 750,
              }}
            >
              Maps
            </Button>
            {lateConfirmCandidates.length > 0 && canEditRoute && (
              <Button
                variant="contained"
                disabled={busy || previewBusy}
                onClick={() => void openInsertPreview(lateConfirmCandidates[0])}
                sx={{
                  ...ecoFieldPrimaryButtonSx,
                  flex: 1,
                  minHeight: 44,
                  px: 1,
                  fontSize: 13,
                }}
              >
                Add {lateConfirmCandidates.length}
              </Button>
            )}
          </Stack>
        }
      >
        {routeLists}
      </FieldStepSummaryShell>

      <FieldSheet
        open={Boolean(actionStop)}
        onClose={() => setActionStop(null)}
        eyebrow="Route decision"
        title={actionStop ? stopDisplayName(actionStop) : 'Stop'}
      >
        {actionStop && (
          <Stack spacing={1}>
            {!isOnRoute(actionStop) && canEditRoute && (
              <Button
                fullWidth
                variant="contained"
                disabled={busy || previewBusy}
                onClick={() => void openInsertPreview(actionStop)}
                sx={ecoFieldPrimaryButtonSx}
              >
                Add to Route
              </Button>
            )}
            {(isOnRoute(actionStop) || routeInclusionTone(actionStop) === 'caution') &&
              canEditRoute &&
              !stopIsOnTruck(actionStop) && (
                <Button
                  fullWidth
                  variant="contained"
                  disabled={busy}
                  onClick={() => void loadNow(actionStop)}
                  sx={ecoFieldPrimaryButtonSx}
                >
                  Load Now
                </Button>
              )}
            {(isOnRoute(actionStop) || routeInclusionTone(actionStop) === 'caution') &&
              canEditRoute && (
              <Button
                fullWidth
                variant="outlined"
                disabled={busy}
                onClick={() => void removeFromRoute(actionStop)}
                sx={{ minHeight: 52, borderRadius: 2, fontWeight: 750, color: ecoField.red, borderColor: ecoField.red }}
              >
                {isOnRoute(actionStop) ? 'Remove from Route' : 'Not today'}
              </Button>
            )}
            {canEditRoute && (
              <Button
                fullWidth
                variant="outlined"
                disabled={busy}
                onClick={() => {
                  setOutcomeStop(actionStop);
                  setActionStop(null);
                }}
                sx={{ minHeight: 52, borderRadius: 2, fontWeight: 750 }}
              >
                Change Outcome
              </Button>
            )}
            <Button
              fullWidth
              variant="outlined"
              onClick={() => {
                setDetailsStop(actionStop);
                setActionStop(null);
              }}
              sx={{ minHeight: 52, borderRadius: 2, fontWeight: 750 }}
            >
              View details
            </Button>
          </Stack>
        )}
      </FieldSheet>

      <FieldSheet
        open={Boolean(outcomeStop)}
        onClose={() => setOutcomeStop(null)}
        eyebrow="Contact outcome"
        title={
          outcomeStop
            ? `Update ${stopDisplayName(outcomeStop).split(' ')[0]}`
            : 'Update outcome'
        }
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          {(run.contact_dispositions ?? []).map((option) => (
            <Button
              key={option.value}
              variant={outcomeStop?.contact_disposition === option.value ? 'contained' : 'outlined'}
              onClick={() => void chooseOutcome(option.value)}
              sx={{
                minHeight: 56,
                borderRadius: 2,
                fontWeight: 750,
                ...(outcomeStop?.contact_disposition === option.value
                  ? ecoFieldPrimaryButtonSx
                  : {}),
              }}
            >
              {option.label}
            </Button>
          ))}
        </Box>
      </FieldSheet>

      <FieldSheet
        open={Boolean(previewStop)}
        onClose={() => {
          setPreviewStop(null);
          setPreview(null);
        }}
        eyebrow="Add to route"
        title={previewStop ? `Insert ${stopDisplayName(previewStop)}` : 'Insert stop'}
      >
        {previewBusy && <Typography color="text.secondary">Calculating insertion…</Typography>}
        {preview && (
          <Stack spacing={1.25}>
            <Typography fontWeight={700}>
              Position #{(preview.proposed_position ?? 0) + 1}
              {preview.neighbors?.before
                ? ` after ${preview.neighbors.before.name}`
                : ' at start'}
              {preview.neighbors?.after ? `, before ${preview.neighbors.after.name}` : ''}
            </Typography>
            <Typography fontWeight={700}>
              +{formatMinutes(preview.added_drive_seconds)} drive · +
              {formatMinutes(preview.added_service_seconds)} service
            </Typography>
            <Typography color="text.secondary">
              ETA {formatEta(preview.provisional_eta)} · rev{' '}
              {preview.route_revision ?? run.route_revision}
            </Typography>
            <Button
              fullWidth
              variant="contained"
              disabled={busy}
              onClick={() => void commitInsert()}
              sx={ecoFieldPrimaryButtonSx}
            >
              Confirm insert
            </Button>
          </Stack>
        )}
      </FieldSheet>

      <FieldDeliveryDetailsSheet
        open={Boolean(detailsStop)}
        onClose={() => setDetailsStop(null)}
        day={day}
        stop={detailsStop}
        canManage={canManage}
      />
    </Stack>
  );
}
