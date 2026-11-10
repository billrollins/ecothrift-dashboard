import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { reportReentry } from '../../../api/reentry.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { apiErrorMessage } from '../../../utils/apiError';
import { skuFromScan } from '../../../utils/scanCode';
import { ReentryList } from './ReentryList';
import { SOURCE_WORDS } from './reentry';

const STEPS = [
  'Find the item: scan its tag.',
  'Look it over: is it clean, whole and working?',
  'Pick one: Price again, Back to shelf as is, Send to Restoration, or Scrap.',
  'Put it where it goes. It leaves this list.',
];

/** An item in hand that is not on the list (it came back without a return at the register): add it. */
function AddReturn({ typed }: { typed: string }) {
  const queryClient = useQueryClient();
  const sku = skuFromScan(typed).trim();
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ severity: 'error' | 'info'; text: string } | null>(null);

  async function add() {
    setBusy(true);
    setNote(null);
    try {
      const row = await reportReentry(sku, 'return', why.trim());
      if (row.source !== 'return') setNote({ severity: 'info', text: `This one is waiting on ${SOURCE_WORDS[row.source].page}.` });
      await queryClient.invalidateQueries({ queryKey: ['reentries'] });
    } catch (err) {
      setNote({ severity: 'error', text: apiErrorMessage(err, 'That did not save. Try again.') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      component="form"
      onSubmit={(e) => { e.preventDefault(); if (sku) void add(); }}
      sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 520 }}
    >
      <Typography variant="body2">
        {`Is ${sku} a return in your hand? Add it here.`}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <TextField
          size="small"
          label="Why it came back (optional)"
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          disabled={busy}
          sx={{ flex: 1, minWidth: 200 }}
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
        <Button type="submit" variant="contained" disabled={busy || !sku}>Add to Returns</Button>
      </Box>
      {note ? <Alert severity={note.severity}>{note.text}</Alert> : null}
    </Box>
  );
}

/**
 * Processing > Returns (Dash Updates #83, Bill 2026-11-10): every item a customer brought back, with the simple steps
 * and the four one-tap actions. A return at the register puts its items here by itself; the list and the actions are
 * the shared ones (`ReentryList`), which Floor issues uses too.
 */
export default function ProcessingReturnsPage() {
  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, width: '100%', minWidth: 0, maxWidth: 1200, mx: 'auto' }}>
      <PageHeader title="Returns" subtitle="Items customers brought back. Pick what happens to each one." dense />
      <Paper variant="outlined" sx={{ p: 1.5, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 0.5 }}>The steps</Typography>
        <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
          {STEPS.map((step) => (
            <Typography key={step} component="li" variant="body2">{step}</Typography>
          ))}
        </Box>
      </Paper>
      <ReentryList source="return" notOnList={(typed) => <AddReturn typed={typed} />} />
    </Box>
  );
}
