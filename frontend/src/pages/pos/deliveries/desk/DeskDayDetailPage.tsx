import { useMemo, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import AddRounded from '@mui/icons-material/AddRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import {
  appendDeliveryJobAddress,
  rescheduleDeliveryJob,
  updateDeliveryJob,
} from '../../../../api/pos.api';
import { AddDeliveryDialog } from '../../../../components/pos/delivery/AddDeliveryDialog';
import { DeliveryDetailsModal } from '../../../../components/pos/delivery/DeliveryDetailsModal';
import {
  buildDeliveryDayCards,
  type DeliveryDayCardModel,
} from '../../../../components/pos/delivery/dayBoardUtils';
import { useAuth } from '../../../../hooks/useAuth';
import {
  useDeliveryDay,
  useDeliveryDayHistory,
  useDeliveryMutations,
} from '../../../../hooks/useDelivery';
import { useFieldDeliveryRun } from '../../../../hooks/useFieldDeliveryRun';
import { useDeliveryAvailabilities } from '../../../../hooks/usePOS';
import {
  ecoField,
  ecoFieldBucketTone,
  ecoFieldCardSx,
  ecoFieldPrimaryButtonSx,
  ecoFieldStatusChipSx,
} from '../../../../theme/deliveryTheme';
import { DeliveryHistoryPanel } from './DeliveryHistoryPanel';
import { DeskDayDialog } from './DeskDayDialog';
import { DeskDayLiveMonitor } from './DeskDayLiveMonitor';
import { DeskPlanningRow } from './DeskPlanningRow';
import { deliveryDayPath, deliveryListPath } from '../deliveryPaths';

