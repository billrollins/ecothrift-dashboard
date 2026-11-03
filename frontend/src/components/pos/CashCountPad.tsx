/**
 * Counting a drawer by bill and coin (Retail 4, 2026-11-02): one big row per bill and coin, − / the number / +, the
 * row's dollars, and the total. Finger-sized on the register's touch screen and a phone; the number can be typed too.
 * Shared by the opening, handover, spot check and closing counts.
 */
import Add from '@mui/icons-material/Add';
import Remove from '@mui/icons-material/Remove';
import { Box, IconButton, InputBase, Stack, Typography } from '@mui/material';
import { CASH_DENOMINATIONS, countCents, type CashCount, type CashKey } from '../../utils/cashCounts';
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
  const shown = CASH_DENOMINATIONS.filter(
    (d) => (!only || (only === 'bills') === d.bill) && (!keys || keys.includes(d.key)),
  );
  const set = (key: CashKey, n: number) => {
    const next = { ...value, [key]: Math.max(0, Math.min(99999, Math.floor(n) || 0)) };
    if (!next[key]) delete next[key];
    onChange(next);
  };
  const total = countCents(Object.fromEntries(shown.map((d) => [d.key, value[d.key] ?? 0])) as CashCount);

  return (
    <Box data-testid="cash-count-pad">
      <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
        {shown.map((d) => {
          const n = value[d.key] ?? 0;
          return (
            <Stack key={d.key} direction="row" alignItems="center" spacing={1} sx={{ py: 0.75 }}>
              <Typography sx={{ width: 64, fontWeight: 800, fontSize: '1.3rem' }}>{d.label}</Typography>
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
        })}
      </Stack>
      <Stack direction="row" justifyContent="space-between" sx={{ borderTop: 2, borderColor: 'divider', pt: 1, mt: 0.5 }}>
        <Typography variant="h6" fontWeight={800}>{tp('total', lang)}</Typography>
        <Typography variant="h6" fontWeight={800} data-testid="count-total">{money(total)}</Typography>
      </Stack>
    </Box>
  );
}
