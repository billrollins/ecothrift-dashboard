import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import MapOutlined from '@mui/icons-material/MapOutlined';
import type { DeliveryRun } from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import { confirmedStops, unconfirmedStops } from '../fieldRunUtils';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;

type Props = {
  run: DeliveryRun;
  mutations: Mutations;
  busy: boolean;
};

export function FieldRouteReviewStage({ run, mutations, busy }: Props) {
  const confirmed = confirmedStops(run);
  const unconfirmed = unconfirmedStops(run);
  const provider = run.route_summary?.provider_status ?? run.monitor?.route?.provider_status ?? 'none';

  return (
    <Box sx={{ p: 2, pb: 12 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h6" fontWeight={700}>
          Route review
        </Typography>
        <Chip
          size="small"
          label={provider === 'optimized' ? 'Optimized' : provider === 'fallback' ? 'Fallback order' : 'Not optimized'}
          color={provider === 'optimized' ? 'success' : 'default'}
        />
        <Chip size="small" variant="outlined" label={`Rev ${run.route_revision}`} />
      </Stack>

      {provider !== 'optimized' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Route uses {provider === 'fallback' ? 'manual/fallback' : 'planning'} order — ETAs may be limited.
        </Alert>
      )}

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Confirmed route ({confirmed.length})
      </Typography>
      <List dense sx={{ mb: 2 }}>
        {confirmed.map((stop, i) => (
          <ListItem key={stop.id} divider>
            <ListItemText
              primary={`${i + 1}. ${stop.customer_name}`}
              secondary={stop.address}
            />
          </ListItem>
        ))}
      </List>

      {unconfirmed.length > 0 && (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Unconfirmed pool ({unconfirmed.length})
          </Typography>
          <List dense sx={{ mb: 2 }}>
            {unconfirmed.map((stop) => (
              <ListItem key={stop.id} divider>
                <ListItemText
                  primary={stop.customer_name}
                  secondary={stop.excluded_unconfirmed ? 'Excluded from route' : stop.contact_disposition || 'Pending'}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}

      <Stack spacing={1}>
        <Button
          variant="outlined"
          disabled={busy || confirmed.length === 0}
          onClick={() =>
            void mutations.optimize.mutateAsync({
              runId: run.id,
              optimize: true,
              base_revision: run.route_revision,
            })
          }
          sx={{ minHeight: 48 }}
        >
          Optimize route
        </Button>
        {run.maps_url && (
          <Button
            variant="outlined"
            startIcon={<MapOutlined />}
            href={run.maps_url}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ minHeight: 48 }}
          >
            Open maps
          </Button>
        )}
        <Button
          variant="contained"
          disabled={busy || confirmed.length === 0}
          onClick={() => void mutations.beginRoute.mutateAsync(run.id)}
          sx={{ minHeight: 52 }}
        >
          Start driving
        </Button>
      </Stack>
    </Box>
  );
}
