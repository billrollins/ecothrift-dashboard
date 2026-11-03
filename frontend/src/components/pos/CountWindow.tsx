/**
 * The count window (Retail 4, 2026-11-02): count the drawer by bill and coin, then see how it came out. Blind: what the
 * drawer should hold is shown only after the count is in (the server answers with the check). Full screen on a phone.
 * The opening count uses it; the handover, spot check and closing counts will too.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Close from '@mui/icons-material/Close';
import {
  Box, Button, Dialog, DialogContent, IconButton, Stack, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import CashCountPad from './CashCountPad';
import { countCents, padKeys, type CashCount, type CashKey } from '../../utils/cashCounts';
import type { CountCheck } from '../../types/pos.types';
import { tp } from '../../i18n/pos';

function money(v: string | number): string {
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number.isFinite(n) ? n : 0);
}

/** How the count came out: Right on, or Short / Over, and only the bills and coins that differ. */
export function CountResult({ check, lang, big }: { check: CountCheck; lang?: string | null; big?: boolean }) {
  const off = Number.parseFloat(check.difference_total) || 0;
  const right = Math.abs(off) < 0.005;
  const differ = check.rows.filter((r) => Number.parseFloat(String(r.difference)) !== 0);
  return (
    <Box data-testid="count-result">
      <Typography variant="h4" fontWeight={800} color={right ? 'success.main' : 'error.main'}>
        {right ? tp('rightOn', lang) : `${tp(off > 0 ? 'over' : 'short', lang)} ${money(Math.abs(off))}`}
      </Typography>
      {big ? (
        // The close (Carrie, 2026-11-02, #26): what Dash expected beside what was counted, big.
        <Stack direction="row" spacing={4} sx={{ my: 1.5 }} data-testid="count-side-by-side">
          {([['expected', check.expected_total], ['counted', check.counted_total]] as const).map(([k, v]) => (
            <Box key={k}>
              <Typography variant="body2" color="text.secondary" fontWeight={700}>{tp(k, lang)}</Typography>
              <Typography variant="h5" fontWeight={800}>{money(v)}</Typography>
            </Box>
          ))}
        </Stack>
      ) : (
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {tp('counted', lang)} {money(check.counted_total)} · {tp('shouldHold', lang)} {money(check.expected_total)}
        </Typography>
      )}
      {differ.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 0.75, alignItems: 'baseline' }}>
          {differ.map((r) => {
            const d = Number.parseFloat(String(r.difference));
            const amount = r.key === 'coins' ? money(Math.abs(d)) : String(Math.abs(d));
            return (
              <Box key={r.key} sx={{ display: 'contents' }}>
                <Typography fontWeight={800} fontSize="1.15rem">{r.label}</Typography>
                <Typography fontSize="1.15rem" color="error.main" fontWeight={700}>
                  {tp(d > 0 ? 'over' : 'short', lang)} {amount}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

type Props = {
  open: boolean;
  title: string;
  /** The button's words; the count's total follows ("Open drawer · $137.50"), so a wrong total shows where the
   * finger lands. */
  submitLabel: string;
  onCancel: () => void;
  /** Sends the count; answers the server's check (null when there is nothing to compare with). */
  onSubmit: (count: CashCount) => Promise<CountCheck | null>;
  only?: 'bills' | 'coins';
  /** Only these bills and coins (a spot check). */
  keys?: CashKey[];
  lang?: string | null;
  /** Above the pad (a handover: who takes the drawer). */
  children?: ReactNode;
  /** Something else the count needs before it can be sent (someone picked). */
  ready?: boolean;
  /** The button's words while not ready ("Pick who takes it"). */
  notReadyLabel?: string;
  /** Counted outside the pad (the close's coin counter total), added to the button's total. */
  extraCents?: number;
  /** The answer when it came another way (the close after setting aside sales). */
  result?: CountCheck | null;
  /** Under the result (the close-out guide). */
  after?: ReactNode;
  /** The result with the totals big, side by side (the close). */
  bigResult?: boolean;
  /** What the pad starts with (the owner's office target, to change it). */
  initial?: CashCount;
};

export default function CountWindow({
  open, title, submitLabel, onCancel, onSubmit, only, keys, lang, children, ready = true, notReadyLabel, extraCents = 0,
  result, after, bigResult, initial,
}: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [count, setCount] = useState<CashCount>({});
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<CountCheck | null>(null);
  const inFlight = useRef(false); // a double tap posts once
  const shownCheck = result ?? check;
  // Only what the pad shows counts (a handover counts the bills).
  const shown = only || keys ? padKeys(only, keys) : null;
  const counted: CashCount = shown ? Object.fromEntries(shown.filter((k) => count[k]).map((k) => [k, count[k]])) : count;
  const totalCents = countCents(counted) + extraCents;
  useEffect(() => {
    if (open) {
      setCount(initial ?? {});
      setCheck(null);
    }
  }, [open]);

  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const answer = await onSubmit(counted);
      if (answer) setCheck(answer);
      else onCancel();
    } catch {
      // The caller says what went wrong; the count stays so nothing is counted twice.
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={(_e, reason) => { if (reason !== 'backdropClick' && !busy) onCancel(); }}
      fullScreen={phone}
      maxWidth="sm"
      fullWidth
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      data-testid="count-window"
    >
      <Stack direction="row" alignItems="center" sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        <Typography variant="h5" fontWeight={800} sx={{ flex: 1 }}>{title}</Typography>
        <IconButton onClick={onCancel} aria-label={tp('close', lang)} size="large" disabled={busy}>
          <Close />
        </IconButton>
      </Stack>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        {shownCheck ? (
          <>
            <CountResult check={shownCheck} lang={lang} big={bigResult} />
            {after}
          </>
        ) : (
          <>
            {children}
            <CashCountPad value={count} onChange={setCount} only={only} keys={keys} disabled={busy} lang={lang} />
          </>
        )}
      </DialogContent>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2, pt: 1, position: 'sticky', bottom: 0, bgcolor: 'background.paper' }}>
        {shownCheck ? (
          <Button fullWidth variant="contained" size="large" onClick={onCancel} sx={{ minHeight: 60, fontSize: '1.2rem', fontWeight: 800 }}>
            {tp('done', lang)}
          </Button>
        ) : (
          <Button
            fullWidth variant="contained" color="success" size="large" onClick={() => void submit()} disabled={busy || (totalCents === 0 && !keys) || !ready}
            data-testid="count-submit" sx={{ minHeight: 60, fontSize: '1.2rem', fontWeight: 800 }}
          >
            {!ready && notReadyLabel ? notReadyLabel : `${submitLabel} · ${money(totalCents / 100)}`}
          </Button>
        )}
      </Box>
    </Dialog>
  );
}
