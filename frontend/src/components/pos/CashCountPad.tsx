/**
 * Counting a drawer by bill and coin (Retail 4, 2026-11-02): one big row per bill and coin, − / the number / +, the
 * row's dollars, and the total. Finger-sized on the register's touch screen and a phone; the number can be typed too.
 * Shared by the opening, handover, spot check and closing counts. Each name wears its note's colour (2026-11-03); the
 * oddballs ($2 bill, 50¢, $1 coin) sit behind one Oddballs row at the end that opens them in a pop-up.
 */
import { useState } from 'react';
import Add from '@mui/icons-material/Add';
import Remove from '@mui/icons-material/Remove';
import { Box, Button, IconButton, InputBase, Popover, Stack, Typography } from '@mui/material';
import CashLabel from './CashLabel';
import {
  CASH_DENOMINATIONS, countCents, padKeys, type CashCount, type CashDenomination, type CashKey,
} from '../../utils/cashCounts';
import { tp } from '../../i18n/pos';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

type Props = {
  value: CashCount;
  onChange: (next: CashCount) => void;
  /** Only the bills (a handover) or only the coins. */
  only?: 'bills' | 'coins';
  /** Only these bills and coins (a spot check counts what changed). */
  keys?: CashKey[];
  disabled?: boolean;
  lang?: string | null;
};

export default function CashCountPad({ value, onChange, only, keys, disabled, lang }: Props) {
  const [oddAt, setOddAt] = useState<HTMLElement | null>(null);
  const counts = padKeys(only, keys);
  const shown = CASH_DENOMINATIONS.filter((d) => counts.includes(d.key));
  const odd = shown.filter((d) => d.odd);
  const oddCount = odd.reduce((sum, d) => sum + (value[d.key] ?? 0), 0);
  const oddCents = countCents(Object.fromEntries(odd.map((d) => [d.key, value[d.key] ?? 0])) as CashCount);
  const set = (key: CashKey, n: number) => {
    const next = { ...value, [key]: Math.max(0, Math.min(99999, Math.floor(n) || 0)) };
    if (!next[key]) delete next[key];
    onChange(next);
  };
  const total = countCents(Object.fromEntries(shown.map((d) => [d.key, value[d.key] ?? 0])) as CashCount);

  const row = (d: CashDenomination) => {
    const n = value[d.key] ?? 0;
    return (
      <Stack key={d.key} direction="row" alignItems="center" spacing={1} sx={{ py: 0.75 }}>
        <Box sx={{ width: 76, flexShrink: 0 }}>
          <CashLabel k={d.key} label={d.label} sx={{ fontSize: d.odd ? '1rem' : '1.2rem' }} />
        </Box>
        <IconButton
          aria-label={`− ${d.label}`}
          onClick={() => set(d.key, n - 1)}
          disabled={disabled || n === 0}
          sx={{ width: 48, height: 48, border: 1, borderColor: 'divider' }}
        >
          <Remove />
        </IconButton>
        <InputBase
          value={n ? String(n) : ''}
          placeholder="0"
          onChange={(e) => set(d.key, Number.parseInt(e.target.value.replace(/\D/g, ''), 10))}
          onFocus={(e) => e.target.select()}
          disabled={disabled}
          inputProps={{ inputMode: 'numeric', 'aria-label': d.label, 'data-testid': `count-${d.key}` }}
          sx={{
            width: 72, height: 48, border: 1, borderColor: 'divider', borderRadius: 1,
            '& input': { textAlign: 'center', fontSize: '1.3rem', fontWeight: 700 },
          }}
        />
        <IconButton
          aria-label={`+ ${d.label}`}
          onClick={() => set(d.key, n + 1)}
          disabled={disabled}
          sx={{ width: 48, height: 48, border: 1, borderColor: 'divider' }}
        >
          <Add />
        </IconButton>
        <Typography sx={{ flex: 1, textAlign: 'right', color: n ? 'text.primary' : 'text.disabled' }}>
          {money(n * d.cents)}
        </Typography>
      </Stack>
    );
  };

  return (
    <Box data-testid="cash-count-pad">
      <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
        {shown.filter((d) => !d.odd).map(row)}
        {odd.length > 0 && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 0.75 }}>
            <Button
              variant="outlined"
              color="inherit"
              onClick={(e) => setOddAt(e.currentTarget)}
              disabled={disabled}
              aria-haspopup="dialog"
              data-testid="count-oddballs"
              sx={{
                minHeight: 48, textTransform: 'none', fontWeight: 800, fontSize: '1.1rem', whiteSpace: 'nowrap',
                borderWidth: oddCount ? 2 : 1, bgcolor: oddCount ? 'action.selected' : undefined,
              }}
            >
              {tp('oddballs', lang)}{oddCount ? ` × ${oddCount}` : ''}
            </Button>
            <Typography sx={{ flex: 1, textAlign: 'right', color: oddCents ? 'text.primary' : 'text.disabled' }}>
              {money(oddCents)}
            </Typography>
          </Stack>
        )}
      </Stack>
      <Popover
        open={Boolean(oddAt)}
        anchorEl={oddAt}
        onClose={() => setOddAt(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { px: 1.5, py: 1, width: { xs: 'calc(100vw - 32px)', sm: 400 }, maxWidth: 400 } } }}
      >
        <Box data-testid="count-oddballs-pop">
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>{odd.map(row)}</Stack>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{tp('oddballsNote', lang)}</Typography>
            <Button variant="contained" size="large" onClick={() => setOddAt(null)} sx={{ minHeight: 48, minWidth: 96 }}>
              {tp('done', lang)}
            </Button>
          </Stack>
        </Box>
      </Popover>
      <Stack direction="row" justifyContent="space-between" sx={{ borderTop: 2, borderColor: 'divider', pt: 1, mt: 0.5 }}>
        <Typography variant="h6" fontWeight={800}>{tp('total', lang)}</Typography>
        <Typography variant="h6" fontWeight={800} data-testid="count-total">{money(total)}</Typography>
      </Stack>
    </Box>
  );
}
