import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import type { DeliveryRun } from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import { unconfirmedStops } from '../fieldRunUtils';
import type { useFieldPhotoUpload } from '../useFieldPhotoUpload';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;
type Photo = ReturnType<typeof useFieldPhotoUpload>;

type Props = {
  run: DeliveryRun;
  mutations: Mutations;
  photo: Photo;
  busy: boolean;
  canOverride: boolean;
};

export function FieldTruckCloseStage({ run, mutations, photo, busy, canOverride }: Props) {
  const [overrideReason, setOverrideReason] = useState('');
  const blockers: string[] = [];
  const load = run.monitor?.load;
  if (load && !load.all_ready && !run.departure_override) {
    blockers.push(`${load.total_items - load.ready} item(s) not ready to load`);
  }
  if ((run.truck_photo_count ?? 0) < 1) {
    blockers.push('Closed-door truck photo required');
  }
  const unresolved = unconfirmedStops(run);
  if (unresolved.length > 0 && !run.all_stops_resolved) {
    blockers.push(`${unresolved.length} stop(s) need contact resolution or exclusion`);
  }

  return (
    <Box sx={{ p: 2, pb: 12 }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
        Close truck
      </Typography>
      {run.truck_closed ? (
        <Alert severity="success">Truck closed — proceed to route review.</Alert>
      ) : (
        <>
          {blockers.length > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Blockers before departure:
              <List dense>
                {blockers.map((b) => (
                  <ListItem key={b} disableGutters>
                    <ListItemText primary={b} />
                  </ListItem>
                ))}
              </List>
            </Alert>
          )}
          <Stack spacing={1}>
            <Button
              variant="outlined"
              startIcon={<PhotoCamera />}
              onClick={() => photo.pickPhoto('truck')}
              sx={{ minHeight: 48 }}
            >
              Truck photo ({run.truck_photo_count}/{run.max_truck_photos})
            </Button>
            <Button
              variant="contained"
              disabled={busy || blockers.length > 0}
              onClick={() => void mutations.closeTruck.mutateAsync(run.id)}
              sx={{ minHeight: 52 }}
            >
              Close truck door
            </Button>
            {canOverride && (
              <>
                <TextField
                  size="small"
                  label="Manager override reason"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
                <Button
                  variant="outlined"
                  color="warning"
                  disabled={busy || overrideReason.trim().length < 5}
                  onClick={() =>
                    void mutations.departureOverride.mutateAsync({
                      runId: run.id,
                      reason: overrideReason,
                    })
                  }
                >
                  Manager departure override
                </Button>
              </>
            )}
          </Stack>
        </>
      )}
    </Box>
  );
}
