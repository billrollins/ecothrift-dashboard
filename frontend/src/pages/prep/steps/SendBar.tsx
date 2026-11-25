// Send: a dry run of the hand-off to Processing. Shows exactly what each line would carry; writes nothing.
import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, CircularProgress } from '@mui/material';
import { prepStepsApi, type SendDryRun } from '../../../api/prepSteps.api';
import { tone } from './tokens';

export default function SendBar({ orderId, orderNumber }: { orderId: number; orderNumber: string }) {
  const [data, setData] = useState<SendDryRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const d = await prepStepsApi.send(orderId);
      setData(d);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };
  const download = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data.lines, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prep-a-${orderNumber}-handoff.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 1.5, height: 52, border: `1px solid ${tone.line}`, borderRadius: 1, bgcolor: '#fff' }}>
      <Box sx={{ fontWeight: 800, fontSize: 14 }}>Hand-off to Processing</Box>
      <Box sx={{ flex: 1 }} />
      <Box sx={{ width: 20 }}>{loading && <CircularProgress size={18} />}</Box>
      <Button variant="contained" onClick={load} disabled={loading} data-testid="send-dry-run">Send to Processing (dry run)</Button>
      <Dialog open={open && !!data} onClose={() => setOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Dry run: nothing was written</DialogTitle>
        <DialogContent>
          {data && (
            <>
              <Box sx={{ display: 'flex', gap: 4, fontSize: 15, mb: 2 }}>
                <span>Would write <b>{data.would_write.toLocaleString()}</b> lines</span>
                <span><b>{data.matched.toLocaleString()}</b> matched (is)</span>
                <span><b>{data.like.toLocaleString()}</b> like</span>
                <span><b>{data.drafts.toLocaleString()}</b> product drafts</span>
                <span><b>{data.priced.toLocaleString()}</b> priced</span>
                <span>Written: <b>{data.written}</b></span>
              </Box>
              <Box component="pre" sx={{ fontSize: 12, bgcolor: tone.head, p: 1.5, borderRadius: 1, maxHeight: '55vh', overflow: 'auto', m: 0 }}>
                {JSON.stringify(data.lines.slice(0, 25), null, 2)}
              </Box>
              <Box sx={{ fontSize: 12, color: tone.inkSoft, mt: 1 }}>First 25 lines shown; the file has all {data.lines.length.toLocaleString()}.</Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={download}>Download JSON</Button>
          <Button variant="contained" onClick={() => setOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
