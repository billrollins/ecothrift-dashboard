import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Chip, MenuItem, Paper, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import {
  BSTOCK_DISPUTE_STATUSES,
  getBStockDisputes,
  startBStockDispute,
  updateBStockDispute,
  type BStockDisputeDTO,
  type BStockDisputePatch,
  type BStockDisputeStatus,
} from '../../../api/bstockDisputes.api';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { formatCurrency } from '../../../utils/format';
import { activityText, staffPreviewUrl } from './bstockDisputeDisplay';

function errDetail(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;
}

/**
 * B-Stock dispute (E2b): a page in B-Stock's layout (affected lines, pallet photos, truck, BOL, Excel and zip) to
 * link from B-Stock's dispute form, and what B-Stock decided.
 */
export function BStockDisputePanel({ orderId }: { orderId: number }) {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const key = ['bstock-disputes', orderId] as const;
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => (await getBStockDisputes(orderId)).data.disputes,
  });
  const start = useMutation({
    mutationFn: async () => (await startBStockDispute(orderId)).data.disputes,
    onSuccess: (rows) => qc.setQueryData(key, rows),
    onError: (err) => enqueueSnackbar(errDetail(err, 'Could not start the dispute.'), { variant: 'error' }),
  });

  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }}>
          B-Stock dispute
        </Typography>
        <Button variant="outlined" disabled={start.isPending} onClick={() => start.mutate()}>
          {data && data.length > 0 ? 'Start another' : 'Start dispute'}
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Builds one page for B-Stock with every affected line in their layout (item, condition, units, MSRP, UPC), the
        pallet photos, truck photo and BOL, and Excel / zip downloads. Paste its link and the note into B-Stock's dispute
        form. Filing freezes the lines.
      </Typography>
      {(data ?? []).map((d) => (
        <DisputeCard key={d.id} orderId={orderId} dispute={d} />
      ))}
    </Paper>
  );
}

function DisputeCard({ orderId, dispute }: { orderId: number; dispute: BStockDisputeDTO }) {
  const { enqueueSnackbar } = useSnackbar();
  const qc = useQueryClient();
  const [bid, setBid] = useState(dispute.bstock_dispute_id);
  const [note, setNote] = useState(dispute.note || dispute.suggested_note);
  const [refund, setRefund] = useState(dispute.refund_received ?? '');
  const [confirmStatus, setConfirmStatus] = useState<BStockDisputeStatus | null>(null);

  useEffect(() => {
    setBid(dispute.bstock_dispute_id);
    setNote(dispute.note || dispute.suggested_note);
    setRefund(dispute.refund_received ?? '');
  }, [dispute.bstock_dispute_id, dispute.note, dispute.suggested_note, dispute.refund_received]);

  const save = useMutation({
    mutationFn: async (body: BStockDisputePatch) => (await updateBStockDispute(orderId, dispute.id, body)).data,
    onSuccess: (fresh) => {
      qc.setQueryData<BStockDisputeDTO[]>(['bstock-disputes', orderId], (rows) =>
        (rows ?? []).map((r) => (r.id === fresh.id ? fresh : r)),
      );
      setConfirmStatus(null);
      enqueueSnackbar('Saved.', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(errDetail(err, 'Could not save.'), { variant: 'error' }),
  });

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => enqueueSnackbar(`${what} copied.`, { variant: 'success' }),
      () => enqueueSnackbar(`Could not copy the ${what.toLowerCase()}.`, { variant: 'warning' }),
    );
  };

  const t = dispute.totals;
  const dirty =
    bid !== dispute.bstock_dispute_id || note !== (dispute.note || '') || refund !== (dispute.refund_received ?? '');

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: { xs: 1, sm: 1.5 }, mt: 1.5, minWidth: 0 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Chip
          label={dispute.status_label}
          color={dispute.status === 'refunded' ? 'success' : dispute.status === 'draft' ? 'default' : 'primary'}
        />
        <Typography variant="body2">
          {dispute.line_count} lines · {t.claimed_units} units · {formatCurrency(t.claimed_retail)} claimed
          {t.claimed_pct != null ? ` (${t.claimed_pct}% of manifest retail)` : ''}
          {dispute.frozen ? ' · frozen at filing' : ' · live'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <TextField
          select
          size="small"
          label="Status"
          value={dispute.status}
          onChange={(e) => setConfirmStatus(e.target.value as BStockDisputeStatus)}
          sx={{ width: { xs: '100%', sm: 180 } }}
        >
          {BSTOCK_DISPUTE_STATUSES.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1.5 }}>
        <TextField size="small" label="Link for B-Stock" value={dispute.url} InputProps={{ readOnly: true }} sx={{ flex: 1, minWidth: { xs: '100%', sm: 280 } }} />
        <Button onClick={() => copy(dispute.url, 'Link')}>Copy link</Button>
        <Button component="a" href={staffPreviewUrl(dispute.url)} target="_blank" rel="noopener">
          Open
        </Button>
      </Box>

      <TextField
        label="Note for B-Stock (their Additional information box)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        multiline
        minRows={2}
        fullWidth
        size="small"
        sx={{ mb: 1 }}
      />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1 }}>
        <Button size="small" onClick={() => copy(note, 'Note')}>
          Copy note
        </Button>
        <Button size="small" onClick={() => setNote(dispute.suggested_note)}>
          Use suggested note
        </Button>
        <Box sx={{ flex: 1 }} />
        <TextField size="small" label="B-Stock dispute ID" value={bid} onChange={(e) => setBid(e.target.value)} sx={{ width: { xs: '100%', sm: 190 } }} />
        <TextField size="small" label="Refund received $" value={refund} onChange={(e) => setRefund(e.target.value.trim())} sx={{ width: { xs: 'calc(100% - 88px)', sm: 150 } }} />
        <Button
          variant="contained"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate({ bstock_dispute_id: bid, note, refund_received: refund === '' ? null : refund })}
        >
          Save
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Expected back {formatCurrency(dispute.refund_expected)}
        {dispute.filed_at ? ` · filed ${new Date(dispute.filed_at).toLocaleDateString()}` : ''}
        {dispute.closed_at ? ` · closed ${new Date(dispute.closed_at).toLocaleDateString()}` : ''}
      </Typography>
      <Alert severity={dispute.activity.outside_views > 0 ? 'success' : 'info'} sx={{ mt: 1 }}>
        {activityText(dispute.activity)}
      </Alert>

      <ConfirmDialog
        open={confirmStatus != null}
        title={confirmStatus === 'filed' && dispute.status === 'draft' ? 'File this dispute?' : 'Change the status?'}
        message={
          confirmStatus === 'draft'
            ? 'Back to draft: the lines go live again (for a new manifest from B-Stock or a fix on our side).'
            : dispute.status === 'draft'
              ? `This freezes the ${dispute.line_count} lines and totals on B-Stock's page as they are now.`
              : `Set the status to ${BSTOCK_DISPUTE_STATUSES.find((s) => s.value === confirmStatus)?.label ?? ''}.`
        }
        confirmLabel="Yes"
        severity="info"
        loading={save.isPending}
        onConfirm={() => confirmStatus && save.mutate({ status: confirmStatus })}
        onCancel={() => setConfirmStatus(null)}
      />
    </Box>
  );
}
