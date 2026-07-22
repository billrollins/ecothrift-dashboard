import { useEffect, useState } from 'react';
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
import type { DeliveryDayDetail, DeliveryRun } from '../../../../types/pos.types';
import { useFieldDeliveryRun } from '../../../../hooks/useFieldDeliveryRun';
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

export function DeskDayLiveMonitor({ day }: Props) {
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

  useEffect(() => {
    if (!run || run.status === 'completed') return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [run]);

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
            value={`${monitor?.route?.provider_status ?? run.route_summary?.provider_status ?? 'none'} · rev ${run.route_revision}`}
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
            label="Unconfirmed"
            value={String(monitor?.unconfirmed?.length ?? monitor?.contact?.unresolved ?? 0)}
          />
        </Grid>
      </Grid>

      {(monitor?.exceptions?.length ?? 0) > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {monitor?.exceptions?.length} exception(s) — use manager tools below (not Field wizard).
        </Alert>
      )}

      {run.status === 'completed' && <CompletedRunReview run={run} />}

      {isActive && (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button size="small" component={RouterLink} to="/pos/deliveries/desk/total">
            Manager interventions
          </Button>
          <Button size="small" component={RouterLink} to="/pos/deliveries/legacy" color="inherit">
            Legacy board
          </Button>
        </Stack>
      )}
    </Paper>
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
          </TableRow>
        </TableHead>
        <TableBody>
          {(run.stops ?? []).map((stop) => (
            <TableRow key={stop.id}>
              <TableCell>{stop.customer_name}</TableCell>
              <TableCell>
                {DISPOSITION_LABELS[stop.contact_disposition || ''] || stop.contact_disposition || '—'}
              </TableCell>
              <TableCell>
                {stop.items_ready_count ?? 0}/{stop.items_total_count ?? 0}
              </TableCell>
              <TableCell>
                {stop.attachments?.map((a) => (
                  <Link key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" sx={{ mr: 1 }}>
                    {a.kind}
                  </Link>
                ))}
                {(stop.call_attempts?.length ?? 0) > 0 && (
                  <Typography variant="caption" display="block">
                    {stop.call_attempts?.length} attempt(s)
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
