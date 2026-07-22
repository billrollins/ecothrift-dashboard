import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { DeliveryRun, DeliveryRunStop } from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;

type Props = {
  run: DeliveryRun;
  mutations: Mutations;
  busy: boolean;
  canForceFinish: boolean;
};

function stopsNeedingReconcile(run: DeliveryRun): DeliveryRunStop[] {
  return (run.stops ?? []).filter((s) => s.state !== 'completed' && !s.return_reconciled_at);
}

export function FieldReturnEndDayStage({ run, mutations, busy, canForceFinish }: Props) {
  const pending = stopsNeedingReconcile(run);
  const [stopId, setStopId] = useState(pending[0]?.id ?? 0);
  const [issueCode, setIssueCode] = useState('');
  const [issueNotes, setIssueNotes] = useState('');
  const [unloaded, setUnloaded] = useState(false);
  const [stored, setStored] = useState(false);
  const [forceReason, setForceReason] = useState('');

  const selected = pending.find((s) => s.id === stopId) ?? pending[0];

  return (
    <Box sx={{ p: 2, pb: 12 }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
        Return & finish day
      </Typography>

      {!run.returned_to_store_at && (
        <Button
          fullWidth
          variant="contained"
          sx={{ mb: 2, minHeight: 52 }}
          disabled={busy}
          onClick={() => void mutations.returnToStore.mutateAsync(run.id)}
        >
          Mark returned to store
        </Button>
      )}

      {run.returned_to_store_at && pending.length > 0 && selected && (
        <Stack spacing={1.5}>
          <TextField
            select
            size="small"
            label="Stop to reconcile"
            value={selected.id}
            onChange={(e) => setStopId(Number(e.target.value))}
          >
            {pending.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.customer_name}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Checkbox checked={unloaded} onChange={(e) => setUnloaded(e.target.checked)} />}
            label="Items unloaded"
          />
          <FormControlLabel
            control={<Checkbox checked={stored} onChange={(e) => setStored(e.target.checked)} />}
            label="Items stored"
          />
          <TextField
            select
            size="small"
            label="Issue code"
            value={issueCode}
            onChange={(e) => setIssueCode(e.target.value)}
          >
            {(run.return_issue_codes ?? []).map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Issue notes"
            value={issueNotes}
            onChange={(e) => setIssueNotes(e.target.value)}
          />
          <Button
            variant="contained"
            disabled={busy}
            sx={{ minHeight: 48 }}
            onClick={() =>
              void mutations.returnReconcile.mutateAsync({
                stopId: selected.id,
                unloaded,
                items_stored: stored,
                issue_code: issueCode || undefined,
                issue_notes: issueNotes || undefined,
                reconcile: true,
              })
            }
          >
            Reconcile stop
          </Button>
        </Stack>
      )}

      {run.returned_to_store_at && pending.length === 0 && (
        <Alert severity="success" sx={{ mb: 2 }}>
          All stops reconciled.
        </Alert>
      )}

      {run.can_finish && (
        <Button
          fullWidth
          variant="contained"
          color="success"
          sx={{ mt: 2, minHeight: 52 }}
          disabled={busy}
          onClick={() => void mutations.finish.mutateAsync({ runId: run.id })}
        >
          Finish day
        </Button>
      )}

      {canForceFinish && !run.can_finish && (
        <Stack spacing={1} sx={{ mt: 2 }}>
          <TextField
            size="small"
            label="Force finish reason (manager)"
            value={forceReason}
            onChange={(e) => setForceReason(e.target.value)}
          />
          <Button
            variant="outlined"
            color="warning"
            disabled={busy || forceReason.trim().length < 5}
            onClick={() =>
              void mutations.finish.mutateAsync({ runId: run.id, force: true, reason: forceReason })
            }
          >
            Force finish
          </Button>
        </Stack>
      )}
    </Box>
  );
}
