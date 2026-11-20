import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  TextField,
  Typography,
} from '@mui/material';
import {
  PROVIDER_LABEL,
  testAiImage,
  testAiModel,
  type AiCatalogModel,
} from '../../../api/aiSettings.api';
import { formatApiError } from '../labelStudio/labelStudioUtils';
import { usd } from './aiFormat';

interface Answer {
  state: 'waiting' | 'done' | 'failed';
  text?: string;
  image?: string;
  seconds?: number;
  detail?: string;
  cost?: string | null;
  error?: string;
}

/**
 * Try several models at once: one message (or picture prompt) goes to every picked model side by side, and each
 * card shows the answer, how long it took and what it cost. Text models answer; image models draw.
 */
export function AiTryDialog({ models, onClose }: { models: AiCatalogModel[]; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const busy = Object.values(answers).some((a) => a.state === 'waiting');
  const images = models.some((m) => m.modality === 'image');
  const texts = models.some((m) => m.modality === 'text');

  const put = (id: number, a: Answer) => setAnswers((prev) => ({ ...prev, [id]: a }));

  const send = () => {
    const text = message.trim();
    if (!text) return;
    setAnswers(Object.fromEntries(models.map((m) => [m.id, { state: 'waiting' } as Answer])));
    models.forEach((m) => {
      if (m.modality === 'image') {
        testAiImage(m.id, text)
          .then((r) => put(m.id, { state: 'done', image: r.image, seconds: r.seconds, cost: r.cost }))
          .catch((err) => put(m.id, { state: 'failed', error: formatApiError(err, 'No picture.') }));
        return;
      }
      testAiModel(m.id, text)
        .then((r) => {
          const cost = r.input_cost != null && r.output_cost != null ? String(Number(r.input_cost) + Number(r.output_cost)) : null;
          put(m.id, { state: 'done', text: r.text, seconds: r.seconds, cost,
            detail: `${r.input_tokens.toLocaleString()} in · ${r.output_tokens.toLocaleString()} out` });
        })
        .catch((err) => put(m.id, { state: 'failed', error: formatApiError(err, 'No answer.') }));
    });
  };

  const columns = models.length <= 1 ? 1 : models.length === 2 || models.length === 4 ? 2 : 3;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={columns === 1 ? 'sm' : columns === 2 ? 'md' : 'lg'}>
      <DialogTitle>Try {models.length} model{models.length === 1 ? '' : 's'}</DialogTitle>
      <DialogContent>
        <TextField
          label={images && !texts ? 'What to draw' : images ? 'Message (image models draw it)' : 'Message'}
          multiline
          minRows={2}
          fullWidth
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
          sx={{ mt: 1, mb: 2 }}
        />
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: `repeat(${columns}, minmax(0, 1fr))` } }}>
          {models.map((m) => {
            const a = answers[m.id];
            return (
              <Card key={m.id} variant="outlined">
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Typography variant="subtitle2" noWrap>
                    {m.label || m.slug}{' '}
                    <Typography component="span" variant="caption" color="text.secondary">{PROVIDER_LABEL[m.provider]}</Typography>
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ minHeight: 20 }}>
                    {a?.state === 'done'
                      ? [`${a.seconds}s`, a.detail, a.cost != null ? usd(a.cost) : 'cost unknown (set the price)'].filter(Boolean).join(' · ')
                      : ' '}
                  </Typography>
                  <Box sx={{ height: 4, my: 0.5 }}>{a?.state === 'waiting' ? <LinearProgress /> : null}</Box>
                  {a?.state === 'failed' && <Typography variant="body2" color="error">{a.error}</Typography>}
                  {a?.image && (
                    <Box component="img" src={a.image} alt={`${m.slug}: ${message}`} sx={{ width: '100%', borderRadius: 1, display: 'block' }} />
                  )}
                  {a?.text != null && (
                    <Box sx={{ whiteSpace: 'pre-wrap', fontSize: 14, maxHeight: 360, overflow: 'auto', bgcolor: 'action.hover', p: 1, borderRadius: 1 }}>
                      {a.text}
                    </Box>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={send} disabled={busy || !message.trim()}>Send</Button>
      </DialogActions>
    </Dialog>
  );
}
