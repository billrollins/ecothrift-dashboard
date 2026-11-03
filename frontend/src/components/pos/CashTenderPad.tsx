/**
 * The bills and coins the customer hands over (2026-10-21; big tiles 2026-11-02, Bill: "REALLY nice denomination
 * buttons to click with finger and EASY way to adjust a mistake"). Tap a tile for one more; a tapped tile has a wide
 * minus edge that takes one of it off. Undo takes back the last tap, Clear empties it. Keys work while the pad has focus
 * (Q W E R T Y for $100 to $1, A S D F for 25¢ to 1¢; Shift takes one back; Backspace undoes). Dash shows what to give
 * back from what the drawer holds, as pieces.
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import Remove from '@mui/icons-material/Remove';
import { Alert, Box, Button, Chip, Stack, Typography } from '@mui/material';
import {
  CASH_DENOMINATIONS,
  addCounts,
  countCents,
  hasPieces,
  makeChange,
  type CashCount,
  type CashDenomination,
} from '../../utils/cashCounts';
import { tp } from '../../i18n/pos';

function money(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

type Props = {
  received: CashCount;
  onChange: (next: CashCount) => void;
  /** What the cash must meet, in cents (for a split, the cash part is whatever is handed over). */
  dueCents: number;
  /** The drawer's contents by bill and coin, when Dash knows them: change comes from what is there. */
  drawerContents?: CashCount | null;
  /** Split: the cash only covers part, so no change is worked out (unless it covers it all). */
  split?: boolean;
  disabled?: boolean;
  lang?: string | null;
};

/** The pieces to give back, as big read-only chips: "1 × $5", "2 × 25¢". */
export function ChangePieces({ give }: { give: CashCount }) {
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap data-testid="give-back-pieces">
      {CASH_DENOMINATIONS.filter((d) => (give[d.key] ?? 0) > 0).map((d) => (
        <Chip
          key={d.key}
          color="success"
          label={`${give[d.key]} × ${d.label}`}
          sx={{ fontSize: '1.15rem', fontWeight: 800, height: 44, px: 0.5 }}
        />
      ))}
    </Stack>
  );
}

export default function CashTenderPad({ received, onChange, dueCents, drawerContents, split, disabled, lang }: Props) {
  const [history, setHistory] = useState<CashCount[]>([]);
  const padRef = useRef<HTMLDivElement>(null);
  const tendered = countCents(received);
  // A split that the cash covers goes as cash, so its change shows too.
  const asCash = !split || tendered >= dueCents;
  const change = asCash ? Math.max(0, tendered - dueCents) : 0;
  const shortBy = split ? 0 : Math.max(0, dueCents - tendered);
  const known = drawerContents && hasPieces(drawerContents) ? addCounts(drawerContents, received) : undefined;
  const { give, short } = makeChange(change, known);

  const set = (next: CashCount) => {
    setHistory((h) => [...h.slice(-49), received]);
    onChange(next);
  };
  const bump = (d: CashDenomination, by: number) => {
    const n = Math.max(0, (received[d.key] ?? 0) + by);
    if (n === (received[d.key] ?? 0)) return;
    const next = { ...received, [d.key]: n };
    if (!n) delete next[d.key];
    set(next);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (prev === undefined) return;
    setHistory((h) => h.slice(0, -1));
    onChange(prev);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || e.altKey || e.ctrlKey || e.metaKey) return;
    const d = CASH_DENOMINATIONS.find((x) => x.hotkey === e.key.toUpperCase());
    if (d) {
      e.preventDefault();
      bump(d, e.shiftKey ? -1 : 1);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      undo();
    }
  };

  const tile = (d: CashDenomination) => {
    const n = received[d.key] ?? 0;
    return (
      <Box key={d.key} sx={{ position: 'relative' }}>
        <Button
          fullWidth
          variant={n ? 'contained' : 'outlined'}
          color={d.bill ? 'success' : 'primary'}
          disabled={disabled}
          onClick={(e) => bump(d, e.shiftKey ? -1 : 1)}
          onContextMenu={(e) => {
            e.preventDefault();
            bump(d, -1);
          }}
          aria-label={`${d.label}${n ? `, ${n}` : ''}`}
          data-testid={`cash-${d.key}`}
          sx={{
            minHeight: { xs: 72, sm: 84 },
            pl: n ? 6 : 1,
            pr: 1,
            borderWidth: 2,
            '&:hover': { borderWidth: 2 },
            borderRadius: 2,
            flexDirection: 'column',
            textTransform: 'none',
            lineHeight: 1.1,
          }}
        >
          <Typography component="span" fontWeight={800} sx={{ fontSize: { xs: '1.35rem', sm: '1.6rem' } }}>
            {d.label}
          </Typography>
          {n > 0 && (
            <Typography component="span" fontWeight={700} sx={{ fontSize: '1rem', opacity: 0.9 }}>× {n}</Typography>
          )}
        </Button>
        {n > 0 && (
          <Box
            component="button"
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              bump(d, -1);
            }}
            aria-label={`${tp('takeOne', lang)}: ${d.label}`}
            data-testid={`cash-minus-${d.key}`}
            sx={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 48,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 0, borderRight: '1px solid rgba(255,255,255,0.45)', borderRadius: '8px 0 0 8px',
              bgcolor: 'rgba(0,0,0,0.18)', color: 'common.white', cursor: 'pointer', p: 0,
              '&:hover': { bgcolor: 'rgba(0,0,0,0.3)' },
            }}
          >
            <Remove />
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box
      ref={padRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={tp('cashHandedOver', lang)}
      data-testid="cash-tender-pad"
      sx={{ outline: 'none' }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(6, 1fr)' }, gap: 1, mb: 1 }}>
        {CASH_DENOMINATIONS.filter((d) => d.bill).map(tile)}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
        {CASH_DENOMINATIONS.filter((d) => !d.bill).map(tile)}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
        <Button
          variant="outlined"
          size="large"
          color="inherit"
          onClick={undo}
          disabled={disabled || history.length === 0}
          sx={{ flex: 1, minHeight: 52 }}
        >
          {tp('undo', lang)}
        </Button>
        <Button
          variant="outlined"
          size="large"
          color="inherit"
          onClick={() => set({})}
          disabled={disabled || !hasPieces(received)}
          sx={{ flex: 1, minHeight: 52 }}
        >
          {tp('clear', lang)}
        </Button>
      </Stack>

      <Stack spacing={1} sx={{ mt: 2, minHeight: 130 }} data-testid="cash-summary">
        <Typography variant="h6" fontWeight={700}>
          {tp('received', lang)} {money(tendered)}
          {shortBy > 0 && hasPieces(received) ? ` · ${money(shortBy)} ${tp('more', lang)}` : ''}
        </Typography>
        {asCash && change > 0 && (
          <Box data-testid="give-back">
            <Typography variant="h5" color="success.main" fontWeight={800} sx={{ mb: 1 }}>
              {tp('giveBack', lang)} {money(change)}
            </Typography>
            <ChangePieces give={give} />
            {short && <Alert severity="warning" sx={{ mt: 1, py: 0 }}>{tp('drawerShort', lang)}</Alert>}
          </Box>
        )}
        {!split && hasPieces(received) && tendered === dueCents && (
          <Typography variant="h6" color="success.main" fontWeight={800}>{tp('noChange', lang)}</Typography>
        )}
      </Stack>
    </Box>
  );
}
