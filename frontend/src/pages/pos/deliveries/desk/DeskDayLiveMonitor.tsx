import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Grid,
  Link,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import type { DeliveryDayDetail, DeliveryRun, DeliveryRunStop } from '../../../../types/pos.types';
import {
  useFieldDeliveryRun,
  useFieldDeliveryRunMutations,
} from '../../../../hooks/useFieldDeliveryRun';
import {
  DISPOSITION_LABELS,
  fieldStageLabel,
  formatElapsed,
  liveElapsedSeconds,
  normalizeFieldPhase,
} from '../field/fieldRunUtils';

type Props = {
  day: DeliveryDayDetail;
};

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

export function DeskDayLiveMonitor({ day }: Props) {
  const { enqueueSnackbar } = useSnackbar();
  const isActive = day.display_state === 'active';
  const [poll, setPoll] = useState(isActive);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onVis = () => setPoll(isActive && document.visibilityState === 'visible');
    onVis();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [isActive]);

  const { data: run, isLoading, isError } = useFieldDeliveryRun(day.id, {
    enabled: Boolean(day.run) || isActive,
    poll,
  });
  const mutations = useFieldDeliveryRunMutations(day.id);

  useEffect(() => {
    if (!run || run.status === 'completed') return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [run]);

  const routed = useMemo(
    () =>
      [...(run?.stops ?? [])]
        .filter((s) => s.is_confirmed && !s.excluded_unconfirmed)
        .sort((a, b) => a.position - b.position || a.id - b.id),
    [run?.stops],
  );

  if (!day.run && !isActive) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        No active run — planning/review only.
      </Alert>
    );
  }

  if (isLoading && !run) return <Typography color="text.secondary">Loading live run…</Typography>;
  if (isError || !run) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Live run unavailable for this day.
      </Alert>
    );
  }

  const elapsed = liveElapsedSeconds(run, tick);
  const stage = normalizeFieldPhase(run.phase);
  const monitor = run.monitor;
  const summary = run.route_summary;
  const provider =
    summary?.provider_status ?? monitor?.route?.provider_status ?? 'none';

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Live monitor
        </Typography>
        <Chip
          size="small"
          color={run.status === 'completed' ? 'success' : 'warning'}
          label={run.status === 'completed' ? 'Completed' : 'Active'}
        />
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <MonitorStat label="Stage" value={fieldStageLabel(stage as never)} />
          <MonitorStat label="Timer" value={formatElapsed(elapsed)} />
          <MonitorStat
            label="Route"
            value={`${provider}${summary?.fallback_reason ? ` (${summary.fallback_reason})` : ''} · rev ${run.route_revision}`}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <MonitorStat
            label="Contact"
            value={`${monitor?.contact?.confirmed ?? 0}/${monitor?.contact?.total ?? 0} confirmed · ${monitor?.contact?.unresolved ?? 0} open`}
          />
          <MonitorStat
            label="Load"
            value={`${monitor?.load?.ready ?? 0}/${monitor?.load?.total_items ?? 0} ready · ${monitor?.load?.photographed ?? 0} photographed`}
          />
          <MonitorStat
            label="Truck"
            value={run.truck_closed ? 'Closed' : run.departure_override ? 'Override' : 'Open'}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <MonitorStat
            label="Current"
            value={monitor?.current_stop?.customer_name ?? run.next_up?.customer_name ?? '—'}
          />
          <MonitorStat label="Next" value={monitor?.next_stop?.customer_name ?? '—'} />
          <MonitorStat
            label="Pending media"
            value={String(monitor?.pending_media ?? 0)}
          />
        </Grid>
      </Grid>

      <RoutePanel
        run={run}
        routed={routed}
        busy={mutations.optimize.isPending || mutations.reorder.isPending}
        onOptimize={() =>
          void mutations.optimize
            .mutateAsync({
              runId: run.id,
              optimize: true,
              base_revision: run.route_revision,
            })
            .then(() => enqueueSnackbar('Route optimized', { variant: 'success' }))
            .catch(() => enqueueSnackbar('Optimize failed', { variant: 'error' }))
        }
      />

      {(monitor?.exceptions?.length ?? 0) > 0 && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="warning" sx={{ mb: 1 }}>
            {monitor?.exceptions?.length} exception(s)
          </Alert>
          <Stack spacing={0.5}>
            {(monitor?.exceptions ?? []).map((ex) => (
              <Typography key={ex.id} variant="body2">
                {ex.customer_name}
                {ex.hold_reason
                  ? ` — ${ex.hold_reason}`
                  : ex.contact_disposition
                    ? ` — ${ex.contact_disposition}`
                    : ` — ${ex.state}`}
              </Typography>
            ))}
          </Stack>
        </Box>
      )}

      {run.status === 'completed' && <CompletedRunReview run={run} />}

      {isActive && (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button size="small" component={RouterLink} to="/pos/deliveries/desk/total">
            Manager interventions
          </Button>
          <Button
            size="small"
            component={RouterLink}
            to={`/pos/deliveries/field/days/${day.id}`}
          >
            Open Field view
          </Button>
        </Stack>
      )}
    </Paper>
  );
}