export default function DeskDayDetailPage() {
  const { dayId } = useParams();
  const id = Number(dayId);
  const validId = Number.isFinite(id) ? id : undefined;
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { hasRole } = useAuth();
  const canManage = hasRole('Manager') || hasRole('Admin');
  const { data: day, isLoading, isError } = useDeliveryDay(validId);
  const { data: run } = useFieldDeliveryRun(validId, {
    enabled: Boolean(day),
    poll: day?.display_state === 'active',
  });
  const { data: daySlots = [] } = useDeliveryAvailabilities({ upcoming: '1' });
  const history = useDeliveryDayHistory(validId, Boolean(day));
  const { update, addItem, removeItem } = useDeliveryMutations();
  const [addOpen, setAddOpen] = useState(false);
  const [editDayOpen, setEditDayOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const bucket = ecoFieldBucketTone('days');

  const slots = useMemo(() => {
    if (!day) return daySlots;
    if (daySlots.some((s) => s.id === day.id)) return daySlots;
    return [
      {
        id: day.id,
        date: day.date,
        time_start: day.time_start || '09:00:00',
        time_end: day.time_end || '15:00:00',
        crew_size: day.crew_size,
        assigned_to: day.assigned_to || '',
        notes: day.notes || '',
        is_active: day.is_active,
        delivery_count: day.delivery_count,
        items_booked: day.items_booked,
      },
      ...daySlots,
    ];
  }, [day, daySlots]);

  const cards = useMemo(
    () => buildDeliveryDayCards(day?.jobs || [], run ?? null),
    [day?.jobs, run],
  );
  const cardByJobId = useMemo(() => {
    const map = new Map<number, DeliveryDayCardModel>();
    for (const card of cards) map.set(card.job.id, card);
    return map;
  }, [cards]);

  const selectedCard =
    selectedJobId != null
      ? cardByJobId.get(selectedJobId) ??
        (() => {
          const job = (day?.jobs || []).find((j) => j.id === selectedJobId);
          if (!job) return null;
          return buildDeliveryDayCards([job], run ?? null)[0] ?? null;
        })()
      : null;

  const refreshDay = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['delivery-day', validId] }),
      queryClient.invalidateQueries({ queryKey: ['delivery-days'] }),
      queryClient.invalidateQueries({ queryKey: ['delivery-day-run'] }),
      queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
    ]);
  };

  if (isLoading) return <Typography color="text.secondary">Loading day…</Typography>;
  if (isError || !day) return <Typography color="error">Day not found.</Typography>;

  return (
    <Box>
      <Button
        component={RouterLink}
        to={deliveryListPath('desk', 'schedule')}
        size="small"
        sx={{ mb: 1, color: ecoField.muted, fontWeight: 700 }}
      >
        ← Back to Schedule
      </Button>

      <Box
        sx={{
          ...ecoFieldCardSx,
          p: 2,
          mb: 2,
          background: bucket.headerBg,
          borderColor: `${bucket.accent}33`,
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h6" fontWeight={800} sx={{ color: ecoField.ink }}>
            {day.date}
          </Typography>
          <Chip
            size="small"
            label={day.display_state}
            sx={{ ...ecoFieldStatusChipSx(day.display_state === 'active' ? 'ok' : 'muted'), fontWeight: 750 }}
          />
          <Box sx={{ flex: 1 }} />
          {canManage && (
            <>
              <Button
                size="small"
                startIcon={<EditRounded />}
                onClick={() => setEditDayOpen(true)}
                sx={{ color: ecoField.muted, fontWeight: 700 }}
              >
                Edit day
              </Button>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddRounded />}
                onClick={() => setAddOpen(true)}
                sx={ecoFieldPrimaryButtonSx('desktop')}
              >
                Add delivery
              </Button>
            </>
          )}
        </Stack>
        <Typography variant="body2" sx={{ color: ecoField.muted, mt: 0.75, fontWeight: 600 }}>
          {day.time_start?.slice(0, 5)}-{day.time_end?.slice(0, 5)} ·{' '}
          {day.primary_driver_name || day.assigned_to || 'Unassigned'} · {day.delivery_count}{' '}
          deliveries / {day.items_booked} items
        </Typography>
      </Box>

      {day.display_state === 'planned' && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: `${ecoField.radius}px` }}>
          Inactive planning/review mode. Drivers start today from{' '}
          <Button component={RouterLink} to={deliveryDayPath('field', day.id)} size="small">
            Field day board
          </Button>
          . Managers can add and adjust deliveries below.
        </Alert>
      )}

      <DeskDayLiveMonitor day={day} />

      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1, mt: 2, color: ecoField.ink }}>
        Deliveries
      </Typography>
      {(day.jobs || []).map((job) => (
        <DeskPlanningRow key={job.id} job={job} onActivate={() => setSelectedJobId(job.id)} />
      ))}
      {(day.jobs || []).length === 0 && (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          No deliveries on this day.
        </Typography>
      )}

      <DeliveryHistoryPanel
        events={history.data}
        isLoading={history.isLoading}
        isError={history.isError}
        title="Day & delivery history"
        defaultOpen={day.display_state === 'completed'}
      />

      <DeskDayDialog
        open={editDayOpen}
        day={day}
        onClose={() => setEditDayOpen(false)}
        onSaved={() => {
          void refreshDay();
        }}
      />

      <AddDeliveryDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        daySlots={slots}
        defaultAvailabilityId={day.id}
        onCreated={() => {
          void refreshDay();
        }}
      />

      <DeliveryDetailsModal
        open={Boolean(selectedCard)}
        card={selectedCard}
        run={run ?? null}
        canManage={canManage}
        daySlots={slots}
        onClose={() => setSelectedJobId(null)}
        onSaveNotes={async (jobId, notes) => {
          await update.mutateAsync({ id: jobId, data: { notes } });
        }}
        onAppendAddress={
          canManage
            ? async (jobId, data) => {
                await appendDeliveryJobAddress(jobId, data);
                await refreshDay();
              }
            : undefined
        }
        onReschedule={
          canManage
            ? async (jobId, availabilityId, notes) => {
                await rescheduleDeliveryJob(jobId, {
                  availability_id: availabilityId,
                  notes,
                });
                await refreshDay();
                enqueueSnackbar('Rescheduled', { variant: 'success' });
              }
            : undefined
        }
        onCancel={
          canManage
            ? async (jobId) => {
                await updateDeliveryJob(jobId, { status: 'cancelled' });
                await refreshDay();
                setSelectedJobId(null);
                enqueueSnackbar('Cancelled', { variant: 'info' });
              }
            : undefined
        }
        onUpdateContact={
          canManage
            ? async (jobId, data) => {
                await update.mutateAsync({ id: jobId, data });
              }
            : undefined
        }
        onAddItem={
          canManage
            ? async (jobId, data) => {
                await addItem.mutateAsync({ id: jobId, data });
                await refreshDay();
              }
            : undefined
        }
        onRemoveItem={
          canManage
            ? async (jobId, itemId, reason) => {
                await removeItem.mutateAsync({ id: jobId, itemId, reason });
                await refreshDay();
              }
            : undefined
        }
      />
    </Box>
  );
}
