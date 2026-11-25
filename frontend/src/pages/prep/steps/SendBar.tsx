// Send: hand the prepped truck to Processing for real (Dash #233). The button shows what will be written first (the
// preview writes nothing), then one confirm sends it and the truck is a normal finalized truck in Processing.
// A sent truck says so, with a button into Processing, and can be sent again or taken back (Undo send) while nothing
// on it is checked in; after that both are closed and the bar says why.
//
// The bar keeps one height and its buttons keep their places in every state, and a failure shows in the window's own
// message line, so nothing on the page moves.
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { prepStepsApi, type PrepRun, type PrepState, type SendPreview } from '../../../api/prepSteps.api';
import { money, tone } from './tokens';

const SHOWN = 25;

function failure(err: unknown, what: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' && detail ? detail : `${what} did not go through. Nothing was changed. Try again.`;
}

function when(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const n = (v: number) => v.toLocaleString();
const lines = (v: number) => `${n(v)} line${v === 1 ? '' : 's'}`;
const right = { textAlign: 'right !important' } as const;

function productWords(l: SendPreview['lines'][number]): string {
  const m = l.product_match;
  if (!m) return 'New product';
  return `${m.kind === 'is' ? 'Is' : 'Like'} ${m.number || `#${m.product_id}`}`;
}

export default function SendBar({ run, onState }: { run: PrepRun; onState: (s: PrepState) => void }) {
  const { enqueueSnackbar } = useSnackbar();
  const orderId = run.order_id;
  const state = run.send;
  const sent = !!state?.sent;
  const rows = state?.rows ?? 0;
  const closed = state?.blocked || '';
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const [dialog, setDialog] = useState<'send' | 'undo' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      setPreview(await prepStepsApi.send(orderId));
      setDialog('send');
    } catch (err) {
      enqueueSnackbar(failure(err, 'The preview'), { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const s = await prepStepsApi.sendNow(orderId);
      onState(s);
      setDialog(null);
      const ruled = s.send.priced_by_rule ? ` ${lines(s.send.priced_by_rule)} priced by the truck rule.` : '';
      enqueueSnackbar(`${s.send.again ? 'Sent again' : 'Sent'}: ${lines(s.send.written)} in Processing.${ruled}`, { variant: 'success' });
    } catch (err) {
      setError(failure(err, 'Send'));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    setBusy(true);
    setError('');
    try {
      const s = await prepStepsApi.undoSend(orderId);
      onState(s);
      setDialog(null);
      enqueueSnackbar(`Send undone: ${n(s.undo_send.removed)} row${s.undo_send.removed === 1 ? '' : 's'} taken out of Processing.`, { variant: 'success' });
    } catch (err) {
      setError(failure(err, 'Undo send'));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!preview) return;
    const blob = new Blob([JSON.stringify(preview.lines, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prep-truck-${run.order_number}-sent-lines.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const status = closed || (sent ? `Sent to Processing ${when(state?.sent_at ?? null)} · ${n(rows)} rows` : '');
  const total = preview?.would_write ?? 0;
  const close = () => {
    if (!busy) setDialog(null);
  };
  // Always in the window, so the buttons never move when a message shows.
  const message = (
    <Box role="alert" data-testid="send-error" sx={{ minHeight: 22, mt: 1.5, fontSize: 14, fontWeight: 700, color: tone.bad }}>
      {error}
    </Box>
  );

  return (
    <Box
      data-testid="send-bar"
      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 1.5, height: 52, border: `1px solid ${tone.line}`, borderRadius: 1, bgcolor: '#fff', minWidth: 0 }}
    >
      <Box sx={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>Hand-off to Processing</Box>
      <Box
        data-testid="send-status"
        title={status}
        sx={{
          flex: 1, minWidth: 0, fontSize: 14, fontWeight: closed ? 700 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          color: closed ? tone.bad : tone.inkSoft,
        }}
      >
        {status}
      </Box>
      <Box sx={{ width: 20, flexShrink: 0, display: 'flex' }}>{busy && <CircularProgress size={18} />}</Box>
      <Button
        variant="outlined"
        color="inherit"
        disabled={busy || !!closed}
        onClick={() => { setError(''); setDialog('undo'); }}
        data-testid="undo-send"
        sx={{ flexShrink: 0, visibility: sent ? 'visible' : 'hidden' }}
      >
        Undo send
      </Button>
      <Button
        variant={sent ? 'outlined' : 'contained'}
        onClick={() => void ask()}
        disabled={busy || !!closed}
        data-testid="send-to-processing"
        sx={{ flexShrink: 0, width: 190 }}
      >
        {sent ? 'Send again' : 'Send to Processing'}
      </Button>
      <Button
        component={RouterLink}
        to={state?.processing_url || `/inventory/processing/${orderId}`}
        variant="contained"
        data-testid="send-open-processing"
        sx={{ flexShrink: 0, visibility: sent ? 'visible' : 'hidden' }}
      >
        Open in Processing
      </Button>

      <Dialog open={dialog === 'send' && !!preview} onClose={close} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {sent ? `Send ${run.order_number} again? It replaces the ${n(rows)} rows in Processing.` : `Send ${run.order_number} to Processing?`}
        </DialogTitle>
        <DialogContent>
          {preview && (
            <>
              <Box
                data-testid="send-counts"
                sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5, fontSize: 15, mb: 1.5 }}
              >
                <b>{n(total)}</b><span>lines go to Processing</span>
                <b>{n(preview.matched)}</b><span>already matched to a product</span>
                <b>{n(Math.max(0, total - preview.matched))}</b>
                <span>new products, made at check-in ({n(preview.like)} look like a product we have)</span>
                <b>{n(preview.open.no_price)}</b><span>with no price: the truck rule prices them</span>
                <b>{n(preview.open.no_retail)}</b><span>with no price or retail: priced at check-in</span>
                <b>{n(preview.open.lines)}</b><span>still open in a step: they go as they are</span>
              </Box>
              <Box sx={{ border: `1px solid ${tone.line}`, borderRadius: 1, maxHeight: '40vh', overflow: 'auto' }}>
                <Box
                  component="table"
                  sx={{
                    width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed',
                    '& th, & td': { px: 1, py: 0.5, borderBottom: `1px solid ${tone.lineSoft}`, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
                    '& th': { position: 'sticky', top: 0, bgcolor: tone.head, fontWeight: 800 },
                  }}
                >
                  <colgroup>
                    <col style={{ width: 48 }} /><col /><col style={{ width: 130 }} /><col style={{ width: '24%' }} />
                    <col style={{ width: 52 }} /><col style={{ width: 52 }} /><col style={{ width: 92 }} /><col style={{ width: 92 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>#</th><th>Title</th><th>Product</th><th>Category</th>
                      <Box component="th" sx={right}>Qty</Box>
                      <Box component="th" sx={right}>Tags</Box>
                      <Box component="th" sx={right}>Retail</Box>
                      <Box component="th" sx={right}>Price</Box>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.slice(0, SHOWN).map((l) => (
                      <tr key={l.row_number}>
                        <td>{l.row_number}</td>
                        <td title={l.title}>{l.title}</td>
                        <td>{productWords(l)}</td>
                        <td>{[l.category, l.subcategory].filter(Boolean).join(' > ')}</td>
                        <Box component="td" sx={right}>{n(l.qty)}</Box>
                        <Box component="td" sx={right}>{n(l.pieces)}</Box>
                        <Box component="td" sx={right}>{money(l.retail)}</Box>
                        <Box component="td" sx={{ ...right, fontWeight: 700 }}>{l.price ? money(l.price) : ''}</Box>
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
              <Box sx={{ fontSize: 12, color: tone.inkSoft, mt: 1 }}>
                {preview.lines.length > SHOWN ? `First ${SHOWN} of ${n(preview.lines.length)} lines.` : `All ${n(preview.lines.length)} lines.`}
              </Box>
            </>
          )}
          {message}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={download} disabled={busy}>Download the lines</Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={() => void send()} disabled={busy} data-testid="send-confirm" sx={{ minWidth: 190 }}>
            {sent ? 'Send again' : 'Send to Processing'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialog === 'undo'} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Undo send?</DialogTitle>
        <DialogContent sx={{ fontSize: 15 }}>
          Takes the {n(rows)} rows of {run.order_number} out of Processing. The prep here stays as it is.
          {message}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => void undo()} disabled={busy} data-testid="undo-send-confirm">Undo send</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
