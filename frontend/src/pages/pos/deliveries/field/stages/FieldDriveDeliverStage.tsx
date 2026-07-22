import { useMemo } from 'react';
import { Alert, Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import type { DeliveryRun } from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import { buildDeliveryDayCards } from '../../../../../components/pos/delivery/dayBoardUtils';
import { DeliveryCardPhaseActions } from '../../../../../components/pos/delivery/DeliveryCardPhaseActions';
import { currentDriveStop, mapsNavigateUrl, telHref } from '../fieldRunUtils';
import type { useFieldPhotoUpload } from '../useFieldPhotoUpload';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;
type Photo = ReturnType<typeof useFieldPhotoUpload>;

type Props = {
  run: DeliveryRun;
  mutations: Mutations;
  photo: Photo;
  busy: boolean;
};

export function FieldDriveDeliverStage({ run, mutations, photo, busy }: Props) {
  const stop = currentDriveStop(run);
  const jobs = useMemo(
    () =>
      (run.stops ?? []).map((s) => ({
        id: s.job_id,
        customer_name: s.customer_name,
        phone: s.phone,
        address: s.address,
        items_delivered: s.items_delivered,
        item_count: s.item_count,
        status: s.job_status,
        availability: run.availability_id,
        scheduled_date: run.date,
        cart: null,
        cart_line: null,
        is_apt: s.is_apt,
        unit: s.unit,
        tier: '',
        fee: '0',
        distance_miles: null,
        distance_mode: '',
        notes: s.notes,
        created_by: null,
      })),
    [run],
  );
  const cards = useMemo(() => buildDeliveryDayCards(jobs, run), [jobs, run]);
  const card = cards.find((c) => c.stop?.id === stop?.id) ?? cards.find((c) => c.is_next_up) ?? null;

  if (!stop || !card) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">No active stop — return to store when route is complete.</Alert>
        <Button
          sx={{ mt: 2, minHeight: 48 }}
          variant="contained"
          disabled={busy}
          onClick={() => void mutations.returnToStore.mutateAsync(run.id)}
        >
          Returned to store
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, pb: 12 }}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="overline">Current stop</Typography>
          <Typography variant="h6" fontWeight={700}>
            {stop.customer_name}
          </Typography>
          <Typography variant="body2">{stop.address}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <Button variant="outlined" href={telHref(stop.phone)} sx={{ minHeight: 44 }}>
              Call
            </Button>
            <Button
              variant="outlined"
              href={mapsNavigateUrl(stop.address)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ minHeight: 44 }}
            >
              Navigate
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ mt: 2 }}>
        <DeliveryCardPhaseActions
          card={card}
          stage="active"
          run={run}
          busy={busy}
          onContactPresent={() => void mutations.contactPresent.mutateAsync({ stopId: stop.id })}
          onMarkDelivered={() => void mutations.delivered.mutateAsync({ stopId: stop.id })}
          onProofPhoto={() => photo.pickPhoto('delivery_proof', { stopId: stop.id })}
          onSaveSignature={async (blob) => {
            const clientPhotoId = crypto.randomUUID();
            const form = new FormData();
            form.append('file', blob, 'signature.jpg');
            form.append('kind', 'signature');
            form.append('client_photo_id', clientPhotoId);
            form.append('stop_id', String(stop.id));
            await mutations.upload.mutateAsync({ runId: run.id, form });
          }}
          onComplete={() => void mutations.complete.mutateAsync({ stopId: stop.id })}
          onCompleteOverride={(reason) =>
            void mutations.complete.mutateAsync({ stopId: stop.id, override: true, override_reason: reason })
          }
        />
      </Box>

      <Button
        fullWidth
        variant="text"
        startIcon={<PhotoCamera />}
        sx={{ mt: 1, minHeight: 44 }}
        onClick={() => photo.pickPhoto('issue', { stopId: stop.id })}
      >
        Report issue photo
      </Button>
    </Box>
  );
}
