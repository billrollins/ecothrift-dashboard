import { useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  TextField,
  Typography,
} from '@mui/material';
import {
  reentryBackToShelf,
  reentryPriceAgain,
  reentryScrap,
  reentrySendToRestoration,
  type ReentryDone,
  type ReentryRow,
} from '../../../api/reentry.api';
import { apiErrorMessage } from '../../../utils/apiError';
import { formatCurrency } from '../../../utils/format';
import { RestorationRequestDialog } from '../restorationRequest/RestorationRequestDialog';
import { EMPTY_REQUEST } from '../restorationRequest/restorationRequest';
import {
  looksLikeItemNumber,
  looksTooHigh,
  priceInput,
  restorationNeedsFrom,
  SCRAP_REASONS,
  scrapReasonFrom,
  soldLine,
  suggestedPrice,
  typedPrice,
} from './reentry';

type Mode = 'price' | 'scrap' | 'restoration' | null;

/** Which item a window is about: its name, number and tag, and why it came back. */
function AboutItem({ row }: { row: ReentryRow }) {
  const item = row.item;
  return (
    <Box sx={{ p: 1.25, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.default' }}>
      <Typography sx={{ fontWeight: 800, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
        {item.product_title || item.sku}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
        {[item.sku, `Tag ${formatCurrency(item.price)}`, item.retail && Number(item.retail) > 0 ? `Retail ${formatCurrency(item.retail)}` : '']
          .filter(Boolean).join(' · ')}
      </Typography>
      {row.sale ? (
        <Typography variant="body2" color="text.secondary">{soldLine(row)}</Typography>
      ) : null}
      {row.reason ? (
        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{`Why: ${row.reason}`}</Typography>
      ) : null}
    </Box>
  );
}

/** Back to shelf as is and Scrap: handed to the list, which waits a few seconds (Undo) before it saves. */
export interface StagedAction {
  row: ReentryRow;
  /** What will happen, in the Done list's words ("Back to shelf as is", "Scrapped: Broken"). */
  what: string;
  save: () => Promise<ReentryDone>;
}

/** One line under a window's box that is always there, so the window never changes height when it has something to say. */
function Hint({ children, tone = 'text.secondary' }: { children: ReactNode; tone?: string }) {
  return (
    <Typography variant="body2" role="status" sx={{ color: tone, minHeight: '2.9em', mt: 0.75 }}>
      {children}
    </Typography>
  );
}

const ACTION_SX = { minHeight: { xs: 44, lg: 36 }, px: { xs: 0.75, sm: 1.5 }, fontSize: { xs: 13, sm: 14 }, whiteSpace: 'nowrap' } as const;

/**
 * The four things a processor can do with an item that came back (a customer return or a floor issue, D15): Price
 * again, Back to shelf as is, Send to Restoration, Scrap. Each one is recorded and takes the item off the list;
 * `onDone` gets the closed row and the item's tag facts (the list prints the tag and refreshes).
 *
 * Back to shelf as is acts on its one tap. The other three open a small window that names the item and asks for
 * the one thing they need, so a row on the list never changes size. What the report or return already says comes in
 * ready (the scrap reason, what Restoration should do, the floor's price). With `onLater`, Back to shelf as is and
 * Scrap go to the list, which gives a few seconds to undo before saving.
 */
export function ReentryActionPanel({
  row,
  onDone,
  onLater,
  onWindowClosed,
}: {
  row: ReentryRow;
  onDone: (done: ReentryDone) => void;
  onLater?: (staged: StagedAction) => void;
  /** A window closed without an action: the list puts the cursor back in the find box. */
  onWindowClosed?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [price, setPrice] = useState('');
  // A scanner typed into the price box: its letters arrive first. Ignore the scan until its Enter, then say so.
  const [scanning, setScanning] = useState(false);
  const [scanSeen, setScanSeen] = useState(false);
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
    setPrice('');
    setScanning(false);
    setScanSeen(false);
    setReason(next === 'scrap' ? scrapReasonFrom(row.reason) : '');
    setReasonScan(false);
    setMode(next);
  }

  // A scanner types a whole tag in a burst; a person types slower. A scan ends at its Enter or a short pause.
  const lastKey = useRef(0);
  function typePrice(raw: string) {
    const now = Date.now();
    const burst = now - lastKey.current < 400;
    lastKey.current = now;
    if (/[a-z]/i.test(raw)) { setScanning(true); setScanSeen(true); return; }
    if (scanning && burst) return;
    setScanning(false);
    setScanSeen(false);
    setPrice(priceInput(raw));
  }

  function endScan() {
    setScanning(false);
    setScanSeen(true);
  }

  // A scanner types a whole tag in a burst ending in Enter; a person types slower. Take a scan back out of the box.
  const burst = useRef<{ at: number; size: number; before: string }>({ at: 0, size: 0, before: '' });
  const [reasonScan, setReasonScan] = useState(false);
  function typeReason(next: string) {
    const now = Date.now();
    const b = burst.current;
    burst.current = now - b.at < 60 ? { at: now, size: b.size + 1, before: b.before } : { at: now, size: 1, before: reason };
    setReasonScan(false);
    setReason(next);
  }
  function reasonEnter(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const b = burst.current;
    if (b.size >= 6 && Date.now() - b.at < 200) {
      setReason(b.before);
      setReasonScan(true);
    }
    burst.current = { at: 0, size: 0, before: '' };
  }

  function backToShelf() {
    if (onLater) onLater({ row, what: 'Back to shelf as is', save: () => reentryBackToShelf(row.id) });
    else void run(() => reentryBackToShelf(row.id));
  }

  function scrap(text: string) {
    if (onLater) {
      setMode(null);
      onLater({ row, what: `Scrapped: ${text}`, save: () => reentryScrap(row.id, text) });
    } else void run(() => reentryScrap(row.id, text));
  }

  const close = () => { if (busy) return; open(null); onWindowClosed?.(); };
  const newPrice = typedPrice(price);
  const tooHigh = looksTooHigh(newPrice, row.item);
  const suggested = suggestedPrice(row);
  const why = reason.trim();
  const savePrice = () => { if (newPrice) void run(() => reentryPriceAgain(row.id, newPrice)); };

  return (
    <Box sx={{ minWidth: 0 }}>
      {/* Four equal buttons: none is the page's advice. On a phone two rows, set well apart, Scrap last. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, max-content)' }, columnGap: { xs: 1.25, sm: 1 }, rowGap: { xs: 2, sm: 1 } }}>
        <Button variant="outlined" disabled={busy} onClick={() => open('price')} aria-label={`Price again: ${name}`} sx={ACTION_SX}>
          Price again
        </Button>
        <Button variant="outlined" disabled={busy} onClick={backToShelf}
          aria-label={`Back to shelf as is: ${name}`} sx={ACTION_SX}>
          Back to shelf as is
        </Button>
        <Button variant="outlined" disabled={busy} onClick={() => open('restoration')} aria-label={`Send to Restoration: ${name}`} sx={ACTION_SX}>
          Send to Restoration
        </Button>
        <Button variant="outlined" color="error" disabled={busy} onClick={() => open('scrap')} aria-label={`Scrap: ${name}`} sx={ACTION_SX}>
          Scrap
        </Button>
      </Box>
      {/* A refused one-tap action (Back to shelf as is) says why under the buttons; the windows say it inside. */}
      {error && mode === null ? <Alert severity="error" onClose={() => setError('')} sx={{ mt: 1 }}>{error}</Alert> : null}

      <Dialog open={mode === 'price'} onClose={close} fullWidth maxWidth="xs" aria-labelledby={`price-again-${row.id}`}>
        <DialogTitle id={`price-again-${row.id}`} sx={{ fontWeight: 800 }}>Price again</DialogTitle>
        <Box
          component="form"
          // Enter saves a normal price. A price far above the tag (a slip, or a scan that landed here) needs the button.
          onSubmit={(e) => { e.preventDefault(); if (scanning) { endScan(); return; } if (!tooHigh) savePrice(); }}
        >
          <DialogContent sx={{ pt: 0 }}>
            <AboutItem row={row} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mt: 2 }}>
              <TextField
                label="New price"
                value={price}
                onChange={(e) => typePrice(e.target.value)}
                // The scan's own Enter: Save may be greyed, so the form never sees it.
                onKeyDown={(e) => { if (e.key === 'Enter' && scanning) { e.preventDefault(); endScan(); } }}
                autoFocus
                disabled={busy}
                sx={{ width: 170 }}
                slotProps={{
                  input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
                  htmlInput: { inputMode: 'decimal', autoComplete: 'off', 'aria-label': `New price for ${name}` },
                }}
              />
              {suggested ? (
                <Chip
                  label={`Use ${formatCurrency(suggested)} (from the floor)`}
                  onClick={() => { setPrice(suggested); setScanning(false); setScanSeen(false); }}
                  disabled={busy}
                  sx={{ height: 40, fontSize: 14 }}
                />
              ) : null}
            </Box>
            {error ? (
              <Hint tone="error.main">{error}</Hint>
            ) : scanning || scanSeen ? (
              <Hint tone="warning.main">That was a tag, not a price. To work on that item, close this window and scan it again.</Hint>
            ) : tooHigh ? (
              <Hint tone="warning.main">{`${formatCurrency(newPrice)} is far above its tag of ${formatCurrency(row.item.price)}. If that is right, tap Save and print tag.`}</Hint>
            ) : price && !newPrice ? (
              <Hint tone="warning.main">Type a price above $0, like 12.99.</Hint>
            ) : newPrice && Number(newPrice) === Number(row.item.price) ? (
              <Hint>{`That is its price now. If nothing changes, Cancel and tap Back to shelf as is. Saving prints a new ${formatCurrency(newPrice)} tag.`}</Hint>
            ) : (
              <Hint>A new tag prints when you save. Put it on the item; the item goes back to the sales floor.</Hint>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={close} disabled={busy} sx={{ minHeight: 44 }}>Cancel</Button>
            {tooHigh ? (
              <Button variant="contained" disabled={busy} onClick={savePrice} sx={{ minHeight: 44, minWidth: 170 }}>{busy ? 'Saving' : 'Save and print tag'}</Button>
            ) : (
              <Button type="submit" variant="contained" disabled={busy || !newPrice} sx={{ minHeight: 44, minWidth: 170 }}>{busy ? 'Saving' : 'Save and print tag'}</Button>
            )}
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={mode === 'scrap'} onClose={close} fullWidth maxWidth="xs" aria-labelledby={`scrap-${row.id}`}>
        <DialogTitle id={`scrap-${row.id}`} sx={{ fontWeight: 800 }}>Scrap</DialogTitle>
        {/* Only the button scraps: Enter does nothing here, so a scan that lands in this window cannot scrap an item. */}
        <Box component="form" onSubmit={(e) => e.preventDefault()}>
          <DialogContent sx={{ pt: 0 }}>
            <AboutItem row={row} />
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 2, mb: 1 }}>Why is it scrapped?</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
              {SCRAP_REASONS.map((r) => (
                <Chip key={r} label={r} color={why === r ? 'error' : 'default'} variant={why === r ? 'filled' : 'outlined'}
                  disabled={busy} onClick={() => setReason(r)} sx={{ height: 44, fontSize: 14, px: 0.5 }} />
              ))}
            </Box>
            <TextField
              fullWidth
              label="Or type the reason"
              value={reason}
              onChange={(e) => typeReason(e.target.value)}
              onKeyDown={reasonEnter}
              disabled={busy}
              slotProps={{ htmlInput: { maxLength: 300, 'aria-label': `Why ${name} is scrapped` } }}
            />
            {error ? (
              <Hint tone="error.main">{error}</Hint>
            ) : (
              <Hint>
                {reasonScan || looksLikeItemNumber(why) ? 'That was a scanned tag, not a reason. To work on that item, close this window and scan it again.'
                  : why ? 'Scrap takes it out of stock. You get a few seconds to undo.' : 'Pick a reason or type one. Scrap takes it out of stock.'}
              </Hint>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
            <Button onClick={close} disabled={busy} sx={{ minHeight: 44 }}>Cancel</Button>
            <Button variant="contained" color="error" disabled={busy || !why || looksLikeItemNumber(why)}
              onClick={() => scrap(why)} sx={{ minHeight: 44, minWidth: 110 }}>
              {busy ? 'Saving' : 'Scrap it'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <RestorationRequestDialog
        open={mode === 'restoration'}
        price={row.item.price}
        initial={{ ...EMPTY_REQUEST, needs: restorationNeedsFrom(row.reason) }}
        busy={busy}
        about={(
          <>
            <AboutItem row={row} />
            <Typography variant="body2" sx={{ mt: 1 }}>
              A restoration tag prints when you send it. Put it on the item and take it to the Restoration shelf.
            </Typography>
            {error ? <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert> : null}
          </>
        )}
        onCancel={close}
        onConfirm={(request) => void run(() => reentrySendToRestoration(row.id, request))}
      />
    </Box>
  );
}
