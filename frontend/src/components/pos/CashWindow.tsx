/**
 * The cash window (2026-11-02, Bill: "CASH pops up a modal ... then once done it will tell you exact change to give
 * out"). Cash and Split open it; full screen on a phone. Complete lives here. Split is cash then card: the cash part is
 * tapped here, then "Card for $X" goes on to the card step; cash that covers it all completes as cash. Closing it
 * leaves the sale as it was.
 */
import Close from '@mui/icons-material/Close';
import {
  Box, Button, Dialog, DialogContent, IconButton, Stack, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import CashTenderPad from './CashTenderPad';
import { countCents, type CashCount } from '../../utils/cashCounts';
import { tp } from '../../i18n/pos';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

type Props = {
  open: boolean;
  mode: 'cash' | 'split';
  dueCents: number;
  received: CashCount;
  onReceived: (next: CashCount) => void;
  /** Typed instead of tapped: the amount as typed, and the switch. */
  typed: string;
  onTyped: (value: string) => void;
  typeMode: boolean;
  onTypeMode: (on: boolean) => void;
  drawerContents?: CashCount | null;
  pending?: boolean;
  lang?: string | null;
  onCancel: () => void;
  /** The cash covers it: finish as a cash sale. */
  onComplete: () => void;
  /** Split: the cash part is set; go on to the card for the rest. */
  onCard: () => void;
  onShowDrawer: () => void;
};

export default function CashWindow({
  open, mode, dueCents, received, onReceived, typed, onTyped, typeMode, onTypeMode, drawerContents, pending, lang,
  onCancel, onComplete, onCard, onShowDrawer,
}: Props) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const split = mode === 'split';
  const tendered = typeMode ? Math.round((parseFloat(typed) || 0) * 100) : countCents(received);
  const covers = tendered >= dueCents && tendered > 0;
  const cardCents = Math.max(0, dueCents - tendered);

  const footer = (() => {
    if (!split || covers) {
      return (
        <Button
          fullWidth variant="contained" color="success" size="large" onClick={onComplete}
          disabled={pending || !covers} data-testid="cash-complete"
          sx={{ minHeight: 64, fontSize: '1.3rem', fontWeight: 800 }}
        >
          {split ? tp('completeAsCash', lang) : tp('complete', lang)}
        </Button>
      );
    }
    return (
      <Button
        fullWidth variant="contained" color="info" size="large" onClick={onCard}
        disabled={pending || tendered <= 0} data-testid="cash-card-rest"
        sx={{ minHeight: 64, fontSize: '1.3rem', fontWeight: 800 }}
      >
        {tp('cardFor', lang)} {money(cardCents)}
      </Button>
    );
  })();

  return (
    <Dialog
      open={open}
      // A stray tap beside the window never loses the count: only X or Esc closes it.
      onClose={(_e, reason) => { if (reason !== 'backdropClick') onCancel(); }}
      fullScreen={phone} maxWidth="md" fullWidth data-testid="cash-window"
      // Pinned to the top: the tiles never move under a finger as the change line comes and goes.
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" fontWeight={700}>
            {split ? tp('splitCashFirst', lang) : tp('cash', lang)}
          </Typography>
          <Typography variant="h4" fontWeight={800} data-testid="cash-due">
            {tp('due', lang)} {money(dueCents)}
          </Typography>
        </Box>
        <Button onClick={onShowDrawer} sx={{ textTransform: 'none', fontWeight: 700 }} data-testid="cash-show-drawer">
          {tp('drawer', lang)}
        </Button>
        <IconButton onClick={onCancel} aria-label={tp('close', lang)} size="large">
          <Close />
        </IconButton>
      </Stack>
      <DialogContent sx={{ px: { xs: 2, sm: 3 } }}>
        {typeMode ? (
          <Box>
            <TextField
              autoFocus fullWidth type="number" label={tp('cashHandedOver', lang)} value={typed}
              onChange={(e) => onTyped(e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, step: 0.01, inputMode: 'decimal' }, sx: { fontSize: '1.6rem' } } }}
            />
            <Typography variant="h6" fontWeight={700} sx={{ mt: 2 }}>
              {tp('received', lang)} {money(tendered)}
              {!split && tendered > 0 && tendered < dueCents ? ` · ${money(dueCents - tendered)} ${tp('more', lang)}` : ''}
            </Typography>
            {covers && tendered > dueCents && (
              <Typography variant="h5" color="success.main" fontWeight={800} sx={{ mt: 1 }}>
                {tp('giveBack', lang)} {money(tendered - dueCents)}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{tp('typedNote', lang)}</Typography>
          </Box>
        ) : (
          <CashTenderPad
            received={received}
            onChange={onReceived}
            dueCents={dueCents}
            drawerContents={drawerContents}
            split={split}
            disabled={pending}
            lang={lang}
          />
        )}
        <Button
          size="small" onClick={() => onTypeMode(!typeMode)} sx={{ mt: 1, minHeight: 44, textTransform: 'none' }}
          data-testid="cash-type-toggle"
        >
          {typeMode ? tp('tapBills', lang) : tp('typeAmount', lang)}
        </Button>
      </DialogContent>
      <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2, pt: 1, position: 'sticky', bottom: 0, bgcolor: 'background.paper' }}>
        {footer}
      </Box>
    </Dialog>
  );
}
