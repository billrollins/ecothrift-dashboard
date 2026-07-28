import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
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
import { EcoFieldRunShell } from './EcoFieldRunShell';
import { FieldDayCompleteSummary } from './components/FieldDayCompleteSummary';
import { hasDirtyFieldState, isFieldDayToday, resolveFieldStage } from './fieldRunUtils';
import { pendingCountForRun } from '../../../../services/delivery/deliveryMediaClient';
import { DeliveryRouteMap } from '../components/DeliveryRouteMap';
import type { DeliveryDayDetail } from '../../../../types/pos.types';
import {
  ecoField,
  ecoFieldCardSx,
  ecoFieldPrimaryButtonSx,
  ecoFieldStepAccent,
} from './ecoFieldTheme';

const DAYS_ACCENT = ecoFieldStepAccent.days;

const INACTIVE_REVIEW_KEY = (dayId: number) => `field-day-inactive-review:${dayId}`;

export default function FieldDayDetailPage() {
  const { dayId } = useParams();
  const navigate = useNavigate();
  const id = Number(dayId);
  const validId = Number.isFinite(id) ? id : undefined;
  const { hasRole } = useAuth();
  const canManage = hasRole('Manager') || hasRole('Admin');
  const { data: day, isLoading, isError } = useDeliveryDay(validId);
  const dayIsToday = Boolean(day && isFieldDayToday(day.date));
  const [runRequested, setRunRequested] = useState(false);
  // Active wizard only for today. Non-today still loads run for completed review.
  const runEnabled = Boolean(
    day &&
      (day.display_state === 'completed' ||
        Boolean(day.run) ||
        (dayIsToday && (day.display_state === 'active' || runRequested))),
  );
  const { data: run, isLoading: runLoading } = useFieldDeliveryRun(validId, {
    enabled: runEnabled,
  });
  const startRun = useStartFieldDeliveryRun(validId);
  const [inactiveReview, setInactiveReview] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    if (!validId || !day) return;
    // Future/past open in inactive adjustment mode; today may opt into Not Now via session.
    if (!isFieldDayToday(day.date)) {
      setInactiveReview(true);
      return;
    }
    setInactiveReview(sessionStorage.getItem(INACTIVE_REVIEW_KEY(validId)) === '1');
  }, [validId, day?.date]);

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
    setShowSplash(true);
    window.setTimeout(() => setShowSplash(false), 1500);
  };

  if (isLoading) return <Typography color="text.secondary">Loading…</Typography>;
  if (isError || !day) return <Typography color="error">Day not found.</Typography>;

  const forceInactive = !dayIsToday || inactiveReview;
  const stage = resolveFieldStage(day, run ?? null, forceInactive);
  const isTodayPlanned =
    dayIsToday && day.display_state === 'planned' && !run && stage === 'planned';
  const showFieldApp =
    dayIsToday &&
    Boolean(run) &&
    stage !== 'planned' &&
    stage !== 'readonly';

  return (
    <Box sx={{ pb: 10 }}>
      <Button component={RouterLink} to="/pos/deliveries/field/days" size="small" sx={{ mb: 1 }}>
        ← Days
      </Button>
      <Typography variant="h6" fontWeight={700}>
        {dayIsToday ? `Today · ${day.date}` : day.date}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ my: 1 }} useFlexGap flexWrap="wrap">
        <Chip
          size="small"
          label={day.display_state === 'completed' ? 'Done' : day.display_state}
          sx={{
            fontWeight: 750,
            ...(day.display_state === 'completed'
              ? {
                  bgcolor: ecoField.tint,
                  color: ecoField.greenDeep,
                  border: `1px solid ${ecoField.green}`,
                }
              : { bgcolor: DAYS_ACCENT.tint, color: DAYS_ACCENT.accent }),
          }}
        />
        {!dayIsToday && (
          <Chip
            size="small"
            label="Review"
            sx={{ fontWeight: 700, bgcolor: ecoField.pendingSoft, color: ecoField.muted }}
          />
        )}
        {run && dayIsToday && (
          <Chip
            size="small"
            label={`Phase ${run.phase}`}
            sx={{ fontWeight: 700, bgcolor: DAYS_ACCENT.tint, color: DAYS_ACCENT.accent }}
          />
        )}
      </Stack>

      {isTodayPlanned && (
        <Card
          sx={{
            ...ecoFieldCardSx,
            mb: 2,
            bgcolor: ecoField.ink,
            color: '#fff',
            overflow: 'hidden',
            border: `1.5px solid ${DAYS_ACCENT.accent}55`,
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: ecoField.greenGlow,
                }}
              />
              <Typography
                variant="caption"
                fontWeight={800}
                sx={{ color: '#9FB4A8', letterSpacing: '.12em', textTransform: 'uppercase' }}
              >
                Today · {day.date}
              </Typography>
            </Stack>
            <Typography variant="h4" fontWeight={800} sx={{ mt: 0.5 }}>
              Start today&apos;s delivery run?
            </Typography>
            <Typography sx={{ color: '#9FB4A8', mb: 2 }}>
              {day.delivery_count} deliveries · {day.items_booked} items
            </Typography>
            <Stack spacing={1}>
              <Button
                variant="contained"
                size="large"
                disabled={startRun.isPending}
                onClick={() => void handleStartToday()}
                sx={ecoFieldPrimaryButtonSx}
              >
                Start today →
              </Button>
              <Button size="large" onClick={chooseInactiveReview} sx={{ minHeight: 44, color: '#9FB4A8' }}>
                Not Now
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      {runEnabled && runLoading && !run && (
        <Typography color="text.secondary">Loading run…</Typography>
      )}

      {showFieldApp && run && <EcoFieldRunShell day={day} run={run} canManage={canManage} />}

      {showSplash && (
        <Stack
          alignItems="center"
          justifyContent="center"
          textAlign="center"
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            bgcolor: ecoField.ink,
            color: '#fff',
            px: 3,
          }}
        >
          <Typography sx={{ color: '#9FB4A8', fontWeight: 650 }}>
            {day.date} · {day.time_start || 'Today'} – {day.time_end || 'finish'}
          </Typography>
          <Typography sx={{ fontSize: 40, lineHeight: 1.05, fontWeight: 800, mt: 1 }}>
            Here&apos;s your day.
          </Typography>
          <Stack direction="row" spacing={4} sx={{ mt: 3 }}>
            <Box><Typography sx={{ fontSize: 36, fontWeight: 800 }}>{day.delivery_count}</Typography><Typography sx={{ color: '#9FB4A8' }}>stops</Typography></Box>
            <Box><Typography sx={{ fontSize: 36, fontWeight: 800 }}>{day.items_booked}</Typography><Typography sx={{ color: '#9FB4A8' }}>items</Typography></Box>
            <Box><Typography sx={{ fontSize: 36, fontWeight: 800 }}>{day.assignments?.length || 1}</Typography><Typography sx={{ color: '#9FB4A8' }}>crew</Typography></Box>
          </Stack>
        </Stack>
      )}

      {(stage === 'readonly' || (stage === 'planned' && forceInactive)) && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            {dayIsToday
              ? 'Review mode — corrections only. Use Desk for manager edits.'
              : 'Adjustment mode — reschedule, fix details, and items. Active delivery wizard is for Today only.'}
          </Alert>
          <InactiveDayPreview day={day} />
        </>
      )}

      {stage === 'completed' && run && !dayIsToday && (
        <Stack
          sx={{
            position: 'fixed',
            inset: 0,
            zIndex: 30,
            maxWidth: 430,
            mx: 'auto',
            bgcolor: '#fff',
            color: ecoField.ink,
            overflow: 'hidden',
          }}
        >
          <FieldDayCompleteSummary
            run={run}
            onDone={() => navigate('/pos/deliveries/field/days')}
          />
        </Stack>
      )}
    </Box>
  );
}

