import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import type { DeliveryRun } from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import { flattenStopItemsQueue, nextIncompleteLoadItem } from '../fieldRunUtils';
import type { useFieldPhotoUpload } from '../useFieldPhotoUpload';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;
type Photo = ReturnType<typeof useFieldPhotoUpload>;

type Props = {
  run: DeliveryRun;
  mutations: Mutations;
  photo: Photo;
  busy: boolean;
};

export function FieldLoadStage({ run, mutations, photo, busy }: Props) {
  const queue = useMemo(() => flattenStopItemsQueue(run), [run]);
  const current = nextIncompleteLoadItem(run) ?? queue[0] ?? null;
  const [sku, setSku] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const load = run.monitor?.load;
  const progress = load && load.total_items > 0 ? (load.ready / load.total_items) * 100 : 0;

  if (!current) {
    return (
      <Alert severity="success" sx={{ m: 2 }}>
        All items loaded and photographed.
      </Alert>
    );
  }

  const { item, stop } = current;

  return (
    <Box sx={{ p: 2, pb: 12 }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Item load progress
        </Typography>
        <Typography variant="body2">
          {load?.ready ?? 0}/{load?.total_items ?? queue.length}
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={progress} sx={{ mb: 2, height: 8, borderRadius: 1 }} />

      <Card variant="outlined">
        <CardContent>
          <Typography variant="overline" color="text.secondary">
            {stop.customer_name}
          </Typography>
          <Typography variant="h6" fontWeight={700}>
            {item.description}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            SKU {item.sku || '—'} · Qty {item.quantity}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip
              size="small"
              label={item.is_verified ? 'Verified' : 'Needs scan'}
              color={item.is_verified ? 'success' : 'warning'}
            />
            <Chip
              size="small"
              label={item.has_load_photo || item.photo_exception ? 'Photo OK' : 'Needs photo'}
              color={item.has_load_photo || item.photo_exception ? 'success' : 'warning'}
            />
            {item.loaded_at && <Chip size="small" label="Loaded" color="success" />}
          </Stack>

          {item.is_scannable && !item.is_verified && !item.verification_skipped && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <TextField
                size="small"
                label="Scan or enter SKU"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && sku.trim()) {
                    void mutations.scanItem.mutateAsync({ itemId: item.id, scanned_code: sku.trim() });
                    setSku('');
                  }
                }}
              />
              <Button
                variant="contained"
                disabled={busy || !sku.trim()}
                onClick={() => {
                  void mutations.scanItem.mutateAsync({ itemId: item.id, scanned_code: sku.trim() });
                  setSku('');
                }}
                sx={{ minHeight: 48 }}
              >
                Verify scan
              </Button>
              <TextField
                size="small"
                label="Skip verification reason"
                value={skipReason}
                onChange={(e) => setSkipReason(e.target.value)}
              />
              <Button
                variant="outlined"
                color="warning"
                disabled={busy || skipReason.trim().length < 3}
                onClick={() =>
                  void mutations.skipItem.mutateAsync({ itemId: item.id, reason: skipReason })
                }
              >
                Skip verification (audited)
              </Button>
            </Stack>
          )}

          {(item.is_verified || item.verification_skipped) && !item.has_load_photo && !item.photo_exception && (
            <Button
              fullWidth
              variant="contained"
              startIcon={<PhotoCamera />}
              sx={{ mt: 2, minHeight: 48 }}
              onClick={() => photo.pickPhoto('load_item', { stopItemId: item.id, stopId: stop.id })}
            >
              Take in-truck photo
            </Button>
          )}

          {(item.has_load_photo || item.photo_exception) && !item.loaded_at && (
            <Button
              fullWidth
              variant="contained"
              color="success"
              sx={{ mt: 2, minHeight: 48 }}
              disabled={busy}
              onClick={() => void mutations.loadItem.mutateAsync({ itemId: item.id, loaded: true })}
            >
              Mark item loaded
            </Button>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
