import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import LocalPhone from '@mui/icons-material/LocalPhone';
import SmsOutlined from '@mui/icons-material/SmsOutlined';
import type { DeliveryRun, DeliveryRunStop } from '../../../../../types/pos.types';
import type { useFieldDeliveryRunMutations } from '../../../../../hooks/useFieldDeliveryRun';
import { interpolateTemplateTokens } from '../../../../../components/pos/delivery/driverWizardUtils';
import {
  DISPOSITION_LABELS,
  smsComposerUrl,
  telHref,
  unconfirmedStops,
} from '../fieldRunUtils';

type Mutations = ReturnType<typeof useFieldDeliveryRunMutations>;

type Props = {
  run: DeliveryRun;
  mutations: Mutations;
  busy: boolean;
};

function contactQueue(run: DeliveryRun): DeliveryRunStop[] {
  return (run.stops ?? []).filter(
    (s) =>
      s.needs_call_again ||
      !s.has_call_result ||
      (!s.is_confirmed && !s.excluded_unconfirmed),
  );
}

export function FieldContactStage({ run, mutations, busy }: Props) {
  const queue = useMemo(() => contactQueue(run), [run]);
  const [index, setIndex] = useState(0);
  const stop = queue[index] ?? queue[0] ?? null;
  const [disposition, setDisposition] = useState('');
  const [note, setNote] = useState('');
  const [excludeReason, setExcludeReason] = useState('');

  if (!stop) {
    return (
      <Alert severity="success" sx={{ m: 2 }}>
        All contact work recorded. Continue when ready to load.
      </Alert>
    );
  }

  const template = stop.text_templates?.[0];
  const smsBody = template
    ? interpolateTemplateTokens(template.body, { name: stop.customer_name, date: run.date })
    : `Hi ${stop.customer_name}, confirming your EcoThrift delivery today.`;

  const recordAttempt = async (channel: 'call' | 'text', action: string) => {
    await mutations.contactAttempt.mutateAsync({ stopId: stop.id, channel, action, note });
  };

  const saveDisposition = async () => {
    if (!disposition) return;
    await mutations.disposition.mutateAsync({ stopId: stop.id, disposition, note });
    setDisposition('');
    setNote('');
    setIndex((i) => Math.min(i + 1, Math.max(queue.length - 1, 0)));
  };

  return (
    <Box sx={{ p: 2, pb: 12 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Contact {index + 1} of {queue.length}
      </Typography>
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Typography fontWeight={700}>{stop.customer_name}</Typography>
            {stop.is_confirmed && <Chip size="small" color="success" label="Confirmed" />}
            {stop.excluded_unconfirmed && <Chip size="small" label="Excluded" />}
          </Stack>
          <Typography variant="body2">{stop.phone}</Typography>
          <Typography variant="body2" color="text.secondary">
            {stop.address}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            {stop.item_count} items · {stop.items_delivered}
          </Typography>

          <Stack direction="row" spacing={1} sx={{ mt: 2 }} useFlexGap flexWrap="wrap">
            <Button
              variant="outlined"
              startIcon={<LocalPhone />}
              href={telHref(stop.phone)}
              onClick={() => void recordAttempt('call', 'call_placed')}
              sx={{ minHeight: 44 }}
            >
              Call
            </Button>
            <Button
              variant="outlined"
              startIcon={<SmsOutlined />}
              href={smsComposerUrl(stop.phone, smsBody)}
              onClick={() => void recordAttempt('text', 'composer_opened')}
              sx={{ minHeight: 44 }}
            >
              Text
            </Button>
            <Button
              variant="text"
              onClick={() => void recordAttempt('text', 'text_marked_sent')}
              disabled={busy}
              sx={{ minHeight: 44 }}
            >
              Mark text sent
            </Button>
          </Stack>

          <TextField
            select
            fullWidth
            size="small"
            label="Disposition"
            value={disposition}
            onChange={(e) => setDisposition(e.target.value)}
            sx={{ mt: 2 }}
          >
            {(run.contact_dispositions ?? []).map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label || DISPOSITION_LABELS[opt.value] || opt.value}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            size="small"
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            sx={{ mt: 1 }}
          />
          <Button
            fullWidth
            variant="contained"
            sx={{ mt: 2, minHeight: 48 }}
            disabled={busy || !disposition}
            onClick={() => void saveDisposition()}
          >
            Save disposition
          </Button>

          {(disposition === 'reschedule_requested' || disposition === 'cancel_requested') && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Use Desk or legacy board for audited reschedule/cancel — disposition is recorded here.
            </Alert>
          )}

          {!stop.is_confirmed && (
            <Stack spacing={1} sx={{ mt: 2 }}>
              <TextField
                size="small"
                label="Exclude unconfirmed reason"
                value={excludeReason}
                onChange={(e) => setExcludeReason(e.target.value)}
              />
              <Button
                variant="outlined"
                color="warning"
                disabled={busy || excludeReason.trim().length < 3}
                onClick={() =>
                  void mutations.excludeUnconfirmed.mutateAsync({
                    stopId: stop.id,
                    reason: excludeReason,
                  })
                }
              >
                Exclude from route
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      {unconfirmedStops(run).length > 0 && (
        <Alert severity="warning" sx={{ mt: 2 }}>
          {unconfirmedStops(run).length} stop(s) still unconfirmed — you may load items while waiting.
        </Alert>
      )}
    </Box>
  );
}