function InactiveDayPreview({ day }: { day: DeliveryDayDetail }) {
  const jobs = day.jobs || [];
  return (
    <Box>
      <DeliveryRouteMap dayId={day.id} height={170} />
      {jobs.some((job) => job.notes) && (
        <Box sx={{ display: 'flex', gap: 1, bgcolor: ecoField.amberTint, color: ecoField.amber, borderRadius: 2, p: 1.5, mt: 1.5, fontWeight: 650 }}>
          📦 Check delivery notes before this day starts.
        </Box>
      )}
      <Stack>
        {jobs.map((job, index) => (
          <Stack
            key={job.id}
            direction="row"
            spacing={1.5}
            sx={{ py: 2, borderBottom: `1px solid ${ecoField.line}` }}
          >
            <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: ecoField.ink, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, flexShrink: 0 }}>
              {index + 1}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={800}>{job.customer_name.replace(/^\[TEST\]\s*/, '')}</Typography>
              <Typography variant="body2" color="text.secondary">
                {job.delivery_address || job.address} · {job.item_count} item{job.item_count === 1 ? '' : 's'}
              </Typography>
              <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
                <Chip size="small" label={job.status} sx={{ bgcolor: ecoField.tint, color: ecoField.greenDeep, fontWeight: 700 }} />
                {job.is_apt && <Chip size="small" label={`Apartment${job.unit ? ` · ${job.unit}` : ''}`} sx={{ bgcolor: ecoField.amberTint, color: ecoField.amber }} />}
              </Stack>
            </Box>
          </Stack>
        ))}
      </Stack>
      {jobs.length === 0 && <Typography color="text.secondary" textAlign="center" sx={{ py: 3 }}>No deliveries on this day.</Typography>}
    </Box>
  );
}

