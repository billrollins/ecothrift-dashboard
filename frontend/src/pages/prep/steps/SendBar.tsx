// Send: hand the prepped truck to Processing for real (Dash #233). One confirm, then the truck is a normal finalized
// truck and Processing opens it as it does after old Preprocessing. A truck is sent once.
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, CircularProgress } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { prepStepsApi } from '../../../api/prepSteps.api';
import { tone } from './tokens';

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function failure(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : 'Send did not go through. Nothing was changed. Try again.';
}

export default function SendBar({ orderId, orderNumber }: { orderId: number; orderNumber: string }) {
  const client = useQueryClient();
  const key = ['prepSteps', 'send', orderId] as const;
  const q = useQuery({ queryKey: key, queryFn: () => prepStepsApi.send(orderId), staleTime: 5_000 });
  const data = q.data;
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const ask = async () => {
    setError('');
    await q.refetch();
    setOpen(true);
  };
  const send = async () => {
    setSending(true);
    setError('');
    try {
      await prepStepsApi.sendNow(orderId);
      await client.invalidateQueries({ queryKey: ['prepSteps'] });
      setOpen(false);
    } catch (err) {
      setError(failure(err));
    } finally {
      setSending(false);
    }
  };
  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.lines, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prep-truck-${orderNumber}-sent-lines.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const sent = data?.sent_at ?? null;
  const blocked = !sent && data?.why_not ? data.why_not : '';
  const lines = data?.would_write ?? 0;
  const news = Math.max(0, lines - (data?.matched ?? 0));

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 1.5, height: 52, border: `1px solid ${tone.line}`, borderRadius: 1, bgcolor: '#fff' }}>
      <Box sx={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>Hand-off to Processing</Box>
      <Box data-testid="send-status" sx={{ flex: 1, minWidth: 0, fontSize: 14, color: tone.inkSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {sent ? `Sent to Processing ${when(sent)}` : blocked}
      </Box>
      <Box sx={{ width: 20 }}>{(q.isFetching || sending) && <CircularProgress size={18} />}</Box>
      {sent ? (
        <Button variant="contained" component={RouterLink} to={`/inventory/processing/${orderId}`} data-testid="send-open-processing">
          Open in Processing
        </Button>
      ) : (
        <Button variant="contained" onClick={() => void ask()} disabled={!data || Boolean(blocked) || q.isFetching} data-testid="send-to-processing">
          Send to Processing
        </Button>
      )}
      <Dialog open={open && !!data && !sent} onClose={sending ? undefined : () => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Send {orderNumber} to Processing?</DialogTitle>
        <DialogContent>
          {data && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.75, fontSize: 15 }}>
              <b>{lines.toLocaleString()}</b><span>lines go to Processing</span>
              <b>{(data.matched ?? 0).toLocaleString()}</b><span>already matched to a product</span>
              <b>{news.toLocaleString()}</b><span>new products, made at check-in</span>
              <b>{(data.no_price ?? 0).toLocaleString()}</b><span>with no price or retail: priced at check-in</span>
            </Box>
          )}
          <Box sx={{ fontSize: 14, color: tone.inkSoft, mt: 2 }}>
            A truck is sent once. After this, changes are made in Processing.
          </Box>
          {/* Always in the window, so the buttons never move when a message shows. */}
          <Box role="alert" data-testid="send-error" sx={{ minHeight: 22, mt: 1.5, fontSize: 14, fontWeight: 700, color: '#b3261e' }}>
            {error}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={download} disabled={sending}>Download the lines</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setOpen(false)} disabled={sending}>Cancel</Button>
          <Button variant="contained" onClick={() => void send()} disabled={sending} data-testid="send-confirm" sx={{ minWidth: 190 }}>
            Send to Processing
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
