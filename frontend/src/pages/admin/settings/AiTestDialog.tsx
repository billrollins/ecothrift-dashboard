import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { testAiModel, type AiCatalogModel, type AiTestResult } from '../../../api/aiSettings.api';
import { formatApiError } from '../labelStudio/labelStudioUtils';

function usd(v: string | null): string {
  if (v == null) return 'unknown (set the price)';
  const n = Number(v);
  return n < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(4)}`;
}

/** Settings > AI: send one message to a model and see the answer, how long it took, and what it cost. */
export function AiTestDialog({ open, onClose, models, initialModelId = null }: {
  open: boolean; onClose: () => void; models: AiCatalogModel[]; initialModelId?: number | null;
}) {
  const textModels = models.filter((m) => m.status === 'active' && m.modality === 'text');
  const [modelId, setModelId] = useState<number | ''>(initialModelId ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);
  const [error, setError] = useState('');
  const chosen = modelId === '' ? textModels[0]?.id ?? '' : modelId;

  async function send() {
    if (typeof chosen !== 'number' || !message.trim()) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await testAiModel(chosen, message.trim()));
    } catch (err) {
      setError(formatApiError(err, 'The test failed.'));
    } finally {
      setBusy(false);
    }
  }

  const total = result && result.input_cost != null && result.output_cost != null
    ? String(Number(result.input_cost) + Number(result.output_cost)) : null;
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Test a model</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 1 }}>
          <TextField select size="small" label="Model" value={chosen} onChange={(e) => setModelId(Number(e.target.value))}>
            {textModels.map((m) => <MenuItem key={m.id} value={m.id}>{m.label || m.slug}</MenuItem>)}
          </TextField>
          <TextField label="Say something" multiline minRows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          {busy ? <LinearProgress /> : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          {result ? (
            <Box>
              <Typography variant="caption" color="text.secondary">
                {result.model_used} · {result.seconds}s · in {result.input_tokens} tokens {usd(result.input_cost)} · out{' '}
                {result.output_tokens} tokens {usd(result.output_cost)}{total != null ? ` · total ${usd(total)}` : ''}
              </Typography>
              <Box sx={{ mt: 0.5, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>
                {result.text}
              </Box>
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => void send()} disabled={busy || typeof chosen !== 'number' || !message.trim()}>Send</Button>
      </DialogActions>
    </Dialog>
  );
}
