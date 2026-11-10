import { useState } from 'react';
import { Alert, Box, Button, Chip, InputAdornment, Stack, TextField } from '@mui/material';
import {
  reentryBackToShelf,
  reentryPriceAgain,
  reentryScrap,
  reentrySendToRestoration,
  type ReentryDone,
  type ReentryRow,
} from '../../../api/reentry.api';
import { apiErrorMessage } from '../../../utils/apiError';
import { RestorationRequestDialog } from '../restorationRequest/RestorationRequestDialog';
import { SCRAP_REASONS, typedPrice } from './reentry';

type Mode = 'price' | 'scrap' | 'restoration' | null;

/**
 * The four things a processor can do with an item that came back (a customer return or a floor issue, D15): Price
 * again, Back to shelf as is, Send to Restoration, Scrap. Each one is recorded and takes the item off the list;
 * `onDone` gets the closed row and the item's tag facts (the list prints the tag and refreshes).
 */
export function ReentryActionPanel({ row, onDone }: { row: ReentryRow; onDone: (done: ReentryDone) => void }) {
  const [mode, setMode] = useState<Mode>(null);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = row.item.product_title || row.item.sku;

  async function run(action: () => Promise<ReentryDone>) {
    setBusy(true);
    setError('');
    try {
      const done = await action();
      setMode(null);
      onDone(done);
    } catch (err) {
      setError(apiErrorMessage(err, 'That did not save. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  function open(next: Mode) {
    setError('');
    setMode(next);
  }

  const newPrice = typedPrice(price);
  const why = reason.trim();

  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      {mode === null || mode === 'restoration' ? (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          <Button variant="contained" disabled={busy} onClick={() => open('price')} aria-label={`Price again: ${name}`}>
            Price again
          </Button>
          <Button variant="outlined" disabled={busy} onClick={() => void run(() => reentryBackToShelf(row.id))}
            aria-label={`Back to shelf as is: ${name}`}>
            Back to shelf as is
          </Button>
          <Button variant="outlined" disabled={busy} onClick={() => open('restoration')} aria-label={`Send to Restoration: ${name}`}>
            Send to Restoration
          </Button>
          <Button variant="outlined" color="error" disabled={busy} onClick={() => open('scrap')} aria-label={`Scrap: ${name}`}>
            Scrap
          </Button>
        </Box>
      ) : null}

      {mode === 'price' ? (
        <Box
          component="form"
          onSubmit={(e) => { e.preventDefault(); if (newPrice) void run(() => reentryPriceAgain(row.id, newPrice)); }}
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}
        >
          <TextField
            size="small"
            label="New price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            autoFocus
            disabled={busy}
            sx={{ width: 150 }}
            slotProps={{
              input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
              htmlInput: { inputMode: 'decimal', 'aria-label': `New price for ${name}` },
            }}
          />
          <Button type="submit" variant="contained" disabled={busy || !newPrice}>Save and print tag</Button>
          <Button disabled={busy} onClick={() => open(null)}>Cancel</Button>
        </Box>
      ) : null}

      {mode === 'scrap' ? (
        <Box
          component="form"
          onSubmit={(e) => { e.preventDefault(); if (why) void run(() => reentryScrap(row.id, why)); }}
          sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {SCRAP_REASONS.map((r) => (
              <Chip key={r} label={r} size="small" color={why === r ? 'error' : 'default'} disabled={busy}
                onClick={() => setReason(r)} />
            ))}
          </Box>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Why"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              disabled={busy}
              sx={{ flex: 1, minWidth: 200 }}
              slotProps={{ htmlInput: { maxLength: 300, 'aria-label': `Why ${name} is scrapped` } }}
            />
            <Button type="submit" variant="contained" color="error" disabled={busy || !why}>Scrap it</Button>
            <Button disabled={busy} onClick={() => open(null)}>Cancel</Button>
          </Box>
        </Box>
      ) : null}

      <RestorationRequestDialog
        open={mode === 'restoration'}
        price={row.item.price}
        busy={busy}
        onCancel={() => open(null)}
        onConfirm={(request) => void run(() => reentrySendToRestoration(row.id, request))}
      />

      {error ? <Alert severity="error" onClose={() => setError('')}>{error}</Alert> : null}
    </Stack>
  );
}
