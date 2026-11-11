import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { reportReentry, type ReentryFound } from '../../../api/reentry.api';
import { PageHeader } from '../../../components/common/PageHeader';
import { apiErrorMessage } from '../../../utils/apiError';
import { ReentryList } from './ReentryList';
import { ReentrySteps } from './ReentrySteps';
import { SOURCE_WORDS } from './reentry';

const STEPS = [
  'Scan the tag of the item in your hand.',
  'Look it over: is it clean, whole and working?',
  'Tap one of its four buttons. The line under the find box says where the item goes. A slip? Back to shelf as is and Scrap give you a few seconds to undo.',
];

/** A real item in hand that is not on the list (it came back without a return at the register): add it. */
function AddReturn({ found, say }: { found: ReentryFound; say: (text: string) => void }) {
  const queryClient = useQueryClient();
  const item = found.item;
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Already handled once: adding it again records a second return, so it takes one deliberate tap to open.
  const [opened, setOpened] = useState(!found.last);

  async function add() {
    setBusy(true);
    setError('');
    try {
      const row = await reportReentry(item.sku, 'return', why.trim());
      await queryClient.invalidateQueries({ queryKey: ['reentries'] });
      void queryClient.invalidateQueries({ queryKey: ['reentry-find'] });
      const name = `${item.product_title || item.sku} (${item.sku})`;
      say(row.source === 'return' ? `${name} is on Returns now. Pick what happens to it.` : `${name} is waiting on ${SOURCE_WORDS[row.source].page}.`);
    } catch (err) {
      setError(apiErrorMessage(err, 'That did not save. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  if (!opened) {
    return (
      <Button variant="text" size="small" onClick={() => setOpened(true)} sx={{ mt: 0.5, px: 0, textTransform: 'none' }}>
        A customer brought it back again
      </Button>
    );
  }

  return (
    <Box
      component="form"
      onSubmit={(e) => { e.preventDefault(); void add(); }}
      sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 520 }}
    >
      <Typography variant="body2">
        {found.last ? 'A new return of the same item: add it to Returns.' : 'Did a customer bring it back? Add it to Returns.'}
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
        <Button type="submit" variant="contained" disabled={busy} sx={{ minHeight: 40 }}>Add to Returns</Button>
      </Box>
      {error ? <Alert severity="error">{error}</Alert> : null}
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
      <PageHeader title="Returns" subtitle="Items customers brought back. Each one needs one decision." dense />
      <ReentrySteps steps={STEPS} />
      <ReentryList source="return" offer={(found, say) => <AddReturn key={found.item.sku} found={found} say={say} />} />
    </Box>
  );
}
