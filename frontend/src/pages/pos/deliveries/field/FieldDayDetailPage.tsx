import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { useAuth } from '../../../../hooks/useAuth';
import { useDeliveryDay } from '../../../../hooks/useDelivery';
import {
  useFieldDeliveryRun,
  useStartFieldDeliveryRun,
} from '../../../../hooks/useFieldDeliveryRun';
import { FieldRunShell } from './FieldRunShell';
import { hasDirtyFieldState, resolveFieldStage } from './fieldRunUtils';
import { pendingCountForRun } from '../../../../services/delivery/deliveryMediaClient';
import type { DeliveryJob, DeliveryRun } from '../../../../types/pos.types';

const INACTIVE_REVIEW_KEY = (dayId: number) => `field-day-inactive-review:${dayId}`;

export default function FieldDayDetailPage() {
  const { dayId } = useParams();
  const id = Number(dayId);
  const validId = Number.isFinite(id) ? id : undefined;
  const { hasRole } = useAuth();
  const canManage = hasRole('Manager') || hasRole('Admin');
  const { data: day, isLoading, isError } = useDeliveryDay(validId);
  const [runRequested, setRunRequested] = useState(false);
  const runEnabled = Boolean(
    day && (day.display_state === 'active' || Boolean(day.run) || runRequested),
  );
  const { data: run, isLoading: runLoading } = useFieldDeliveryRun(validId, {
    enabled: runEnabled,
  });
  const startRun = useStartFieldDeliveryRun(validId);
  const [inactiveReview, setInactiveReview] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);

  useEffect(() => {
    if (!validId) return;
    setInactiveReview(sessionStorage.getItem(INACTIVE_REVIEW_KEY(validId)) === '1');
  }, [validId]);

  useEffect(() => {
    if (!run) return;
    void pendingCountForRun(run.id).then(setPendingUploads);
  }, [run]);

  const dirty = hasDirtyFieldState({ pendingUploads, draftNote: '', draftSku: '' });

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const chooseInactiveReview = useCallback(() => {
    if (!validId) return;
    sessionStorage.setItem(INACTIVE_REVIEW_KEY(validId), '1');
    setInactiveReview(true);
  }, [validId]);

  const handleStartToday = async () => {
    if (!validId) return;
    sessionStorage.removeItem(INACTIVE_REVIEW_KEY(validId));
    setInactiveReview(false);
    setRunRequested(true);
    await startRun.mutateAsync();
  };

  if (isLoading) return <Typography color="text.secondary">Loading…</Typography>;
  if (isError || !day) return <Typography color="error">Day not found.</Typography>;

  const stage = resolveFieldStage(day, run ?? null, inactiveReview);
  const isTodayPlanned = day.display_state === 'planned' && !run && stage === 'planned';

  return (
    <Box sx={{ pb: 10 }}>
      <Button component={RouterLink} to="/pos/deliveries/field/days" size="small" sx={{ mb: 1 }}>
        ← Days
      </Button>
      <Typography variant="h6" fontWeight={700}>
        {day.date}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ my: 1 }} useFlexGap flexWrap="wrap">
        <Chip size="small" label={day.display_state} />
        {day.is_test && <Chip size="small" color="warning" label="TEST" />}
        {run && <Chip size="small" color="primary" label={`Phase ${run.phase}`} />}
      </Stack>

      {isTodayPlanned && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography fontWeight={700} sx={{ mb: 1 }}>
              Start today&apos;s delivery run?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {day.delivery_count} deliveries · {day.items_booked} items
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="contained"
                size="large"
                disabled={startRun.isPending}
                onClick={() => void handleStartToday()}
                sx={{ minHeight: 48 }}
              >
                Start Today
              </Button>
              <Button variant="outlined" size="large" onClick={chooseInactiveReview} sx={{ minHeight: 48 }}>
                Not Now
              </Button>
            </Stack>
            <Button
              component={RouterLink}
              to="/pos/deliveries/legacy"
              size="small"
              color="inherit"
              sx={{ mt: 2 }}
            >
              Legacy board (deprecated)
            </Button>
          </CardContent>
        </Card>
      )}

      {runEnabled && runLoading && !run && (
        <Typography color="text.secondary">Loading run…</Typography>
      )}

      {run && stage !== 'planned' && stage !== 'readonly' && stage !== 'completed' && (
        <FieldRunShell day={day} run={run} canManage={canManage} />
      )}

      {(stage === 'readonly' || (stage === 'planned' && inactiveReview)) && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            Review mode — corrections only. Use Desk for manager edits.
          </Alert>
          <JobList jobs={day.jobs || []} />
        </>
      )}

      {stage === 'completed' && run && (
        <>
          <Alert severity="success" sx={{ mb: 2 }}>
            Day completed · run #{run.id}
          </Alert>
          <CompletedReview run={run} />
        </>
      )}
    </Box>
  );
}

function JobList({ jobs }: { jobs: DeliveryJob[] }) {
  return (
    <Stack spacing={1}>
      {(jobs || []).map((job) => (
        <Card key={job.id} variant="outlined">
          <CardContent sx={{ py: 1.5 }}>
            <Typography fontWeight={700}>{job.customer_name}</Typography>
            <Typography variant="body2">{job.phone}</Typography>
            <Typography variant="body2" color="text.secondary">
              {job.delivery_address || job.address}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {job.item_count} items · {job.status}
            </Typography>
          </CardContent>
        </Card>
      ))}
      {(jobs || []).length === 0 && (
        <Typography color="text.secondary">No deliveries on this day.</Typography>
      )}
    </Stack>
  );
}

function CompletedReview({ run }: { run: DeliveryRun }) {
  return (
    <Stack spacing={1}>
      {(run.stops ?? []).map((stop) => (
        <Card key={stop.id} variant="outlined">
          <CardContent sx={{ py: 1.5 }}>
            <Typography fontWeight={700}>{stop.customer_name}</Typography>
            <Typography variant="body2">
              {stop.contact_disposition || stop.latest_call_result || '—'} · {stop.state}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {stop.call_attempts?.length ?? 0} contact attempt(s) · {stop.items_ready_count ?? 0}/
              {stop.items_total_count ?? 0} items ready
            </Typography>
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}
