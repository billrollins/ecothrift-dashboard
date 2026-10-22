/**
 * The bills and coins the customer hands over (2026-10-21, digest point 3): tap each one (touch or mouse), or press its
 * key while the pad has focus (Q W E R T Y for $100 to $1, A S D F for 25¢ to 1¢; Shift takes one back). Dash shows
 * what to give back from what the drawer holds: "Give back: 1 × $5, 2 × quarters".
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import {
  CASH_DENOMINATIONS,
  addCounts,
  countCents,
  describeCount,
  hasPieces,
  makeChange,
  type CashCount,
  type CashDenomination,
} from '../../utils/cashCounts';

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
  /** Split: the cash only covers part, so no change is worked out. */
  split?: boolean;
  disabled?: boolean;
};

export default function CashTenderPad({ received, onChange, dueCents, drawerContents, split, disabled }: Props) {
  const [history, setHistory] = useState<CashCount[]>([]);
  const padRef = useRef<HTMLDivElement>(null);
  const tendered = countCents(received);
  const change = split ? 0 : Math.max(0, tendered - dueCents);
  const shortBy = split ? 0 : Math.max(0, dueCents - tendered);
  const known = drawerContents && hasPieces(drawerContents) ? addCounts(drawerContents, received) : undefined;
  const { give, short } = makeChange(change, known);

  const set = (next: CashCount) => {
    setHistory((h) => [...h.slice(-49), received]);
    onChange(next);
  };
  const bump = (d: CashDenomination, by: number) => {
    const n = Math.max(0, (received[d.key] ?? 0) + by);
    const next = { ...received, [d.key]: n };
    if (!n) delete next[d.key];
    set(next);
  };
  const exact = () => set(makeChange(dueCents).give);
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
      <Button
        key={d.key}
        variant={n ? 'contained' : 'outlined'}
        color={d.bill ? 'success' : 'primary'}
        disabled={disabled}
        onClick={(e) => bump(d, e.shiftKey ? -1 : 1)}
        onContextMenu={(e) => {
          e.preventDefault();
          bump(d, -1);
        }}
        aria-label={`${d.label}${n ? `, ${n} handed over` : ''}. Key ${d.hotkey}`}
        data-testid={`cash-${d.key}`}
        sx={{ minHeight: 56, flexDirection: 'column', textTransform: 'none', lineHeight: 1.1, px: 0.5 }}
      >
        <Typography component="span" fontWeight={800} fontSize="1.05rem">{d.label}</Typography>
        <Typography component="span" variant="caption" sx={{ opacity: 0.8 }}>
          {n ? `× ${n}` : d.hotkey}
        </Typography>
      </Button>
    );
  };

  return (
    <Box
      ref={padRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClick={() => padRef.current?.focus({ preventScroll: true })}
      aria-label="Cash handed over: tap each bill and coin"
      data-testid="cash-tender-pad"
      sx={{ outline: 'none', borderRadius: 1, '&:focus-visible': { boxShadow: (t) => `0 0 0 2px ${t.palette.primary.main}` } }}
    >
      <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>Cash handed over</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 0.75, mb: 0.75 }}>
        {CASH_DENOMINATIONS.filter((d) => d.bill).map(tile)}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 0.75 }}>
        {CASH_DENOMINATIONS.filter((d) => !d.bill).map(tile)}
      </Box>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
        {!split && (
          <Button size="small" variant="outlined" onClick={exact} disabled={disabled || dueCents <= 0}>
            Exact cash
          </Button>
        )}
        <Button size="small" onClick={undo} disabled={disabled || history.length === 0}>Undo</Button>
        <Button size="small" onClick={() => set({})} disabled={disabled || !hasPieces(received)}>Clear</Button>
      </Stack>

      <Stack spacing={0.5} sx={{ mt: 1.5 }} data-testid="cash-summary">
        <Typography fontWeight={700}>
          Received {money(tendered)}
          {!split && shortBy > 0 && hasPieces(received) ? ` · ${money(shortBy)} more needed` : ''}
        </Typography>
        {!split && change > 0 && (
          <Typography variant="h6" color="success.main" fontWeight={800} data-testid="give-back">
            Change {money(change)}: give back {describeCount(give)}
          </Typography>
        )}
        {!split && change > 0 && short && (
          <Alert severity="warning" sx={{ py: 0 }}>
            The drawer may not have these. Give the same amount from what it has.
          </Alert>
        )}
      </Stack>
    </Box>
  );
}