function RoutePanel({
  run,
  routed,
  busy,
  onOptimize,
}: {
  run: DeliveryRun;
  routed: DeliveryRunStop[];
  busy: boolean;
  onOptimize: () => void;
}) {
  const summary = run.route_summary;
  return (
    <Box sx={{ mt: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          Route & ETAs
        </Typography>
        <Button size="small" variant="outlined" disabled={busy || routed.length === 0} onClick={onOptimize}>
          Optimize route
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Depart {formatEta(summary?.departure_at)} · finish {formatEta(summary?.estimated_finish_at)} ·{' '}
        {formatMinutes(summary?.total_eta_seconds)} total (
        {formatMinutes(summary?.total_drive_seconds)} drive +{' '}
        {formatMinutes(summary?.total_service_seconds)} unload) · unload assumption{' '}
        {run.service_minutes_per_stop ??
          (summary?.service_seconds_per_stop != null
            ? Math.round(summary.service_seconds_per_stop / 60)
            : '—')}{' '}
        min/stop
        {run.last_optimized_at ? ` · last calc ${formatEta(run.last_optimized_at)}` : ''}
      </Typography>
      {summary?.fallback_reason && (
        <Alert severity="info" sx={{ mb: 1 }}>
          Provider fallback: {summary.fallback_reason}
          {summary.provider ? ` (${summary.provider})` : ''}
        </Alert>
      )}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>#</TableCell>
            <TableCell>Customer</TableCell>
            <TableCell>ETA</TableCell>
            <TableCell>Drive</TableCell>
            <TableCell>Window end</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {routed.map((stop, idx) => (
            <TableRow key={stop.id}>
              <TableCell>{idx + 1}</TableCell>
              <TableCell>{stop.customer_name}</TableCell>
              <TableCell>{formatEta(stop.eta_arrive_at)}</TableCell>
              <TableCell>{formatMinutes(stop.drive_seconds_from_prev)}</TableCell>
              <TableCell>{formatEta(stop.eta_window_end_at)}</TableCell>
            </TableRow>
          ))}
          {!routed.length && (
            <TableRow>
              <TableCell colSpan={5}>
                <Typography color="text.secondary">No confirmed stops on route yet.</Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {run.maps_url && (
        <Button
          size="small"
          href={run.maps_url}
          target="_blank"
          rel="noreferrer"
          sx={{ mt: 1 }}
        >
          Open Maps
        </Button>
      )}
    </Box>
  );
}

function MonitorStat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}

function CompletedRunReview({ run }: { run: DeliveryRun }) {
  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
        Completed review
      </Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Customer</TableCell>
            <TableCell>Disposition</TableCell>
            <TableCell>Items</TableCell>
            <TableCell>Evidence</TableCell>
            <TableCell>Issues / overrides</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(run.stops ?? []).map((stop) => (
            <TableRow key={stop.id}>
              <TableCell>{stop.customer_name}</TableCell>
              <TableCell>
                {DISPOSITION_LABELS[stop.contact_disposition || ''] ||
                  stop.contact_disposition ||
                  '—'}
              </TableCell>
              <TableCell>
                {stop.items_ready_count ?? 0}/{stop.items_total_count ?? 0}
              </TableCell>
              <TableCell>
                {stop.attachments?.map((a) => (
                  <Link
                    key={a.id}
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ mr: 1 }}
                  >
                    {a.kind}
                  </Link>
                ))}
                {stop.has_signature ? (
                  <Typography variant="caption" display="block">
                    Signature on file
                  </Typography>
                ) : null}
                {(stop.call_attempts?.length ?? 0) > 0 && (
                  <Typography variant="caption" display="block">
                    {stop.call_attempts?.length} attempt(s):{' '}
                    {(stop.call_attempts ?? [])
                      .map((a) => a.action || a.channel || a.result || '—')
                      .join(', ')}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {stop.proof_override && (
                  <Typography variant="caption" display="block" color="warning.main">
                    Proof override: {stop.proof_override_reason || 'yes'}
                  </Typography>
                )}
                {(stop.return_issue_code || stop.return_issue_notes) && (
                  <Typography variant="caption" display="block" color="error.main">
                    Return: {stop.return_issue_code || 'issue'}
                    {stop.return_issue_notes ? ` — ${stop.return_issue_notes}` : ''}
                  </Typography>
                )}
                {stop.hold_reason && (
                  <Typography variant="caption" display="block">
                    Hold: {stop.hold_reason}
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {run.departure_override && (
        <Alert severity="info" sx={{ mt: 1 }}>
          Departure override: {run.departure_override_reason}
        </Alert>
      )}
    </Box>
  );
}
